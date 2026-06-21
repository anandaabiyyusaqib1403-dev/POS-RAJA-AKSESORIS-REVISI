-- 20260420_01_delete_service_product_atomic.sql
-- Add owner-only service product deletion while preserving old digital transactions.

do $$
declare
  constraint_record record;
begin
  if to_regclass('public.transaksi_digital') is not null
    and to_regclass('public.services_products') is not null
  then
    alter table public.transaksi_digital
      add column if not exists service_product_id uuid;

    update public.transaksi_digital as transaction_row
    set service_product_id = null
    where transaction_row.service_product_id is not null
      and not exists (
        select 1
        from public.services_products as service_product
        where service_product.id = transaction_row.service_product_id
      );

    for constraint_record in
      select constraint_info.conname
      from pg_constraint as constraint_info
      join pg_attribute as attribute_info
        on attribute_info.attrelid = constraint_info.conrelid
       and attribute_info.attnum = any(constraint_info.conkey)
      where constraint_info.conrelid = 'public.transaksi_digital'::regclass
        and constraint_info.confrelid = 'public.services_products'::regclass
        and constraint_info.contype = 'f'
        and attribute_info.attname = 'service_product_id'
    loop
      execute format(
        'alter table public.transaksi_digital drop constraint %I',
        constraint_record.conname
      );
    end loop;

    alter table public.transaksi_digital
      add constraint transaksi_digital_service_product_id_fkey
      foreign key (service_product_id)
      references public.services_products(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.product_activity_logs') is not null then
    alter table public.product_activity_logs
      drop constraint if exists product_activity_logs_action_check;

    alter table public.product_activity_logs
      add constraint product_activity_logs_action_check
      check (
        action in (
          'create_product',
          'edit_product',
          'toggle_product_status',
          'delete_product',
          'restore_product',
          'permanent_delete_product',
          'update_stock',
          'create_service_product',
          'update_service_product',
          'disable_service_product',
          'delete_service_product',
          'legacy_product_activity'
        )
      );
  end if;
end $$;

create or replace function public.delete_service_product_atomic(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.services_products%rowtype;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if public.current_user_role() <> 'pemilik'::public.user_role then
    raise exception 'Hanya owner yang dapat menghapus layanan digital.';
  end if;

  select *
  into v_row
  from public.services_products
  where id = p_id
  for update;

  if not found then
    raise exception 'Layanan tidak ditemukan.';
  end if;

  v_snapshot := to_jsonb(v_row);

  insert into public.product_activity_logs (
    product_id,
    action,
    actor_id,
    details,
    product_snapshot,
    created_at
  )
  values (
    null,
    'delete_service_product',
    v_user_id,
    jsonb_build_object(
      'service_product_id', v_row.id,
      'deleted_at', now(),
      'before', v_snapshot
    ),
    v_snapshot,
    now()
  );

  delete from public.services_products
  where id = p_id;

  return v_snapshot;
end;
$$;

grant execute on function public.delete_service_product_atomic(uuid) to authenticated;

notify pgrst, 'reload schema';
