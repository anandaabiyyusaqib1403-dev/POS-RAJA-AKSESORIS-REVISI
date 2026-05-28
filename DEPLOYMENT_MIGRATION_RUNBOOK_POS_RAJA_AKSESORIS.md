# Deployment & Migration Runbook POS Raja Aksesoris

Tanggal dibuat: 14 Mei 2026  
Tujuan: memastikan deployment dan migration POS Raja Aksesoris berjalan aman, bisa diverifikasi, dan punya rollback path yang jelas.

Runbook ini dipakai setiap kali ada perubahan:

- Supabase migration,
- RPC atomic,
- RLS/policy,
- reporting view,
- frontend production build,
- backend/integration API,
- WhatsApp automation,
- environment variable.

## Golden Rule

Jangan deploy migration production tanpa:

- backup database,
- daftar migration yang akan dijalankan,
- verification SQL,
- smoke test kasir,
- smoke test shift,
- verify reporting,
- rollback plan.

Owner tetap superuser di aplikasi, tetapi deployment production harus diperlakukan seperti operasi finansial: terukur, tercatat, dan bisa dipulihkan.

## 1. Pre-Deployment Checklist

### 1.1. Pastikan branch dan working tree

Checklist:

- Pastikan branch yang akan dideploy benar.
- Pastikan tidak ada perubahan tidak sengaja di file sensitif.
- Pastikan `.env` asli tidak masuk commit.
- Pastikan migration baru sudah direview.
- Pastikan nama migration berurutan dan deskriptif.

Command lokal:

```bash
git status
npm run lint
npm run build
```

Go/no-go:

- Lint wajib lulus.
- Build wajib lulus.
- Warning bundle boleh dicatat, tetapi error build tidak boleh lanjut.

### 1.2. Catat release metadata

Sebelum deploy, catat:

- release date,
- commit hash,
- daftar migration,
- deployer,
- environment target,
- expected downtime,
- rollback owner.

Template:

```text
Release:
Date:
Commit:
Environment:
Migrations:
Deployer:
Reviewer:
Rollback PIC:
```

## 2. Backup Database

### 2.1. Backup wajib sebelum migration

Backup harus dilakukan sebelum migration menyentuh:

- transaksi,
- wallet,
- stok,
- shift,
- audit,
- users,
- RLS/policy,
- reporting views.

Metode aman:

- Supabase Dashboard backup,
- Supabase CLI dump,
- database dump via `pg_dump` jika akses tersedia.

### 2.2. Backup verification

Backup tidak dianggap valid sampai dicek:

- file backup ada,
- ukuran file wajar,
- timestamp benar,
- target project benar,
- minimal restore strategy diketahui.

Checklist:

```text
[ ] Backup dibuat
[ ] Backup timestamp dicatat
[ ] Backup lokasi dicatat
[ ] Backup project ID cocok
[ ] Restore method diketahui
```

### 2.3. Production freeze window

Untuk migration besar:

- minta kasir berhenti transaksi sementara,
- pastikan tidak ada shift sedang closing,
- pastikan owner tahu window deploy,
- pastikan tidak ada import produk/layanan sedang berjalan.

Jika migration hanya view/report ringan, freeze bisa lebih pendek.

## 3. Apply Migration

### 3.1. Urutan umum

Urutan aman:

1. Backup database.
2. Deploy migration additive dulu:
   - table baru,
   - column baru nullable/default-safe,
   - index,
   - function baru.
3. Deploy RPC baru.
4. Deploy RLS/policy.
5. Deploy frontend yang memakai RPC/table baru.
6. Verify.
7. Enable feature jika ada feature flag.

Hindari:

- drop column langsung,
- rename column tanpa compatibility window,
- mengubah enum tanpa memastikan semua client siap,
- menghapus RPC lama sebelum frontend lama tidak dipakai.

### 3.2. Jalur migration

#### Jalur A: Supabase Dashboard SQL Editor

Disarankan untuk production jika migration perlu review manual.

Langkah:

1. Buka Supabase project production.
2. Buka SQL Editor.
3. Paste satu migration file.
4. Jalankan.
5. Simpan hasil output.
6. Lanjut migration berikutnya.

Kelebihan:

- terlihat jelas migration mana yang dijalankan,
- mudah stop jika error,
- cocok untuk migration critical.

#### Jalur B: Local script

Repo memiliki script:

```bash
node scripts/run-migrations.js
```

Syarat:

- `.env` berisi `VITE_SUPABASE_URL`,
- `.env` berisi `SUPABASE_SERVICE_ROLE_KEY`,
- database memiliki RPC `exec_sql`.

Catatan production:

- gunakan hanya jika sudah yakin urutan migration benar,
- jangan jalankan membabi-buta ke production tanpa backup,
- simpan log output.

#### Jalur C: Supabase CLI

Jika project sudah memakai Supabase CLI dan linked project:

```bash
supabase db push
```

Catatan:

- pastikan target project benar,
- pastikan local migration history sinkron,
- tetap backup dulu.

### 3.3. Jika migration gagal

Jangan langsung rerun semua migration.

Langkah:

1. Catat error lengkap.
2. Identifikasi migration file yang gagal.
3. Cek apakah perubahan sebelumnya sudah partial applied.
4. Jalankan verification SQL untuk object terkait.
5. Buat hotfix migration idempotent jika perlu.
6. Jika data risk tinggi, rollback dari backup.

## 4. Verify RPC, Table, View, dan Policy

Setelah migration, lakukan verification sebelum frontend dipakai kasir.

### 4.1. Verify object penting

Jalankan di SQL Editor:

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'create_accessory_transaction_atomic',
    'create_digital_transaction_atomic',
    'create_wallet_transaction_atomic',
    'save_stock_mutation_atomic',
    'close_shift_atomic',
    'void_transaction_atomic',
    'approve_shift_with_correction_atomic',
    'verify_user_pin'
  )
order by routine_name;
```

Expected:

- semua RPC yang dibutuhkan release muncul.
- jika `close_shift_atomic` atau `void_transaction_atomic` belum ada pada release saat ini, pastikan frontend belum memanggilnya.

### 4.2. Verify table penting

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'users',
    'produk',
    'transaksi',
    'item_transaksi',
    'transaksi_digital',
    'transaksi_dompet',
    'kas',
    'shifts',
    'audit_logs',
    'app_settings',
    'employee_sessions'
  )
order by table_name;
```

Expected:

- semua table inti ada.

### 4.3. Verify reporting views

```sql
select table_name
from information_schema.views
where table_schema = 'public'
  and table_name in (
    'daily_sales_summary',
    'transaction_history_summary',
    'sales_report_items',
    'employee_roster_operational',
    'stock_summary'
  )
order by table_name;
```

Expected:

- views laporan yang dipakai frontend muncul.

### 4.4. Verify RLS aktif

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'users',
    'produk',
    'transaksi',
    'transaksi_digital',
    'transaksi_dompet',
    'shifts',
    'audit_logs',
    'app_settings'
  )
order by tablename;
```

Expected:

- `rowsecurity = true` untuk table sensitif.

### 4.5. Verify app settings

```sql
select key, value
from public.app_settings
where key in ('pin_required_enabled', 'security_controls')
order by key;
```

Expected:

- PIN/security setting ada.
- value valid JSON.

## 5. Deploy Frontend

### 5.1. Build lokal

```bash
npm run lint
npm run build
```

Expected:

- lint lulus,
- build lulus,
- tidak ada error import/module.

Warning bundle besar boleh dicatat sebagai performance issue, tetapi bukan blocker kecuali deploy policy menentukan batas.

### 5.2. Environment variable

Pastikan production memiliki:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_BACKEND_URL
```

Jangan expose:

```text
SUPABASE_SERVICE_ROLE_KEY
FONNTE_TOKEN
```

Key backend-only harus berada di backend/integration environment.

## 6. Deploy Backend / Integration

Backend aktif dipakai untuk:

- WhatsApp opening,
- WhatsApp closing,
- health check,
- integration job.

### 6.1. Required env backend

```text
FONNTE_TOKEN
FONNTE_TARGETS
CORS_ORIGIN
PORT
```

Jika API Vercel memakai Supabase admin:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

### 6.2. Health check

Local:

```bash
npm --prefix backend start
```

Check:

```text
GET /ping
GET /api/health
```

Expected:

- response `status: OK`.

Production:

- buka endpoint health sesuai domain deployment.
- pastikan CORS sesuai frontend origin.

## 7. Smoke Test Kasir

Smoke test harus memakai akun kasir test atau akun kasir production yang disetujui owner.

### 7.1. Login kasir

Checklist:

- kasir bisa login,
- nama dan role benar,
- redirect ke halaman kasir benar,
- menu kasir tidak menampilkan halaman owner-only.

### 7.2. Open shift

Checklist:

- buka halaman shift,
- kasir bisa open shift sesuai aturan jam,
- shift aktif muncul di kasir POS,
- selected cashier benar,
- session/presence terupdate.

### 7.3. Transaksi aksesoris

Gunakan produk test dengan stok cukup.

Checklist:

- search/scan produk,
- tambah ke cart,
- qty berubah benar,
- total benar,
- cash exact payment,
- simpan transaksi,
- stok produk berkurang,
- receipt preview/print muncul,
- transaksi muncul di riwayat.

Verification DB opsional:

```sql
select no_transaksi, total_bayar, shift_id, created_at
from public.transaksi
order by created_at desc
limit 5;
```

### 7.4. Transaksi layanan digital

Checklist:

- pilih layanan aktif,
- input nomor tujuan,
- harga jual/modal benar,
- payment customer benar,
- simpan,
- transaksi muncul di riwayat,
- wallet terkait berubah jika layanan memakai saldo internal.

### 7.5. Guard stok dan saldo

Checklist:

- produk stok 0 tidak bisa dijual,
- wallet tidak cukup ditolak,
- error user-friendly,
- data tidak tersimpan setengah.

## 8. Smoke Test Shift

### 8.1. Closing shift

Checklist:

- closing bisa dilakukan sesuai role/jam,
- actual cash wajib valid,
- PIN kasir diminta jika setting aktif,
- shift berubah ke pending,
- total transaksi cocok dengan transaksi shift,
- expected cash dan difference benar.

Jika release sudah memakai `close_shift_atomic`, pastikan angka berasal dari DB.

### 8.2. Owner approval

Checklist:

- owner bisa melihat shift pending,
- owner bisa approve shift tanpa selisih,
- shift dengan selisih memerlukan catatan/koreksi,
- audit log tercatat,
- status shift berubah benar.

### 8.3. Auto-close behavior

Checklist:

- shift lewat cutoff tidak menerima transaksi baru,
- user diarahkan membuka shift baru,
- pesan error jelas.

## 9. Verify Reporting

### 9.1. Dashboard owner

Checklist:

- owner bisa login,
- dashboard terbuka,
- summary tidak error,
- alert stok/saldo/shift muncul jika ada,
- data hari ini masuk.

### 9.2. Riwayat transaksi

Checklist:

- transaksi aksesoris terbaru muncul,
- transaksi digital terbaru muncul,
- filter tanggal bekerja,
- search bekerja,
- pagination bekerja jika ada.

### 9.3. Laporan penjualan

Checklist:

- summary revenue/cost/profit tampil,
- detail rows tampil,
- filter range bekerja,
- export bekerja,
- angka tidak berbeda jauh dari transaksi smoke test.

### 9.4. Laporan keuangan

Checklist:

- omzet,
- modal,
- profit,
- pengeluaran,
- cashflow,
- wallet movement,
- export.

### 9.5. Audit log

Checklist:

- sensitive action smoke test tercatat,
- actor benar,
- action benar,
- timestamp benar,
- before/after value tersedia untuk action critical.

## 10. Verify Realtime

Gunakan dua browser/tab:

- tab A login kasir,
- tab B login owner.

Checklist:

- saat kasir open shift, owner melihat update,
- saat transaksi dibuat, dashboard/riwayat update tanpa refresh manual,
- stok produk berubah di tab lain,
- presence online/idle/offline berubah,
- reconnect tidak membuat data dobel.

Jika realtime gagal:

- pastikan Supabase realtime publication aktif untuk table terkait,
- cek network websocket,
- cek RLS select permission,
- cek console error.

## 11. Verify WhatsApp Automation

### 11.1. Opening notification

Checklist:

- open shift membuat request/job WhatsApp,
- status notifikasi terlihat,
- duplicate opening untuk shift sama tidak terkirim,
- error Fonnte tidak menggagalkan shift.

### 11.2. Closing notification

Checklist:

- closing shift membuat request/job WhatsApp,
- message memakai angka closing yang benar,
- status sent/failed jelas,
- retry bisa dilakukan jika gagal.

### 11.3. Jika notifikasi masih di-hold

Jika frontend/backend masih memakai mode hold/dry-run:

- tampilkan status `held` atau `dryRun`,
- jangan klaim notifikasi terkirim,
- owner harus tahu WA belum aktif production.

## 12. Rollback Plan

Rollback tergantung jenis masalah.

### 12.1. Frontend rollback

Dipakai jika:

- halaman blank,
- route rusak,
- UI blocking,
- build baru bermasalah tetapi DB aman.

Langkah:

1. Redeploy commit frontend sebelumnya.
2. Jangan rollback DB jika migration additive dan tidak merusak.
3. Verify login, kasir, shift, laporan.

### 12.2. Backend rollback

Dipakai jika:

- WhatsApp endpoint error,
- CORS error,
- health check gagal,
- integration job gagal.

Langkah:

1. Rollback backend deployment ke versi sebelumnya.
2. Pastikan frontend tetap bisa transaksi.
3. Tandai WhatsApp sebagai degraded jika perlu.
4. Retry notification setelah fix.

### 12.3. Database rollback

Dipakai jika:

- migration merusak data,
- RPC critical salah,
- RLS memblokir user production,
- transaksi tidak bisa disimpan,
- laporan critical rusak.

Langkah:

1. Stop transaksi sementara.
2. Catat waktu incident.
3. Putuskan restore backup atau hotfix forward.
4. Jika data corruption, restore dari backup terakhir.
5. Jika hanya RPC/view salah, deploy hotfix migration.
6. Verify ulang semua smoke test.

Rule:

- Untuk data production, prefer hotfix forward jika data tidak corrupt.
- Restore backup dipakai jika data sudah rusak atau migration destructive.

### 12.4. Rollback RLS/policy

Jika user tidak bisa baca/tulis:

1. Cek error Supabase.
2. Jalankan policy hotfix.
3. Verify role `pemilik` dan `kasir`.
4. Smoke test insert transaksi.

Minimal policy check:

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## 13. Post-Deployment Monitoring

Monitor minimal 1 hari setelah deployment.

Checklist:

- transaksi berhasil,
- tidak ada error login,
- tidak ada RPC missing,
- tidak ada complaint stok salah,
- wallet balance wajar,
- shift closing berhasil,
- laporan owner terbuka,
- WhatsApp tidak gagal diam-diam,
- audit log terisi.

### 13.1. Incident log

Catat setiap masalah:

```text
Time:
User:
Role:
Page:
Action:
Error message:
Impact:
Resolution:
Follow-up:
```

### 13.2. Release sign-off

Release dianggap aman jika:

- smoke test kasir lulus,
- smoke test shift lulus,
- dashboard owner lulus,
- laporan lulus,
- tidak ada error critical dalam monitoring window,
- owner menyetujui hasil.

## 14. Emergency Checklist

Jika toko sedang ramai dan sistem bermasalah:

1. Jangan panik rollback DB dulu.
2. Tentukan masalah frontend, backend, atau database.
3. Jika frontend blank, rollback frontend.
4. Jika WhatsApp gagal, lanjut transaksi dan tandai integration degraded.
5. Jika transaksi tidak bisa disimpan, stop kasir dan cek RPC/RLS.
6. Jika saldo/stok terlihat salah, jangan lakukan koreksi manual sebelum penyebab jelas.
7. Catat transaksi manual sementara hanya jika owner menyetujui.

## 15. Minimal Smoke Test Script Manual

Urutan paling pendek setelah deploy:

1. Login owner.
2. Login kasir.
3. Kasir buka shift.
4. Kasir jual 1 produk test.
5. Cek stok berkurang.
6. Cek riwayat transaksi.
7. Kasir closing.
8. Owner approve.
9. Cek laporan penjualan.
10. Cek audit log.
11. Cek WhatsApp status.

Jika 11 langkah ini lulus, deployment boleh dianggap operationally safe untuk lanjut monitoring.

## Final Go/No-Go

Go jika:

- backup valid,
- migration sukses,
- RPC/table/view verified,
- lint/build sukses,
- kasir smoke test sukses,
- shift smoke test sukses,
- reporting verified,
- rollback plan siap.

No-go jika:

- backup tidak ada,
- migration partial tanpa penjelasan,
- transaksi tidak bisa disimpan,
- shift tidak bisa dibuka/ditutup,
- owner tidak bisa login,
- RLS memblokir flow kasir,
- laporan critical blank,
- tidak ada orang yang siap rollback.
