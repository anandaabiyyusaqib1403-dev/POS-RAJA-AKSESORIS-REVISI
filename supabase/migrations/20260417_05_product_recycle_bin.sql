alter table public.produk
  add column if not exists aktif boolean default true,
  add column if not exists status text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz;

update public.produk
set status = case
  when status is not null then status
  when coalesce(aktif, true) then 'active'
  else 'inactive'
end;

alter table public.produk
  alter column status set default 'active',
  alter column status set not null;

alter table public.produk
  drop constraint if exists produk_status_check;

alter table public.produk
  add constraint produk_status_check
  check (status in ('active', 'inactive', 'deleted'));

update public.produk
set
  aktif = case when status = 'active' then true else false end,
  deleted_at = case when status = 'deleted' then coalesce(deleted_at, now()) else null end
where status in ('active', 'inactive', 'deleted');

create index if not exists idx_produk_status on public.produk (status, created_at desc);
create index if not exists idx_produk_deleted_at on public.produk (deleted_at)
where status = 'deleted';

create table if not exists public.product_activity_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.produk(id) on delete set null,
  action text not null check (
    action in (
      'edit_product',
      'delete_product',
      'restore_product',
      'permanent_delete_product',
      'update_stock',
      'toggle_product_status'
    )
  ),
  actor_id uuid references auth.users(id),
  details jsonb not null default '{}'::jsonb,
  product_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_activity_logs_product
on public.product_activity_logs (product_id, created_at desc);

create index if not exists idx_product_activity_logs_created
on public.product_activity_logs (created_at desc);

alter table public.product_activity_logs enable row level security;

drop policy if exists "owner read product activity logs" on public.product_activity_logs;
create policy "owner read product activity logs"
on public.product_activity_logs
for select
to authenticated
using (public.current_user_role() = 'pemilik');

drop policy if exists "authenticated insert product activity logs" on public.product_activity_logs;
create policy "authenticated insert product activity logs"
on public.product_activity_logs
for insert
to authenticated
with check (actor_id = auth.uid() or public.current_user_role() = 'pemilik');

drop policy if exists "kasir insert stok keluar" on public.stok_mutasi;
drop policy if exists "kasir insert stok masuk" on public.stok_mutasi;
create policy "kasir insert stok masuk"
on public.stok_mutasi
for insert
to authenticated
with check (
  public.current_user_role() in ('kasir', 'pemilik')
  and tipe = 'masuk'
);

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.item_transaksi'::regclass
      and confrelid = 'public.produk'::regclass
  loop
    execute format('alter table public.item_transaksi drop constraint %I', constraint_record.conname);
  end loop;

  alter table public.item_transaksi
    add constraint item_transaksi_produk_id_fkey
    foreign key (produk_id)
    references public.produk(id)
    on delete set null;
end $$;

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

  if (v_produk).status = 'deleted' then
    raise exception 'Produk yang sudah dihapus tidak bisa dimutasi stoknya.';
  end if;

  if (v_produk).stok + v_delta < 0 then
    raise exception 'Stok tidak cukup untuk mutasi ini.';
  end if;

  update public.produk
  set
    stok = stok + v_delta,
    updated_at = now()
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

create or replace function public.purge_expired_deleted_products()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product record;
  v_deleted_count integer := 0;
begin
  if v_user_id is null then
    return 0;
  end if;

  if public.current_user_role() is distinct from 'pemilik'::public.user_role then
    return 0;
  end if;

  for v_product in
    select *
    from public.produk
    where status = 'deleted'
      and deleted_at < now() - interval '30 days'
  loop
    insert into public.product_activity_logs (
      product_id,
      action,
      actor_id,
      details,
      product_snapshot,
      created_at
    )
    values (
      (v_product).id,
      'permanent_delete_product',
      v_user_id,
      jsonb_build_object(
        'reason', 'auto_delete_after_30_days',
        'deleted_at', (v_product).deleted_at
      ),
      to_jsonb(v_product),
      now()
    );

    delete from public.produk
    where id = (v_product).id;

    v_deleted_count := v_deleted_count + 1;
  end loop;

  return v_deleted_count;
end;
$$;

grant execute on function public.purge_expired_deleted_products() to authenticated;
