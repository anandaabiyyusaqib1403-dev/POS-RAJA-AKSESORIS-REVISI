  alter type public.metode_bayar add value if not exists 'cash';
  alter type public.metode_bayar add value if not exists 'dana';
  alter type public.metode_bayar add value if not exists 'bank_mas';
  alter type public.metode_bayar add value if not exists 'wahana';
  alter type public.metode_bayar add value if not exists 'pasar_kuota';
  alter type public.metode_bayar add value if not exists 'shopee';
  alter type public.metode_bayar add value if not exists 'bca';
  alter type public.metode_bayar add value if not exists 'split';

  alter type public.nama_platform add value if not exists 'cash';
  alter type public.nama_platform add value if not exists 'bank_mas';
  alter type public.nama_platform add value if not exists 'wahana';
  alter type public.nama_platform add value if not exists 'pasar_kuota';
  alter type public.nama_platform add value if not exists 'shopee';
  alter type public.nama_platform add value if not exists 'qris';

  alter table public.transaksi
    add column if not exists payments jsonb not null default '[]'::jsonb;

  alter table public.produk
    add column if not exists aktif boolean default true;

  alter table public.transaksi_dompet
    add column if not exists source_type text,
    add column if not exists source_id uuid,
    add column if not exists source_ref text;

  create index if not exists idx_transaksi_dompet_source
  on public.transaksi_dompet (source_type, source_id);

  create or replace function public.pos_wallet_balance(p_platform public.nama_platform)
  returns integer
  language sql
  stable
  security definer
  set search_path = public
  as $$
    select coalesce(sum(
      case
        when platform = p_platform and jenis = 'masuk'::public.jenis_dompet_trx
          then greatest(nominal - biaya_admin, 0)
        when platform = p_platform and jenis = 'keluar'::public.jenis_dompet_trx
          then -(nominal + biaya_admin)
        when platform = p_platform and jenis in (
          'tarik_tunai'::public.jenis_dompet_trx,
          'transfer_antar'::public.jenis_dompet_trx
        )
          then -(nominal + biaya_admin)
        when platform_tujuan = p_platform and jenis in (
          'tarik_tunai'::public.jenis_dompet_trx,
          'transfer_antar'::public.jenis_dompet_trx
        )
          then greatest(nominal - biaya_admin, 0)
        else 0
      end
    ), 0)::integer
    from public.transaksi_dompet;
  $$;

  create or replace function public.pos_assert_wallet_balance(
    p_platform public.nama_platform,
    p_amount integer
  )
  returns void
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_balance integer;
  begin
    if p_platform is null or coalesce(p_amount, 0) <= 0 then
      return;
    end if;

    if p_platform::text in ('cash', 'qris') then
      return;
    end if;

    perform pg_advisory_xact_lock(hashtext('wallet:' || p_platform::text)::bigint);
    v_balance := public.pos_wallet_balance(p_platform);

    if v_balance = 0 then
      raise exception 'Saldo 0. Isi saldo manual terlebih dahulu agar transaksi dapat divalidasi.';
    end if;

    if v_balance < p_amount then
      raise exception 'Saldo tidak mencukupi, silakan isi saldo terlebih dahulu';
    end if;
  end;
  $$;

  create or replace function public.pos_insert_wallet_movement(
    p_kasir_id uuid,
    p_platform public.nama_platform,
    p_jenis public.jenis_dompet_trx,
    p_nominal integer,
    p_biaya_admin integer default 0,
    p_platform_tujuan public.nama_platform default null,
    p_keterangan text default null,
    p_source_type text default null,
    p_source_id uuid default null,
    p_source_ref text default null,
    p_created_at timestamptz default now()
  )
  returns uuid
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_id uuid := gen_random_uuid();
  begin
    if p_platform is null or coalesce(p_nominal, 0) <= 0 then
      return null;
    end if;

    if coalesce(p_biaya_admin, 0) < 0 then
      raise exception 'Biaya admin tidak boleh negatif.';
    end if;

    if p_jenis = 'masuk'::public.jenis_dompet_trx and coalesce(p_biaya_admin, 0) > p_nominal then
      raise exception 'Biaya admin tidak boleh lebih besar dari nominal masuk.';
    end if;

    if p_jenis in ('keluar'::public.jenis_dompet_trx, 'tarik_tunai'::public.jenis_dompet_trx, 'transfer_antar'::public.jenis_dompet_trx) then
      perform public.pos_assert_wallet_balance(p_platform, p_nominal + coalesce(p_biaya_admin, 0));
    else
      perform pg_advisory_xact_lock(hashtext('wallet:' || p_platform::text)::bigint);
    end if;

    insert into public.transaksi_dompet (
      id,
      kasir_id,
      platform,
      jenis,
      platform_tujuan,
      nominal,
      biaya_admin,
      keterangan,
      source_type,
      source_id,
      source_ref,
      created_at
    )
    values (
      v_id,
      p_kasir_id,
      p_platform,
      p_jenis,
      p_platform_tujuan,
      p_nominal,
      coalesce(p_biaya_admin, 0),
      p_keterangan,
      p_source_type,
      p_source_id,
      p_source_ref,
      coalesce(p_created_at, now())
    );

    return v_id;
  end;
  $$;

  create or replace function public.create_wallet_transaction_atomic(p_transaction jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_user_id uuid := auth.uid();
    v_role public.user_role := public.current_user_role();
    v_kasir_id uuid := coalesce(nullif(p_transaction->>'kasir_id', '')::uuid, v_user_id);
    v_platform public.nama_platform := (p_transaction->>'platform')::public.nama_platform;
    v_jenis public.jenis_dompet_trx := (p_transaction->>'jenis')::public.jenis_dompet_trx;
    v_platform_tujuan public.nama_platform := nullif(p_transaction->>'platform_tujuan', '')::public.nama_platform;
    v_nominal integer := coalesce((p_transaction->>'nominal')::numeric::integer, 0);
    v_biaya_admin integer := coalesce((p_transaction->>'biaya_admin')::numeric::integer, 0);
    v_id uuid;
    v_result jsonb;
  begin
    if v_user_id is null then
      raise exception 'User belum login.';
    end if;

    if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
      raise exception 'Kasir tidak berwenang menyimpan mutasi saldo ini.';
    end if;

    if v_nominal <= 0 then
      raise exception 'Nominal mutasi harus lebih besar dari 0.';
    end if;

    if v_jenis = 'transfer_antar'::public.jenis_dompet_trx then
      if v_platform_tujuan is null then
        raise exception 'Pilih tujuan transfer wallet.';
      end if;

      if v_platform = v_platform_tujuan then
        raise exception 'Wallet asal dan tujuan tidak boleh sama.';
      end if;
    end if;

    v_id := public.pos_insert_wallet_movement(
      v_kasir_id,
      v_platform,
      v_jenis,
      v_nominal,
      v_biaya_admin,
      v_platform_tujuan,
      p_transaction->>'keterangan',
      p_transaction->>'source_type',
      nullif(p_transaction->>'source_id', '')::uuid,
      p_transaction->>'source_ref',
      nullif(p_transaction->>'created_at', '')::timestamptz
    );

    v_result := (
      select to_jsonb(wallet_row)
      from public.transaksi_dompet as wallet_row
      where wallet_row.id = v_id
    );

    return v_result;
  end;
  $$;

  create or replace function public.create_accessory_transaction_atomic(
    p_transaction jsonb,
    p_items jsonb
  )
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_user_id uuid := auth.uid();
    v_role public.user_role := public.current_user_role();
    v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
    v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
    v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
    v_no_transaksi text := p_transaction->>'no_transaksi';
    v_method public.metode_bayar := coalesce(nullif(p_transaction->>'metode_bayar', ''), 'cash')::public.metode_bayar;
    v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
    v_total integer := coalesce((p_transaction->>'total_bayar')::numeric::integer, 0);
    v_uang_diterima integer := coalesce((p_transaction->>'uang_diterima')::numeric::integer, v_total);
    v_kembalian integer := coalesce((p_transaction->>'kembalian')::numeric::integer, 0);
    v_payments jsonb := p_transaction->'payments';
    v_payment jsonb;
    v_payment_method text;
    v_payment_amount integer;
    v_payment_total integer := 0;
    v_item jsonb;
    v_produk public.produk%rowtype;
    v_qty integer;
    v_harga_satuan integer;
    v_subtotal integer;
    v_items_total integer := 0;
    v_result jsonb;
  begin
    if v_user_id is null then
      raise exception 'User belum login.';
    end if;

    if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
      raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
    end if;

    perform 1
    from public.shifts s
    where s.id = v_shift_id
      and s.cashier_id = v_kasir_id
      and s.status = 'active'::public.shift_status
    for update;

    if not found then
      raise exception 'Mulai shift dulu sebelum menyimpan transaksi.';
    end if;

    if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Keranjang masih kosong.';
    end if;

    if jsonb_typeof(v_payments) <> 'array' or jsonb_array_length(v_payments) = 0 then
      v_payments := jsonb_build_array(
        jsonb_build_object('method', v_method::text, 'amount', v_total)
      );
    end if;

    for v_payment in select value from jsonb_array_elements(v_payments)
    loop
      v_payment_method := coalesce(nullif(v_payment->>'method', ''), v_method::text);
      v_payment_amount := coalesce((v_payment->>'amount')::numeric::integer, 0);

      if v_payment_amount <= 0 then
        raise exception 'Nominal pembayaran harus lebih besar dari 0.';
      end if;

      perform v_payment_method::public.nama_platform;
      v_payment_total := v_payment_total + v_payment_amount;
    end loop;

    if v_payment_total <> v_total then
      raise exception 'Total pembayaran harus sama dengan total transaksi.';
    end if;

    insert into public.transaksi (
      id,
      kasir_id,
      shift_id,
      no_transaksi,
      total_bayar,
      uang_diterima,
      kembalian,
      metode_bayar,
      payments,
      catatan,
      created_at
    )
    values (
      v_transaction_id,
      v_kasir_id,
      v_shift_id,
      v_no_transaksi,
      v_total,
      v_uang_diterima,
      v_kembalian,
      v_method,
      v_payments,
      p_transaction->>'catatan',
      v_created_at
    );

    for v_item in select value from jsonb_array_elements(p_items)
    loop
      v_qty := coalesce((v_item->>'qty')::numeric::integer, 0);
      v_harga_satuan := coalesce((v_item->>'harga_satuan')::numeric::integer, 0);
      v_subtotal := coalesce((v_item->>'subtotal')::numeric::integer, 0);

      if v_qty <= 0 then
        raise exception 'Qty item transaksi harus lebih besar dari 0.';
      end if;

      if v_harga_satuan < 0 or v_subtotal <> v_qty * v_harga_satuan then
        raise exception 'Subtotal item transaksi tidak valid.';
      end if;

      select *
      into v_produk
      from public.produk
      where id = (v_item->>'produk_id')::uuid
      for update;

      if not found then
        raise exception 'Produk tidak ditemukan.';
      end if;

      if coalesce(v_produk.aktif, true) is false then
        raise exception 'Produk % tidak aktif.', v_produk.nama;
      end if;

      if v_produk.stok < v_qty then
        raise exception 'Stok % tidak cukup. Sisa stok %.', v_produk.nama, v_produk.stok;
      end if;

      insert into public.item_transaksi (
        id,
        transaksi_id,
        produk_id,
        nama_produk,
        qty,
        harga_satuan,
        subtotal
      )
      values (
        coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()),
        v_transaction_id,
        v_produk.id,
        coalesce(nullif(v_item->>'nama_produk', ''), v_produk.nama),
        v_qty,
        v_harga_satuan,
        v_subtotal
      );

      update public.produk
      set stok = stok - v_qty
      where id = v_produk.id;

      insert into public.stok_mutasi (
        produk_id,
        tipe,
        jumlah,
        stok_sebelum,
        stok_sesudah,
        referensi,
        catatan,
        created_at
      )
      values (
        v_produk.id,
        'keluar'::public.stock_mutation_type,
        -v_qty,
        v_produk.stok,
        v_produk.stok - v_qty,
        v_no_transaksi,
        'Penjualan aksesoris',
        v_created_at
      );

      v_items_total := v_items_total + v_subtotal;
    end loop;

    if v_items_total <> v_total then
      raise exception 'Total item tidak sama dengan total transaksi.';
    end if;

    for v_payment in select value from jsonb_array_elements(v_payments)
    loop
      v_payment_method := coalesce(nullif(v_payment->>'method', ''), v_method::text);
      v_payment_amount := coalesce((v_payment->>'amount')::numeric::integer, 0);

      if v_payment_method not in ('cash', 'qris', 'split') then
        perform public.pos_insert_wallet_movement(
          v_kasir_id,
          v_payment_method::public.nama_platform,
          'masuk'::public.jenis_dompet_trx,
          v_payment_amount,
          0,
          null,
          'Pembayaran aksesoris ' || v_no_transaksi,
          'accessory_sale',
          v_transaction_id,
          v_no_transaksi,
          v_created_at
        );
      end if;
    end loop;

    v_result := (
      select to_jsonb(t) || jsonb_build_object(
        'items',
        coalesce(
          (
            select jsonb_agg(to_jsonb(i) order by i.id)
            from public.item_transaksi i
            where i.transaksi_id = t.id
          ),
          '[]'::jsonb
        )
      )
      from public.transaksi t
      where t.id = v_transaction_id
    );

    return v_result;
  end;
  $$;

  create or replace function public.create_digital_transaction_atomic(p_transaction jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_user_id uuid := auth.uid();
    v_role public.user_role := public.current_user_role();
    v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
    v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
    v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
    v_no_transaksi text := p_transaction->>'no_transaksi';
    v_jenis public.jenis_digital := (p_transaction->>'jenis')::public.jenis_digital;
    v_source_platform public.nama_platform := nullif(p_transaction->>'platform_sumber', '')::public.nama_platform;
    v_payment_method public.nama_platform := coalesce(nullif(p_transaction->>'payment_method', ''), 'cash')::public.nama_platform;
    v_harga_jual integer := coalesce((p_transaction->>'harga_jual')::numeric::integer, 0);
    v_modal integer := coalesce((p_transaction->>'modal')::numeric::integer, 0);
    v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
    v_result jsonb;
  begin
    if v_user_id is null then
      raise exception 'User belum login.';
    end if;

    if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
      raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
    end if;

    perform 1
    from public.shifts s
    where s.id = v_shift_id
      and s.cashier_id = v_kasir_id
      and s.status = 'active'::public.shift_status
    for update;

    if not found then
      raise exception 'Mulai shift dulu sebelum menyimpan transaksi layanan.';
    end if;

    if v_modal > 0 and v_source_platform is null then
      raise exception 'Pilih sumber saldo toko.';
    end if;

    insert into public.transaksi_digital (
      id,
      kasir_id,
      shift_id,
      no_transaksi,
      jenis,
      provider,
      nomor_tujuan,
      nama_tujuan,
      platform_sumber,
      payment_method,
      nominal,
      harga_jual,
      modal,
      catatan,
      created_at
    )
    values (
      v_transaction_id,
      v_kasir_id,
      v_shift_id,
      v_no_transaksi,
      v_jenis,
      p_transaction->>'provider',
      p_transaction->>'nomor_tujuan',
      p_transaction->>'nama_tujuan',
      v_source_platform,
      v_payment_method,
      coalesce((p_transaction->>'nominal')::numeric::integer, 0),
      v_harga_jual,
      v_modal,
      p_transaction->>'catatan',
      v_created_at
    );

    if v_source_platform is not null and v_modal > 0 then
      perform public.pos_insert_wallet_movement(
        v_kasir_id,
        v_source_platform,
        'keluar'::public.jenis_dompet_trx,
        v_modal,
        0,
        null,
        'Modal layanan ' || v_no_transaksi,
        'digital_modal',
        v_transaction_id,
        v_no_transaksi,
        v_created_at
      );
    end if;

    if v_payment_method::text not in ('cash', 'qris') and v_harga_jual > 0 then
      perform public.pos_insert_wallet_movement(
        v_kasir_id,
        v_payment_method,
        'masuk'::public.jenis_dompet_trx,
        v_harga_jual,
        0,
        null,
        'Pembayaran layanan ' || v_no_transaksi,
        'digital_sale',
        v_transaction_id,
        v_no_transaksi,
        v_created_at
      );
    end if;

    v_result := (
      select to_jsonb(digital_row)
      from public.transaksi_digital as digital_row
      where digital_row.id = v_transaction_id
    );

    return v_result;
  end;
  $$;

  create or replace function public.create_logistics_transaction_atomic(p_transaction jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_user_id uuid := auth.uid();
    v_role public.user_role := public.current_user_role();
    v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
    v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
    v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
    v_no_transaksi text := p_transaction->>'no_transaksi';
    v_payment_method public.nama_platform := coalesce(nullif(p_transaction->>'payment_method', ''), 'cash')::public.nama_platform;
    v_price integer := coalesce((p_transaction->>'price')::numeric::integer, (p_transaction->>'harga_jual')::numeric::integer, 0);
    v_modal integer := coalesce((p_transaction->>'modal')::numeric::integer, 0);
    v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
    v_result jsonb;
  begin
    if v_user_id is null then
      raise exception 'User belum login.';
    end if;

    if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
      raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
    end if;

    perform 1
    from public.shifts s
    where s.id = v_shift_id
      and s.cashier_id = v_kasir_id
      and s.status = 'active'::public.shift_status
    for update;

    if not found then
      raise exception 'Mulai shift dulu sebelum menyimpan transaksi logistik.';
    end if;

    insert into public.transaksi_logistik (
      id,
      kasir_id,
      shift_id,
      no_transaksi,
      ekspedisi,
      harga_jual,
      modal,
      no_resi,
      catatan,
      created_at,
      type,
      sender_name,
      receiver_name,
      destination,
      package_type,
      weight,
      price,
      payment_method
    )
    values (
      v_transaction_id,
      v_kasir_id,
      v_shift_id,
      v_no_transaksi,
      p_transaction->>'ekspedisi',
      v_price,
      v_modal,
      p_transaction->>'no_resi',
      p_transaction->>'catatan',
      v_created_at,
      coalesce(nullif(p_transaction->>'type', ''), 'logistik'),
      p_transaction->>'sender_name',
      p_transaction->>'receiver_name',
      p_transaction->>'destination',
      p_transaction->>'package_type',
      coalesce((p_transaction->>'weight')::numeric, 0),
      v_price,
      v_payment_method
    );

    if v_payment_method::text not in ('cash', 'qris') and v_price > 0 then
      perform public.pos_insert_wallet_movement(
        v_kasir_id,
        v_payment_method,
        'masuk'::public.jenis_dompet_trx,
        v_price,
        0,
        null,
        'Pembayaran logistik ' || v_no_transaksi,
        'logistics_sale',
        v_transaction_id,
        v_no_transaksi,
        v_created_at
      );
    end if;

    v_result := (
      select to_jsonb(logistics_row)
      from public.transaksi_logistik as logistics_row
      where logistics_row.id = v_transaction_id
    );

    return v_result;
  end;
  $$;

  create or replace function public.save_stock_mutation_atomic(p_mutation jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_user_id uuid := auth.uid();
    v_role public.user_role := public.current_user_role();
    v_product_id uuid := (p_mutation->>'produk_id')::uuid;
    v_tipe public.stock_mutation_type := (p_mutation->>'tipe')::public.stock_mutation_type;
    v_jumlah integer := coalesce((p_mutation->>'jumlah')::numeric::integer, 0);
    v_delta integer;
    v_produk record;
    v_produk_found boolean := false;
    v_mutation_id uuid := coalesce(nullif(p_mutation->>'id', '')::uuid, gen_random_uuid());
    v_result jsonb;
  begin
    if v_user_id is null then
      raise exception 'User belum login.';
    end if;

    if v_role <> 'pemilik'::public.user_role and v_tipe <> 'masuk'::public.stock_mutation_type then
      raise exception 'Kasir hanya boleh menambah stok produk.';
    end if;

    if v_jumlah = 0 then
      raise exception 'Jumlah mutasi harus diisi dan tidak boleh 0.';
    end if;

    v_delta := case
      when v_tipe = 'masuk'::public.stock_mutation_type then abs(v_jumlah)
      when v_tipe = 'keluar'::public.stock_mutation_type then -abs(v_jumlah)
      else v_jumlah
    end;

    for v_produk in
      select *
      from public.produk
      where id = v_product_id
      for update
    loop
      v_produk_found := true;
      exit;
    end loop;

    if not v_produk_found then
      raise exception 'Produk tidak ditemukan.';
    end if;

    if (v_produk).stok + v_delta < 0 then
      raise exception 'Stok tidak cukup untuk mutasi ini.';
    end if;

    update public.produk
    set stok = stok + v_delta
    where id = v_product_id;

    insert into public.stok_mutasi (
      id,
      produk_id,
      tipe,
      jumlah,
      stok_sebelum,
      stok_sesudah,
      referensi,
      catatan,
      created_at
    )
    values (
      v_mutation_id,
      v_product_id,
      v_tipe,
      v_delta,
      (v_produk).stok,
      (v_produk).stok + v_delta,
      p_mutation->>'referensi',
      p_mutation->>'catatan',
      coalesce(nullif(p_mutation->>'created_at', '')::timestamptz, now())
    );

    v_result := (
      select to_jsonb(mutation_row)
      from public.stok_mutasi as mutation_row
      where mutation_row.id = v_mutation_id
    );

    return v_result;
  end;
  $$;

  grant execute on function public.pos_wallet_balance(public.nama_platform) to authenticated;
  grant execute on function public.create_wallet_transaction_atomic(jsonb) to authenticated;
  grant execute on function public.create_accessory_transaction_atomic(jsonb, jsonb) to authenticated;
  grant execute on function public.create_digital_transaction_atomic(jsonb) to authenticated;
  grant execute on function public.create_logistics_transaction_atomic(jsonb) to authenticated;
  grant execute on function public.save_stock_mutation_atomic(jsonb) to authenticated;
