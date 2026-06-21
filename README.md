# Raja Aksesoris POS

Repository: https://github.com/anandaabiyyusaqib1403-dev/POS-RAJA-AKSESORIS-REVISI

Website Point of Sale untuk counter HP Raja Aksesoris dengan alur kasir, input transaksi digital, manajemen produk, dashboard laporan, dan cetak struk thermal 58mm.

## Stack

- React + Vite
- Tailwind CSS
- Supabase Auth + PostgreSQL
- Vercel

## Fitur utama

- Login role-based untuk `kasir` dan `pemilik`
- Halaman `/kasir` untuk transaksi aksesoris dan cetak struk
- Halaman `/kasir/digital` untuk pencatatan pulsa, kuota, voucher, dan token
- Halaman `/produk` untuk kelola produk, kode produk, mutasi stok, dan stok minimum
- Halaman `/dashboard` untuk ringkasan omzet, grafik omzet, metode bayar, top produk, dan export CSV
- Operasional penuh langsung ke Supabase production

## Fitur tambahan (dalam pengembangan)

- **Notifikasi Stok Rendah**: Alert otomatis via browser notification saat produk mendekati stok minimum
- **Diskon dan Promo**: Sistem diskon otomatis berdasarkan jumlah beli, kategori, atau periode, dengan kode promo kustom
- **Integrasi Printer Thermal**: Cetak struk 58mm langsung dari browser dengan template kustom
- **Backup dan Restore Data**: Ekspor/impor data lengkap ke cloud atau lokal untuk keamanan data

## Struktur Kategori Produk

- Produk Digital
  - Pulsa
  - Paket Data
  - Voucher Fisik
  - Token Listrik
- Aksesori HP (Fast Moving)
  - Charger
  - Tempered Glass
  - Casing
  - Power Bank
  - Earphone
- Aksesori Pendukung
  - Holder HP
  - Tongsis
  - Memory Card
  - Flashdisk OTG
  - Waterproof Case
- Layanan Tambahan
  - Top-up E-Wallet
  - Pembayaran Tagihan
  - Transfer / Tarik Tunai

## Setup lokal

1. Install dependency:

```bash
npm install
```

2. Buat file `.env`:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_BACKEND_URL=http://localhost:3001

# Backend-only, jangan pakai prefix VITE_
FONNTE_TOKEN=YOUR_TOKEN_HERE
FONNTE_TARGETS=6287884820507,6285659085578
```

3. Jalankan migration SQL di:

- `supabase/migrations/20260412_raja_aksesoris_pos.sql`
- `supabase/migrations/20260412_product_code_and_stock_mutations.sql`

4. Jalankan app:

```bash
npm run dev
```

5. Jalankan backend untuk notifikasi WhatsApp shift:

```bash
npm --prefix backend run dev
```

Manual dry-run helper Fonnte:

```bash
npm --prefix backend run test:wa
```

Kirim test WhatsApp sungguhan:

```bash
npm --prefix backend run test:wa -- --send
```

## Catatan login

- Login hanya menggunakan akun pengguna yang tersedia di Supabase production.
