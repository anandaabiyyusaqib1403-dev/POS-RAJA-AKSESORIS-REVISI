-- Ganti email di bawah supaya sama dengan akun yang benar-benar dibuat di Supabase Authentication.
-- Contoh file ini memakai akun owner `amri@raja.pos` dan kasir `sriyati@raja.pos`.

create extension if not exists pgcrypto;
set search_path = public, extensions;

-- Setup Owner Account
UPDATE auth.users 
SET raw_user_meta_data =
  (COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'pemilik')) - 'pin'
WHERE email = 'amri@raja.pos';

INSERT INTO public.users (id, nama, role, pin_hash)
SELECT id, COALESCE(raw_user_meta_data->>'name', 'Amri'), 'pemilik'::public.user_role, crypt('1234', gen_salt('bf'))
FROM auth.users
WHERE email = 'amri@raja.pos'
ON CONFLICT (id) DO UPDATE
SET nama = EXCLUDED.nama,
    role = EXCLUDED.role,
    pin_hash = EXCLUDED.pin_hash;

-- Setup Kasir Account
UPDATE auth.users 
SET raw_user_meta_data =
  (COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'kasir')) - 'pin'
WHERE email = 'sriyati@raja.pos';

INSERT INTO public.users (id, nama, role, pin_hash)
SELECT id, COALESCE(raw_user_meta_data->>'name', 'Sriyati'), 'kasir'::public.user_role, crypt('1234', gen_salt('bf'))
FROM auth.users
WHERE email = 'sriyati@raja.pos'
ON CONFLICT (id) DO UPDATE
SET nama = EXCLUDED.nama,
    role = EXCLUDED.role,
    pin_hash = EXCLUDED.pin_hash;
