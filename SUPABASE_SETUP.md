# Panduan Setup Supabase

## Step 1: Buat Supabase Project

1. Buka [supabase.com](https://supabase.com)
2. Login atau daftar akun
3. Klik **"New Project"**
4. Isi form:
   - **Organization**: Pilih atau buat organisasi
   - **Project Name**: `raja-aksesoris-pos`
   - **Database Password**: Catat password ini
   - **Region**: Pilih region terdekat (misal: `Southeast Asia - Singapore`)
5. Tunggu project selesai dibuat (3-5 menit)

## Step 2: Dapatkan Kredensial

Setelah project selesai:

1. Buka menu **Settings** → **API**
2. Copy kredensial berikut:
   - **Project URL** (untuk `VITE_SUPABASE_URL`)
   - **anon public key** (untuk `VITE_SUPABASE_ANON_KEY`)

Contoh:
```
VITE_SUPABASE_URL=https://xxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Step 3: Buat File `.env`

Di root project, buat file `.env`:

```env
VITE_SUPABASE_URL=https://xxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Ganti dengan nilai yang Anda copy dari Step 2**

## Step 4: Jalankan SQL Migrations

1. Buka Supabase console → **SQL Editor**
2. Buka file-file migrasi di folder `supabase/migrations/` dalam urutan:

   **WAJIB (base setup):**
   - `20260412_raja_aksesoris_pos.sql`
   - `20260412_product_code_and_stock_mutations.sql`
   - `20260412_pos_v2_modules.sql`

   **Opsional (fitur tambahan):**
   - `20260416_01_wallet_manual_control_enums.sql`
   - `20260416_02_wallet_manual_control_backfill.sql`
   - `20260416_03_logistics_service_recording.sql`
   - `20260417_01_split_payment_method.sql`
   - `20260417_02_shift_management.sql`
   - `20260417_03_atomic_pos_consistency.sql`
   - `20260417_05_product_recycle_bin.sql`
   - `20260417_06_digital_service_cashier_fields.sql`
   - `20260417_07_service_products_and_transaction_fields.sql`
   - `20260417_08_digital_wallet_payment_validation.sql`
   - `20260417_09_digital_services_complete.sql`
   - `20260418_01_digital_services_pasarkuota_deduction.sql`
   - `20260418_02_service_product_transaction_views.sql`
   - `20260418_03_shift_approve_with_correction.sql`
   - `20260418_04_service_product_service_type.sql`
   - `20260418_05_digital_services_flexible_pricing_wallet_deduction.sql`
   - `20260418_06_security_lockdown_views.sql`
   - `20260418_07_shift_rls_fix.sql`
   - `20260418_08_runtime_schema_repair.sql`
   - `20260418_09_digital_payment_source_fix.sql`
   - `20260418_10_digital_customer_payment_split.sql`
   - `20260418_11_transfer_manual_transactions.sql`
   - `20260419_01_fix_financial_logs_typo.sql`
   - `20260419_02_lockdown_shift_views.sql`
   - `20260419_03_fix_produk_aktif_column.sql`
   - `20260419_04_repair_mutations_products_services.sql`
   - `20260419_05_fix_metode_bayar_wallet_values.sql`
   - `20260419_06_remove_refund_features.sql`
   - `20260419_07_security_hardening_review_fixes.sql`
   - `20260419_08_service_transactions_recording_only.sql`
   - `20260419_09_dual_service_payment_recording.sql`
   - `20260419_99_fix_shift_reporting_and_triggers.sql`
   - `20260419_99_repair_product_service_write_paths.sql`
   - `20260419_99_z_pasarkuota_qris_wallet_flow.sql`
   - `20260419_99_zz_global_sales_report_item_snapshots.sql`
   - `20260420_01_delete_service_product_atomic.sql`
   - `20260420_02_transaction_recycle_bin.sql`
   - `20260420_03_stock_opname.sql`

   Jika input produk, layanan, atau mutasi saldo macet, jalankan ulang file terakhir
   `20260419_99_repair_product_service_write_paths.sql`, lalu jalankan
   `20260419_99_z_pasarkuota_qris_wallet_flow.sql` di SQL Editor dan refresh aplikasi.
   Jika muncul pesan "Fitur recycle bin transaksi belum siap di Supabase", jalankan
   `20260420_02_transaction_recycle_bin.sql`, pastikan query terakhir
   `notify pgrst, 'reload schema';` berhasil, lalu hard refresh aplikasi.

3. Copy-paste isi file, jalankan (`Ctrl+Enter`)
4. Ulangi untuk setiap file migration

## Step 5: Setup Akun Login

1. Di Supabase console → **Authentication** → **Users**
2. Klik **"Invite user"** atau **"Add user"**
3. Buat 2 akun:
   - **sriyat** (role: kasir)
   - **Pemilik** (role: pemilik)

Contoh:
- Email: `kasir@rajaaksesoris.com`, Password: `KasirRaja123!`
- Email: `pemilik@rajaaksesoris.com`, Password: `PemilikRaja123!`

## Step 6: Setup User Metadata (Role)

Di SQL Editor, jalankan:

```sql
-- Setup kasir
UPDATE auth.users 
SET raw_user_meta_data = jsonb_build_object('role', 'kasir')
WHERE email = 'kasir@rajaaksesoris.com';

-- Setup pemilik
UPDATE auth.users 
SET raw_user_meta_data = jsonb_build_object('role', 'pemilik')
WHERE email = 'pemilik@rajaaksesoris.com';
```

Sesuaikan email di query dengan email yang benar-benar Anda buat di menu **Authentication > Users**.

Lalu pastikan setiap user Auth juga punya profil di tabel `public.users`:

```sql
create extension if not exists pgcrypto;

insert into public.users (id, nama, role, pin_hash)
select id, 'Kasir Raja', 'kasir'::public.user_role, crypt('1234', gen_salt('bf'))
from auth.users
where email = 'kasir@rajaaksesoris.com'
on conflict (id) do update
set nama = excluded.nama,
    role = excluded.role,
    pin_hash = excluded.pin_hash;

insert into public.users (id, nama, role, pin_hash)
select id, 'Pemilik Raja', 'pemilik'::public.user_role, crypt('1234', gen_salt('bf'))
from auth.users
where email = 'pemilik@rajaaksesoris.com'
on conflict (id) do update
set nama = excluded.nama,
    role = excluded.role,
    pin_hash = excluded.pin_hash;
```

## Step 7: Verifikasi Setup

1. Install dependency: `npm install`
2. Jalankan app: `npm run dev`
3. Test login dengan akun yang dibuat di Step 5
4. Verifikasi redirect ke halaman kasir atau dashboard

## Troubleshooting

### Error: "Supabase belum dikonfigurasi"
- Pastikan `.env` ada di root project
- Pastikan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` benar
- Restart dev server: `npm run dev`

### Login gagal
- Verifikasi akun sudah ada di Supabase Authentication
- Pastikan user metadata berisi `role` yang benar
- Cek console browser untuk error message spesifik

### Database error saat submit transaksi
- Pastikan semua migration SQL sudah dijalankan
- Periksa di SQL Editor apakah table sudah ada
- Jalankan: `SELECT * FROM pg_tables WHERE schemaname = 'public';`

## Referensi File

- Konfigurasi Supabase: `src/lib/supabase.js`
- Auth Context: `src/contexts/AuthContext.jsx`
- Environment variables: `.env` (lokal, jangan commit)
