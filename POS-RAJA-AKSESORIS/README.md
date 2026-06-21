# Raja Aksesoris POS

Repository: https://github.com/anandaabiyyusaqib1403-dev/POS-RAJA-AKSESORIS

Aplikasi Point of Sale untuk toko aksesoris HP Raja Aksesoris. Dirancang untuk memudahkan kasir menangani transaksi tunai dan digital, mengelola produk, memantau stok, dan menghasilkan laporan bisnis secara cepat.

## Teknologi

- React + Vite untuk frontend modern
- Tailwind CSS untuk UI responsif
- Supabase Auth + PostgreSQL untuk autentikasi dan data
- Express backend untuk integrasi notifikasi dan layanan pendukung
- Vercel untuk deployment frontend

## Fitur Utama

- Login role-based untuk `kasir` dan `pemilik`
- Transaksi aksesoris cepat dengan cetak struk thermal 58mm
- Input transaksi digital: pulsa, paket data, voucher, dan token
- Manajemen produk, stok minimum, dan stok masuk
- Dashboard penjualan dengan ringkasan omzet, grafik, top produk, dan export CSV
- Mode demo saat environment Supabase belum dikonfigurasi

## Persiapan Lokal

1. Install dependency:

```bash
npm install
```

2. Buat file `.env` di root proyek:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Jalankan migration SQL jika diperlukan:

```bash
# Jalankan SQL di Supabase atau tool migration yang Anda gunakan
supabase/migrations/20260412_raja_aksesoris_pos.sql
```

4. Jalankan aplikasi frontend:

```bash
npm run dev
```

5. Jika backend digunakan untuk notifikasi atau integrasi tambahan:

```bash
npm --prefix backend run dev
```

## Akun Demo

- `owner@raja.test` / `demo123`
- `kasir@raja.test` / `demo123`

## Catatan

Pastikan variabel environment Supabase sudah diisi dengan benar agar autentikasi dan data berfungsi penuh. Jika backend dijalankan, jalankan server backend secara terpisah sebelum membuka aplikasi frontend.
