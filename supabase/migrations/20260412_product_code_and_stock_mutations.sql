do $$
begin
  create type stock_mutation_type as enum ('masuk', 'keluar', 'penyesuaian');
exception
  when duplicate_object then null;
end $$;

alter table public.produk
add column if not exists kode_produk text;

create unique index if not exists produk_kode_produk_unique
on public.produk (kode_produk)
where kode_produk is not null and btrim(kode_produk) <> '';

create table if not exists public.stok_mutasi (
  id uuid primary key default gen_random_uuid(),
  produk_id uuid not null references public.produk(id) on delete cascade,
  tipe stock_mutation_type not null,
  jumlah integer not null check (jumlah <> 0),
  stok_sebelum integer check (stok_sebelum is null or stok_sebelum >= 0),
  stok_sesudah integer check (stok_sesudah is null or stok_sesudah >= 0),
  referensi text,
  catatan text,
  created_at timestamptz default now()
);

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
select
  sm.id,
  sm.produk_id,
  'masuk'::stock_mutation_type,
  sm.jumlah,
  null,
  null,
  null,
  'Migrasi dari stok_masuk',
  sm.created_at
from public.stok_masuk sm
on conflict (id) do nothing;

alter table public.stok_mutasi enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stok_mutasi'
      and policyname = 'authenticated read stok mutasi'
  ) then
    create policy "authenticated read stok mutasi"
    on public.stok_mutasi
    for select
    to authenticated
    using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stok_mutasi'
      and policyname = 'owner manage stok mutasi'
  ) then
    create policy "owner manage stok mutasi"
    on public.stok_mutasi
    for all
    to authenticated
    using (public.current_user_role() = 'pemilik')
    with check (public.current_user_role() = 'pemilik');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stok_mutasi'
      and policyname = 'kasir insert stok masuk'
  ) then
    create policy "kasir insert stok masuk"
    on public.stok_mutasi
    for insert
    to authenticated
    with check (
      public.current_user_role() in ('kasir', 'pemilik')
      and tipe = 'masuk'
    );
  end if;
end $$;
