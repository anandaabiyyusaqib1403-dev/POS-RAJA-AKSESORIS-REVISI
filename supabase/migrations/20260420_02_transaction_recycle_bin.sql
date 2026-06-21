do $$
declare
  v_table_name text;
  v_owner_oid oid;
  v_owner_name name;
begin
  for v_table_name in
    select table_name
    from (values
      ('transaksi'),
      ('transaksi_digital'),
      ('transaksi_logistik'),
      ('transaksi_dompet'),
      ('kas')
    ) as transaction_tables(table_name)
  loop
    select table_info.relowner, pg_get_userbyid(table_info.relowner)
    into v_owner_oid, v_owner_name
    from pg_class as table_info
    join pg_namespace as schema_info
      on schema_info.oid = table_info.relnamespace
    where schema_info.nspname = 'public'
      and table_info.relname = v_table_name
      and table_info.relkind in ('r', 'p');

    if v_owner_oid is null then
      continue;
    end if;

    if pg_has_role(v_owner_oid, 'member') then
      execute format(
        'alter table public.%I
           add column if not exists deleted_at timestamptz,
           add column if not exists deleted_by uuid references auth.users(id)',
        v_table_name
      );
    else
      raise notice
        'Skip alter public.% because current role % is not owner/member of owner %.',
        v_table_name,
        current_user,
        v_owner_name;
    end if;
  end loop;
end $$;

do $$
declare
  v_table_name text;
  v_index_name text;
  v_owner_oid oid;
  v_owner_name name;
begin
  for v_table_name, v_index_name in
    select table_name, index_name
    from (values
      ('transaksi', 'idx_transaksi_deleted_at'),
      ('transaksi_digital', 'idx_transaksi_digital_deleted_at'),
      ('transaksi_logistik', 'idx_transaksi_logistik_deleted_at'),
      ('transaksi_dompet', 'idx_transaksi_dompet_deleted_at'),
      ('kas', 'idx_kas_deleted_at')
    ) as deleted_indexes(table_name, index_name)
  loop
    select table_info.relowner, pg_get_userbyid(table_info.relowner)
    into v_owner_oid, v_owner_name
    from pg_class as table_info
    join pg_namespace as schema_info
      on schema_info.oid = table_info.relnamespace
    where schema_info.nspname = 'public'
      and table_info.relname = v_table_name
      and table_info.relkind in ('r', 'p');

    if v_owner_oid is null then
      continue;
    end if;

    if pg_has_role(v_owner_oid, 'member') then
      execute format(
        'create index if not exists %I on public.%I (deleted_at) where deleted_at is not null',
        v_index_name,
        v_table_name
      );
    else
      raise notice
        'Skip index public.% because current role % is not owner/member of owner %.',
        v_table_name,
        current_user,
        v_owner_name;
    end if;
  end loop;
end $$;

do $$
declare
  v_table_name text;
  v_owner_oid oid;
  v_owner_name name;
begin
  for v_table_name in
    select table_name
    from (values
      ('transaksi'),
      ('transaksi_digital'),
      ('transaksi_logistik'),
      ('transaksi_dompet'),
      ('kas')
    ) as transaction_tables(table_name)
  loop
    select table_info.relowner, pg_get_userbyid(table_info.relowner)
    into v_owner_oid, v_owner_name
    from pg_class as table_info
    join pg_namespace as schema_info
      on schema_info.oid = table_info.relnamespace
    where schema_info.nspname = 'public'
      and table_info.relname = v_table_name
      and table_info.relkind in ('r', 'p');

    if v_owner_oid is null then
      continue;
    end if;

    if pg_has_role(v_owner_oid, 'member') then
      execute format(
        'grant select, insert, update, delete on table public.%I to authenticated',
        v_table_name
      );
    else
      raise notice
        'Skip grant public.% because current role % is not owner/member of owner %.',
        v_table_name,
        current_user,
        v_owner_name;
    end if;
  end loop;
end $$;

create or replace function public.soft_delete_transaction_history(p_source text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_table regclass;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if public.current_user_role() is distinct from 'pemilik'::public.user_role then
    raise exception 'Hanya owner yang dapat menghapus riwayat transaksi.';
  end if;

  case p_source
    when 'aksesoris' then v_table := to_regclass('public.transaksi');
    when 'digital' then v_table := to_regclass('public.transaksi_digital');
    when 'logistik' then v_table := to_regclass('public.transaksi_logistik');
    when 'saldo' then v_table := to_regclass('public.transaksi_dompet');
    when 'operasional' then v_table := to_regclass('public.kas');
    else
      raise exception 'Sumber transaksi tidak valid.';
  end case;

  if v_table is null then
    raise exception 'Tabel transaksi untuk sumber % belum tersedia.', p_source;
  end if;

  execute format(
    'update %s as trx
     set deleted_at = coalesce(deleted_at, now()),
         deleted_by = coalesce(deleted_by, $1)
     where trx.id = $2
     returning to_jsonb(trx)',
    v_table
  )
  using v_user_id, p_id
  into v_result;

  if v_result is null then
    raise exception 'Transaksi tidak ditemukan.';
  end if;

  return v_result;
end;
$$;

create or replace function public.restore_transaction_history(p_source text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_table regclass;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if public.current_user_role() is distinct from 'pemilik'::public.user_role then
    raise exception 'Hanya owner yang dapat restore riwayat transaksi.';
  end if;

  case p_source
    when 'aksesoris' then v_table := to_regclass('public.transaksi');
    when 'digital' then v_table := to_regclass('public.transaksi_digital');
    when 'logistik' then v_table := to_regclass('public.transaksi_logistik');
    when 'saldo' then v_table := to_regclass('public.transaksi_dompet');
    when 'operasional' then v_table := to_regclass('public.kas');
    else
      raise exception 'Sumber transaksi tidak valid.';
  end case;

  if v_table is null then
    raise exception 'Tabel transaksi untuk sumber % belum tersedia.', p_source;
  end if;

  execute format(
    'update %s as trx
     set deleted_at = null,
         deleted_by = null
     where trx.id = $1
       and trx.deleted_at is not null
     returning to_jsonb(trx)',
    v_table
  )
  using p_id
  into v_result;

  if v_result is null then
    raise exception 'Transaksi terhapus tidak ditemukan.';
  end if;

  return v_result;
end;
$$;

create or replace function public.permanently_delete_transaction_history(p_source text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_table regclass;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if public.current_user_role() is distinct from 'pemilik'::public.user_role then
    raise exception 'Hanya owner yang dapat menghapus permanen riwayat transaksi.';
  end if;

  case p_source
    when 'aksesoris' then v_table := to_regclass('public.transaksi');
    when 'digital' then v_table := to_regclass('public.transaksi_digital');
    when 'logistik' then v_table := to_regclass('public.transaksi_logistik');
    when 'saldo' then v_table := to_regclass('public.transaksi_dompet');
    when 'operasional' then v_table := to_regclass('public.kas');
    else
      raise exception 'Sumber transaksi tidak valid.';
  end case;

  if v_table is null then
    raise exception 'Tabel transaksi untuk sumber % belum tersedia.', p_source;
  end if;

  execute format(
    'delete from %s as trx
     where trx.id = $1
       and trx.deleted_at is not null
     returning to_jsonb(trx)',
    v_table
  )
  using p_id
  into v_result;

  if v_result is null then
    raise exception 'Transaksi terhapus tidak ditemukan.';
  end if;

  return v_result;
end;
$$;

create or replace function public.purge_expired_deleted_transactions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_table regclass;
  v_deleted_count integer := 0;
  v_row_count integer := 0;
begin
  if v_user_id is null then
    return 0;
  end if;

  if public.current_user_role() is distinct from 'pemilik'::public.user_role then
    return 0;
  end if;

  foreach v_table in array array[
    to_regclass('public.transaksi'),
    to_regclass('public.transaksi_digital'),
    to_regclass('public.transaksi_logistik'),
    to_regclass('public.transaksi_dompet'),
    to_regclass('public.kas')
  ]
  loop
    continue when v_table is null;

    execute format(
      'delete from %s where deleted_at < now() - interval ''30 days''',
      v_table
    );
    get diagnostics v_row_count = row_count;
    v_deleted_count := v_deleted_count + v_row_count;
  end loop;

  return v_deleted_count;
end;
$$;

grant execute on function public.soft_delete_transaction_history(text, uuid) to authenticated;
grant execute on function public.restore_transaction_history(text, uuid) to authenticated;
grant execute on function public.permanently_delete_transaction_history(text, uuid) to authenticated;
grant execute on function public.purge_expired_deleted_transactions() to authenticated;

notify pgrst, 'reload schema';
