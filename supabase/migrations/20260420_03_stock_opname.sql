create extension if not exists pgcrypto;

create table if not exists public.stock_opname_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Semua kategori',
  status text not null default 'draft' check (status in ('draft', 'completed')),
  created_by uuid references auth.users(id),
  applied_by uuid references auth.users(id),
  total_products integer not null default 0 check (total_products >= 0),
  checked_products integer not null default 0 check (checked_products >= 0),
  total_minus integer not null default 0 check (total_minus >= 0),
  total_plus integer not null default 0 check (total_plus >= 0),
  total_loss numeric not null default 0 check (total_loss >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_opname_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.stock_opname_sessions(id) on delete cascade,
  product_id uuid references public.produk(id) on delete set null,
  product_name text not null,
  product_code text,
  category text not null,
  system_stock integer not null default 0 check (system_stock >= 0),
  real_stock integer check (real_stock is null or real_stock >= 0),
  difference integer not null default 0,
  note text not null default '',
  cost numeric not null default 0 check (cost >= 0),
  applied_delta integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, product_id)
);

create index if not exists idx_stock_opname_sessions_status
on public.stock_opname_sessions (status, created_at desc);

create index if not exists idx_stock_opname_items_session
on public.stock_opname_items (session_id, product_name);

alter table public.stock_opname_sessions enable row level security;
alter table public.stock_opname_items enable row level security;

drop policy if exists "owner read stock opname sessions" on public.stock_opname_sessions;
create policy "owner read stock opname sessions"
on public.stock_opname_sessions
for select
to authenticated
using (public.current_user_role() = 'pemilik');

drop policy if exists "owner manage stock opname sessions" on public.stock_opname_sessions;
create policy "owner manage stock opname sessions"
on public.stock_opname_sessions
for all
to authenticated
using (public.current_user_role() = 'pemilik')
with check (public.current_user_role() = 'pemilik');

drop policy if exists "owner read stock opname items" on public.stock_opname_items;
create policy "owner read stock opname items"
on public.stock_opname_items
for select
to authenticated
using (public.current_user_role() = 'pemilik');

drop policy if exists "owner manage stock opname items" on public.stock_opname_items;
create policy "owner manage stock opname items"
on public.stock_opname_items
for all
to authenticated
using (public.current_user_role() = 'pemilik')
with check (public.current_user_role() = 'pemilik');

create or replace function public.recalculate_stock_opname_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'User belum login.';
  end if;

  if public.current_user_role() is distinct from 'pemilik'::public.user_role then
    raise exception 'Stock Opname hanya bisa diakses owner.';
  end if;

  update public.stock_opname_sessions session_row
  set
    total_products = coalesce(summary.total_products, 0),
    checked_products = coalesce(summary.checked_products, 0),
    total_minus = coalesce(summary.total_minus, 0),
    total_plus = coalesce(summary.total_plus, 0),
    total_loss = coalesce(summary.total_loss, 0),
    updated_at = now()
  from (
    select
      count(*)::integer as total_products,
      count(*) filter (where real_stock is not null)::integer as checked_products,
      coalesce(sum(abs(difference)) filter (where real_stock is not null and difference < 0), 0)::integer as total_minus,
      coalesce(sum(difference) filter (where real_stock is not null and difference > 0), 0)::integer as total_plus,
      coalesce(sum(abs(difference) * cost) filter (where real_stock is not null and difference < 0), 0)::numeric as total_loss
    from public.stock_opname_items
    where session_id = p_session_id
  ) summary
  where session_row.id = p_session_id;
end;
$$;

create or replace function public.apply_stock_opname_session_atomic(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_session public.stock_opname_sessions%rowtype;
  v_item public.stock_opname_items%rowtype;
  v_product public.produk%rowtype;
  v_delta integer;
  v_reference text;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role is distinct from 'pemilik'::public.user_role then
    raise exception 'Stock Opname hanya bisa diterapkan owner.';
  end if;

  select *
  into v_session
  from public.stock_opname_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Sesi Stock Opname tidak ditemukan.';
  end if;

  if v_session.status = 'completed' then
    raise exception 'Sesi Stock Opname sudah selesai.';
  end if;

  if not exists (
    select 1
    from public.stock_opname_items
    where session_id = p_session_id
      and real_stock is not null
  ) then
    raise exception 'Isi minimal satu stok real sebelum menerapkan penyesuaian.';
  end if;

  v_reference := 'OPNAME-' || left(replace(p_session_id::text, '-', ''), 8);

  for v_item in
    select *
    from public.stock_opname_items
    where session_id = p_session_id
      and real_stock is not null
    order by product_name
  loop
    select *
    into v_product
    from public.produk
    where id = v_item.product_id
    for update;

    if not found or coalesce(v_product.status, 'active') = 'deleted' then
      continue;
    end if;

    v_delta := v_item.real_stock - v_product.stok;

    update public.stock_opname_items
    set
      difference = v_item.real_stock - v_item.system_stock,
      applied_delta = v_delta,
      updated_at = now()
    where id = v_item.id;

    if v_delta <> 0 then
      update public.produk
      set
        stok = v_item.real_stock,
        updated_at = now()
      where id = v_product.id;

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
        gen_random_uuid(),
        v_product.id,
        'penyesuaian'::public.stock_mutation_type,
        v_delta,
        v_product.stok,
        v_item.real_stock,
        v_reference,
        'Penyesuaian dari Stock Opname: ' || v_session.name,
        now()
      );
    end if;
  end loop;

  perform public.recalculate_stock_opname_session(p_session_id);

  update public.stock_opname_sessions
  set
    status = 'completed',
    applied_by = v_user_id,
    completed_at = now(),
    updated_at = now()
  where id = p_session_id;

  return (
    select to_jsonb(session_row)
    from public.stock_opname_sessions as session_row
    where session_row.id = p_session_id
  );
end;
$$;

grant execute on function public.recalculate_stock_opname_session(uuid) to authenticated;
grant execute on function public.apply_stock_opname_session_atomic(uuid) to authenticated;

notify pgrst, 'reload schema';
