-- Setup role dasar.
--
-- Status pra-rekrutmen:
-- - Owner tetap dipastikan aktif.
-- - Jangan buat akun kasir pengganti sebelum nama/email final.
-- - Jangan arsipkan kasir lama sebelum hari kerja terakhir dan serah terima selesai.
--
-- Setelah rekrutmen final:
-- 1. Buat akun kasir baru di Supabase Authentication.
-- 2. Salin template onboarding kasir di bawah, lalu ganti email/nama sesuai akun final.
-- 3. Jalankan offboarding kasir lama hanya setelah tanggal keluar benar-benar final.
--
-- Catatan: offboarding di public.users hanya menghapus dari roster aplikasi.
-- Untuk mencegah login, nonaktifkan juga user dari Supabase Authentication dashboard.

create extension if not exists pgcrypto;
set search_path = public, extensions;

-- Setup Owner Account
update auth.users
set raw_user_meta_data =
  (coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'pemilik')) - 'pin'
where lower(email) = 'amri@raja.pos';

insert into public.users (id, nama, role, pin_hash, status, archived_at)
select id, coalesce(raw_user_meta_data->>'name', 'Amri'), 'pemilik'::public.user_role, crypt('1234', gen_salt('bf')), 'active', null
from auth.users
where lower(email) = 'amri@raja.pos'
on conflict (id) do update
set nama = excluded.nama,
    role = excluded.role,
    pin_hash = excluded.pin_hash,
    status = 'active',
    archived_at = null;

-- Template onboarding kasir baru.
-- Aktifkan setelah akun Auth final dibuat.
--
-- update auth.users
-- set raw_user_meta_data =
--   (coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'kasir', 'name', '<nama_kasir>')) - 'pin'
-- where lower(email) = lower('<email_kasir>');
--
-- insert into public.users (id, nama, role, pin_hash, status, archived_at)
-- select id, coalesce(raw_user_meta_data->>'name', '<nama_kasir>'), 'kasir'::public.user_role, crypt('1234', gen_salt('bf')), 'active', null
-- from auth.users
-- where lower(email) = lower('<email_kasir>')
-- on conflict (id) do update
-- set nama = excluded.nama,
--     role = excluded.role,
--     pin_hash = excluded.pin_hash,
--     status = 'active',
--     archived_at = null;

-- Template offboarding kasir lama.
-- Jalankan setelah hari kerja terakhir, bukan saat rekrutmen masih proses.
--
-- update public.users as app_user
-- set status = 'archived',
--     archived_at = coalesce(app_user.archived_at, now())
-- from auth.users as auth_user
-- where app_user.id = auth_user.id
--   and lower(auth_user.email) = lower('<email_kasir_lama>');
