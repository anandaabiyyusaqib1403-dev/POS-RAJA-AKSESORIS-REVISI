# Evaluasi Menyeluruh Production POS Raja Aksesoris

Tanggal evaluasi: 14 Mei 2026  
Target: mengubah POS Raja Aksesoris dari aplikasi POS kaya fitur menjadi retail operations platform yang scalable, reliable, realtime, dan maintainable.

## Executive Verdict

POS Raja Aksesoris sudah bukan POS sederhana. Sistem ini sudah masuk kategori operational platform: POS aksesoris, layanan digital, wallet internal, stok, stock opname, retur, shift, employee management, payroll sederhana, audit log, laporan, realtime presence, WhatsApp automation, dan thermal receipt printing.

Masalah utamanya bukan kurang fitur. Masalah utamanya adalah fitur sudah tumbuh lebih cepat daripada arsitektur.

Verdict brutal:

- Cocok untuk single store production kecil sampai menengah.
- Belum aman untuk volume besar tanpa hardening transaksi, wallet, shift, realtime, dan audit.
- Frontend sudah terlalu gemuk.
- `DataContext` sudah menjadi operational monolith.
- Realtime sudah ada, tapi sebagian besar masih pseudo realtime karena event memicu refetch besar.
- Database sudah punya banyak RPC atomic yang bagus, tetapi masih ada fallback/direct-write dan beberapa workflow yang belum benar-benar immutable.
- UX sudah lebih baik dari admin generic biasa, tetapi masih terlalu dashboard-heavy untuk POS retail yang butuh speed.
- Owner punya banyak data, tetapi belum punya command center yang tajam untuk keputusan harian.

Production readiness score saat ini: 6.7/10.

Target score setelah hardening: 8.5/10.

## Prinsip Audit

Evaluasi ini memakai kriteria retail POS real:

- Transaksi tidak boleh bergantung pada state browser untuk angka final.
- Ledger wallet tidak boleh mutable.
- Stock movement harus bisa direkonsiliasi.
- Shift closing harus dihitung authoritative dari database.
- Delete transaksi harus menjadi void/reversal, bukan menghilangkan fakta.
- Audit harus ditulis di server/RPC dalam transaksi yang sama.
- Realtime harus mengurangi stale data, bukan membuat query storm.
- Kasir harus bisa bekerja cepat, bukan membaca dashboard.
- Owner harus melihat anomaly, bukan mencari sendiri di tabel panjang.

## Critical Issues

### C1. Closing shift belum authoritative

Root cause: closing shift di frontend menghitung metric dari `accessoryTransactions`, `digitalTransactions`, dan `logisticsTransactions` yang sudah ada di state React. State ini dibatasi limit data, bisa stale, dan bisa belum sinkron saat transaksi baru masuk dari tab lain.

Impact: total cash, total digital, total transaksi, total item, dan selisih cash bisa tidak sama dengan database.

Severity: Critical.

Technical risk: angka closing bergantung pada client state, bukan query DB by `shift_id`.

UX risk: owner melihat angka closing yang terlihat valid padahal bisa salah.

Operational risk: dispute kasir-owner, salah approval, laporan kas harian kacau.

Production recommendation:

- Buat RPC `close_shift_atomic(p_shift_id, p_actual_cash, p_notes, p_pin_optional)`.
- RPC harus `select ... for update` shift row.
- RPC menghitung semua transaksi by `shift_id` langsung dari DB.
- RPC menyimpan snapshot closing: cash breakdown, digital breakdown, total transaction, total item, expected cash, actual cash, difference.
- Frontend hanya kirim actual cash dan notes.
- WhatsApp closing membaca snapshot DB, bukan hasil hitung frontend.

### C2. Delete transaksi tidak melakukan reversal stok/wallet

Root cause: `soft_delete_transaction_history` hanya set `deleted_at`. Permanent delete bisa menghapus record transaksi atau ledger yang sebelumnya sudah mempengaruhi stok dan wallet.

Impact: laporan mengecualikan transaksi, tetapi stok/wallet yang sudah berubah tidak otomatis balik.

Severity: Critical.

Technical risk: data derived tidak lagi konsisten dengan ledger movement.

UX risk: user mengira hapus transaksi berarti membatalkan transaksi.

Operational risk: phantom stock, saldo wallet meleset, audit finansial tidak bisa dipercaya.

Production recommendation:

- Ganti delete transaksi menjadi `void_transaction_atomic`.
- Void harus membuat reversal movement:
  - stock movement masuk untuk membalik penjualan aksesoris,
  - wallet movement kebalikan untuk QRIS/digital/wallet,
  - financial adjustment untuk laporan.
- Original transaction tetap immutable dengan status `voided`.
- Hard delete hanya untuk data dummy sebelum go-live, bukan transaksi production.

### C3. Wallet ledger masih mutable

Root cause: `transaksi_dompet` menjadi ledger utama sekaligus record yang bisa soft delete, restore, dan permanent delete. Saldo dihitung dari sum transaksi dompet.

Impact: saldo historis bisa berubah tanpa reversal trail yang bersih.

Severity: Critical.

Technical risk: rekonsiliasi tidak reliable jika row ledger bisa berubah/hilang.

UX risk: saldo berubah dan owner tidak tahu cerita lengkapnya.

Operational risk: fraud dan salah input sulit diselidiki.

Production recommendation:

- Jadikan wallet ledger append-only.
- Larang update/delete pada wallet ledger production.
- Tambahkan `wallet_accounts(platform, current_balance, updated_at)`.
- Mutasi wallet harus lewat RPC dengan advisory lock atau row lock.
- Koreksi saldo harus membuat entry `adjustment` atau `reversal`, bukan edit/hapus.
- Tambahkan `source_type`, `source_id`, `source_ref`, `correction_of`, `voided_by`, `voided_at`.

### C4. Stock opname bisa overwrite transaksi yang terjadi setelah count

Root cause: stock opname menyimpan `system_stock` saat sesi dibuat, lalu apply mengeset stok produk ke `real_stock`. Jika ada transaksi setelah count tetapi sebelum apply, hasil apply bisa menghapus dampak transaksi tersebut.

Impact: stok akhir bisa salah walau semua transaksi tercatat benar.

Severity: Critical.

Technical risk: lost update secara operasional.

UX risk: owner merasa opname memperbaiki stok padahal merusak stok terbaru.

Operational risk: phantom stock dan reorder salah.

Production recommendation:

- Tambahkan cutoff pada stock opname.
- Saat apply, cek apakah ada `stok_mutasi` untuk produk setelah session `created_at`.
- Jika ada, tampilkan konflik dan minta resolve.
- Alternatif aman: freeze transaksi kategori saat stock opname aktif.
- Simpan `applied_delta` berbasis kondisi terbaru, bukan sekadar set absolut tanpa conflict check.

### C5. WhatsApp automation belum production-safe

Root cause: frontend menahan notifikasi dengan `HOLD_WHATSAPP_NOTIFICATIONS = true`. Backend memakai file JSON untuk idempotency. File lokal tidak aman untuk serverless/multi-instance.

Impact: opening/closing WhatsApp bisa tidak terkirim, duplicate, atau statusnya tidak jelas.

Severity: Critical jika WhatsApp dipakai sebagai kontrol owner.

Technical risk: idempotency hilang saat deploy/restart.

UX risk: user melihat aksi sukses tetapi notifikasi tidak benar-benar keluar.

Operational risk: owner kehilangan alert shift.

Production recommendation:

- Buat tabel `notification_jobs`.
- Simpan `type`, `shift_id`, `payload`, `status`, `attempt_count`, `last_error`, `sent_at`, `provider_response`.
- Worker retry dengan exponential backoff.
- Idempotency key unique di DB: `(type, shift_id)`.
- UI shift menampilkan status WA: held, pending, sent, failed, retrying.

## High Priority Issues

### H1. `DataContext` sudah menjadi monolith

Root cause: satu context menyimpan hampir seluruh domain: products, transactions, wallet, shift, employees, payroll, returns, stock opname, realtime, maintenance jobs, report summary, dan mutation.

Impact: sulit dirawat, sulit dites, dan rawan rerender besar.

Severity: High.

Technical risk: coupling antar modul makin parah.

UX risk: halaman ikut lambat karena perubahan data yang tidak relevan.

Operational risk: bug kecil di domain stok bisa mempengaruhi kasir, wallet, atau shift.

Production recommendation:

- Pecah context menjadi:
  - `AuthContext`
  - `ShiftContext`
  - `CashierContext`
  - `InventoryContext`
  - `WalletContext`
  - `ReportingContext`
  - `EmployeeContext`
- Pindahkan mutation ke service layer:
  - `inventory.service.js`
  - `transactions.service.js`
  - `wallet.service.js`
  - `shift.service.js`
  - `returns.service.js`
  - `employee.service.js`
- Gunakan query hooks per halaman.

### H2. Realtime masih pseudo realtime

Root cause: Supabase `postgres_changes` sudah digunakan, tetapi banyak event memicu refetch tabel besar. Hanya produk yang sebagian dipatch granular.

Impact: realtime terasa live di toko kecil, tetapi akan menjadi query storm saat volume naik.

Severity: High.

Technical risk: excessive query, stale race, event burst, dan over-render.

UX risk: angka berkedip, delay, atau berubah mundur setelah refetch.

Operational risk: kasir melihat stok/saldo yang tidak paling baru.

Production recommendation:

- Buat `realtimeClient` terpusat.
- Event harus memicu invalidation granular.
- Patch row langsung jika payload cukup.
- Gunakan per-domain channel:
  - `inventory-sync`
  - `sales-sync`
  - `wallet-sync`
  - `shift-sync`
  - `employee-presence`
- Tambahkan recovery polling ringan tiap 60-120 detik untuk halaman kritikal.
- Tambahkan version/timestamp guard agar response lama tidak overwrite response baru.

### H3. Business logic terlalu banyak di frontend

Root cause: frontend masih menghitung nomor transaksi, precheck wallet, precheck stok, selected cashier context, closing metric, payment payload, dan fallback write.

Impact: DB punya atomic operation, tetapi frontend tetap menjadi rule engine kedua.

Severity: High.

Technical risk: aturan frontend dan RPC bisa divergen.

UX risk: error client bilang aman, DB menolak.

Operational risk: rule bisa dibypass dari devtools/API.

Production recommendation:

- Frontend mengirim intent minimal.
- RPC menentukan nomor transaksi final.
- RPC menentukan snapshot product price/cost.
- RPC menghitung shift totals.
- RPC menulis audit.
- RPC menolak action berdasarkan role, shift status, dan stock/wallet state.

### H4. Fallback direct-write harus dimatikan di production

Root cause: beberapa function mencoba RPC lalu fallback ke insert/update table langsung jika RPC missing.

Impact: ketika migration tidak lengkap, sistem tetap bisa menulis data lewat jalur yang lebih lemah.

Severity: High.

Technical risk: atomicity dan audit bisa hilang.

UX risk: aksi terlihat berhasil, tetapi side effect tidak lengkap.

Operational risk: data production tidak konsisten.

Production recommendation:

- Tambahkan guard `if (import.meta.env.PROD) throw missing RPC error`.
- Fallback hanya boleh di dev/migration repair tool.
- Tampilkan MigrationBanner yang blocking untuk fitur terkait jika RPC wajib belum ada.

### H5. Reporting belum sepenuhnya server-authoritative

Root cause: beberapa summary sudah memakai view/RPC, tetapi dashboard dan beberapa metric masih derive dari state context yang dibatasi limit.

Impact: angka antar halaman bisa berbeda.

Severity: High.

Technical risk: inconsistent source of truth.

UX risk: owner bingung mana angka benar.

Operational risk: keputusan stok, profit, dan cash salah.

Production recommendation:

- Semua laporan owner membaca server view/RPC.
- Dashboard tidak boleh menghitung dari raw limited context.
- Buat `finance_summary(p_start, p_end)`.
- Buat `dashboard_alerts_today()`.
- Buat materialized view jika data besar.

### H6. Audit belum atomic dan belum universal

Root cause: sebagian audit ditulis dari frontend setelah aksi sukses. Jika audit insert gagal, action tetap dianggap sukses.

Impact: ada aksi sensitif yang bisa tidak punya audit trail.

Severity: High.

Technical risk: audit bypass.

UX risk: halaman audit tidak lengkap.

Operational risk: investigasi fraud lemah.

Production recommendation:

- Audit harus ditulis di RPC dalam transaksi yang sama.
- `audit_logs` tetap immutable.
- Tambahkan trigger prevent update/delete.
- Semua action critical wajib punya audit:
  - shift approval,
  - stock mutation,
  - product price change,
  - wallet mutation,
  - void transaction,
  - reset PIN,
  - security setting change.

### H7. Backend production ownership belum bersih

Root cause: Express backend aktif hanya mount WhatsApp, tetapi folder route lama MySQL masih ada.

Impact: developer bisa salah memahami source of truth.

Severity: High.

Technical risk: deployment membawa endpoint legacy yang tidak sinkron.

UX risk: tidak langsung terlihat.

Operational risk: maintenance dan troubleshooting lambat.

Production recommendation:

- Tetapkan arsitektur final: Supabase sebagai source of truth, backend hanya integration service.
- Pindahkan route MySQL legacy ke `archive/legacy-mysql-routes` atau hapus.
- Dokumentasikan endpoint aktif.
- Tambahkan health check yang memvalidasi Fonnte env dan Supabase env.

## Medium Priority Issues

### M1. UX masih terlalu dashboard-heavy

Root cause: banyak halaman memakai card, metric, filter, table, dan copy deskriptif. Ini cocok untuk admin, kurang cocok untuk flow kasir cepat.

Impact: kasir harus membaca dan berpindah konteks.

Severity: Medium.

Technical risk: rendah.

UX risk: transaksi lambat saat toko ramai.

Operational risk: input salah ketika antrean panjang.

Production recommendation:

- Buat `Cashier Command Center`.
- Fokus layar kasir pada search/scan, cart, total, pembayaran, print.
- Teks deskripsi dikurangi di layar kasir.
- Shortcut dan quick tender dibuat permanen.

### M2. Digital service flow terlalu banyak mental model

Root cause: layanan produk, transfer bank, transfer e-wallet, payment customer, payment supplier, source wallet, modal, harga jual, dan target number bercampur di satu flow.

Impact: kasir bisa salah membedakan uang customer vs saldo supplier.

Severity: Medium.

Technical risk: salah mapping field.

UX risk: form terasa panjang.

Operational risk: profit dan wallet deduction salah.

Production recommendation:

- Pisah mode:
  - Produk layanan: pulsa, kuota, voucher, token.
  - Input manual: transfer bank/e-wallet/tarik tunai.
- Gunakan label eksplisit:
  - "Customer bayar pakai"
  - "Saldo toko dipotong dari"
  - "Harga jual ke customer"
  - "Modal/saldo supplier"
- Tampilkan preview profit dan wallet impact sebelum simpan.

### M3. Mobile responsive belum otomatis mobile-usable

Root cause: halaman menggunakan tabel, filter, modal, dan form besar. Layout bisa mengecil, tetapi belum tentu ergonomis untuk jari dan device kasir.

Impact: kasir mobile bisa lambat dan rawan salah input.

Severity: Medium.

Technical risk: rendah-menengah.

UX risk: tap target kecil dan scroll panjang.

Operational risk: salah nominal/stok.

Production recommendation:

- Mobile POS mode dengan:
  - bottom cart drawer,
  - sticky payment action,
  - numeric keypad besar,
  - cards untuk history,
  - table hanya desktop,
  - modal fullscreen untuk input kritikal.

### M4. Payroll membuat employee page terlalu mirip HR

Root cause: employee management menggabungkan roster operasional, account control, security, performance, dan payroll.

Impact: owner yang hanya mau cek siapa kerja harus melewati banyak informasi.

Severity: Medium.

Technical risk: coupling page.

UX risk: scan operasional lambat.

Operational risk: payroll mengaburkan kontrol shift.

Production recommendation:

- Pisah `Karyawan Operasional` dan `Payroll`.
- Default page owner: online/offline, shift aktif, transaksi hari ini, device, last seen.
- Payroll pindah ke tab atau halaman sekunder.

### M5. Build size sudah memberi warning

Root cause: export/excel/file-saver/lottie masuk bundle besar. Build menunjukkan chunk `index` dan `FileSaver` besar.

Impact: initial load bisa berat di device kasir murah.

Severity: Medium.

Technical risk: slow cold start.

UX risk: aplikasi terasa lambat saat buka toko.

Operational risk: kasir menunggu saat login.

Production recommendation:

- Lazy-load export modules.
- Dynamic import `exceljs`, `file-saver`, dan lottie besar.
- Manual chunks Vite untuk vendor besar.
- Jadikan receipt print module lazy.

### M6. Presence belum menjadi operational monitoring

Root cause: heartbeat dan presence sudah ada, tetapi event bisnis seperti failed PIN, failed checkout, route change, dan backend failure belum jadi timeline operasional.

Impact: owner tahu user online, tapi tidak tahu apa yang terjadi.

Severity: Medium.

Technical risk: observability kurang.

UX risk: owner tetap harus tanya manual.

Operational risk: masalah kasir tidak cepat terdeteksi.

Production recommendation:

- Tambah `operational_events` append-only:
  - login,
  - logout/session end,
  - route change penting,
  - open shift,
  - close shift,
  - failed transaction,
  - failed PIN,
  - WhatsApp failed,
  - stock conflict.

## Low Priority Issues

### L1. Design system masih campuran custom class dan utility

Root cause: ada `brand-*`, Tailwind inline, dan komponen UI sederhana yang belum menjadi design system penuh.

Impact: inkonsistensi muncul saat fitur bertambah.

Severity: Low.

Technical risk: maintenance styling meningkat.

UX risk: visual hierarchy tidak selalu konsisten.

Operational risk: kecil.

Production recommendation:

- Tetapkan token spacing, table density, button sizes, modal sizes, badge variants.
- Buat pattern baku untuk page header, filter bar, table, empty state, destructive modal.

### L2. Thermal print masih browser-dependent

Root cause: print memakai popup/window print browser.

Impact: bisa diblokir popup atau ukuran kertas tidak konsisten.

Severity: Low sampai Medium.

Technical risk: browser/device dependent.

UX risk: kasir harus reprint manual.

Operational risk: struk gagal saat ramai.

Production recommendation:

- Simpan receipt snapshot per transaksi.
- Reprint dari riwayat harus mudah.
- Sediakan mode 58mm/80mm yang eksplisit.
- Jika volume tinggi, pertimbangkan local print bridge.

## Area 1. Software Architecture

### Temuan

Struktur project masih root React + `backend/` Express + `api/` Vercel + Supabase migrations. Ini masih bisa diterima, tetapi sudah mulai penuh. Arsitektur data masih terlalu terkonsentrasi di frontend.

`DataContext` melakukan terlalu banyak hal:

- load semua domain,
- normalize semua data,
- realtime subscriptions,
- maintenance jobs,
- mutation produk,
- mutation transaksi,
- mutation wallet,
- mutation shift,
- mutation karyawan,
- mutation retur,
- report summary.

Ini anti-pattern untuk aplikasi yang sudah masuk domain retail operations.

### Root cause

Fitur ditambahkan secara organik tanpa domain boundary yang tegas.

### Impact

- Setiap domain saling tahu terlalu banyak.
- Sulit mengganti strategi query.
- Sulit testing unit.
- Rerender global mahal.
- Onboarding developer lambat.

### Recommendation

Target architecture:

```text
src/
  app/
    AppProviders.jsx
    routes.jsx
  features/
    cashier/
    digital/
    inventory/
    wallet/
    shifts/
    employees/
    reports/
    audit/
    returns/
  services/
    transactions.service.js
    inventory.service.js
    wallet.service.js
    shifts.service.js
    employees.service.js
    reports.service.js
    notifications.service.js
  realtime/
    realtimeClient.js
    inventoryChannel.js
    salesChannel.js
    walletChannel.js
    shiftChannel.js
  db/
    rpcNames.js
    tableNames.js
```

Migration path:

1. Extract services from `DataContext`.
2. Extract page-level query hooks.
3. Keep small global context only for auth, selected cashier, current shift summary, and notifications.
4. Remove fallback direct write for production.

## Area 2. UX Operational Flow

### Temuan

Sistem terasa seperti operational admin dashboard yang punya POS, bukan POS-first workspace. Ini bukan berarti jelek. UI rapi, tetapi kasir retail butuh speed ekstrem.

Kasir butuh:

- scan,
- add cart,
- pay,
- print,
- repeat.

Owner butuh:

- apakah toko aman hari ini,
- siapa aktif,
- ada shift pending,
- ada stok kritis,
- ada saldo kritis,
- ada transaksi aneh,
- ada WA gagal.

Saat ini owner mendapat banyak informasi, tapi anomaly hierarchy belum cukup tajam.

### Recommendation

Buat dua pengalaman utama:

- `Kasir Cepat`: layar transaksi minim distraksi.
- `Owner Command Center`: alert dan anomaly di atas, laporan detail di bawah.

## Area 3. Realtime System

### Temuan

Realtime sudah ada:

- Supabase channel `pos-data-sync`.
- Presence channel `employee-presence`.
- Heartbeat employee session 25 detik.
- Roster owner refresh saat presence sync.

Tetapi realtimenya masih banyak yang refetch. Ini cocok untuk data kecil, tidak cocok untuk event padat.

### Risk

- event burst membuat banyak query,
- stale response bisa overwrite state baru,
- channel terlalu banyak table dalam satu lifecycle,
- tab kasir bisa melihat wallet/stok lama beberapa detik.

### Recommendation

Realtime strategy:

- gunakan patch langsung untuk `produk`, `shifts`, `transaksi_dompet` terbaru,
- invalidate summary, bukan refetch semua raw,
- pakai `updated_at` atau `version` untuk conflict guard,
- tambahkan heartbeat recovery,
- buat UI indicator: online, reconnecting, stale, offline.

## Area 4. Database Design

### Kekuatan

- Banyak RPC atomic sudah memakai row lock.
- Wallet memakai advisory lock per platform.
- Stock transaction memakai `for update`.
- Ada RLS.
- Ada views untuk reporting.
- Ada audit log immutable baseline.

### Kelemahan

- Ledger wallet belum append-only secara konsep.
- Transaction delete belum reversal.
- Closing shift belum DB-authoritative.
- Stock opname perlu conflict detection.
- Banyak enum platform membuat perubahan payment method menjadi migration-heavy.

### Recommendation

- Tambah ledger model immutable.
- Tambah void/reversal.
- Tambah closing RPC.
- Pertimbangkan lookup table untuk payment platform daripada enum jika platform sering berubah.
- Tambah reconciliation views.

## Area 5. Wallet / Saldo Engine

### Temuan

Wallet engine sudah punya dasar bagus:

- saldo dihitung dari ledger,
- ada advisory lock,
- ada source_type/source_id,
- transaksi digital bisa potong Pasar Kuota,
- QRIS inflow bisa otomatis dicatat.

Namun masih kurang aman untuk fintech-style operation karena ledger masih bisa dihapus dan belum punya balance snapshot.

### Recommendation

Wallet target model:

```text
wallet_accounts
  id
  platform
  current_balance
  updated_at

wallet_ledger
  id
  account_id
  direction
  amount
  balance_before
  balance_after
  source_type
  source_id
  source_ref
  actor_id
  reason
  reversal_of
  created_at
```

Tidak ada edit/delete. Koreksi selalu entry baru.

## Area 6. Stock Engine

### Temuan

Stock engine cukup serius:

- transaksi aksesoris mengurangi stok atomic,
- mutasi stok punya log,
- retur supplier/konsumen mempengaruhi stok,
- stock opname punya session dan item,
- product delete soft-delete.

Kelemahannya:

- stock opname conflict belum aman,
- restore product tidak otomatis validasi dampak stok historis,
- product permanent delete bisa menghilangkan referensi master jika tidak semua snapshot lengkap,
- kategori masih string bebas.

### Recommendation

- Semua movement append-only di `stock_movements`.
- Produk boleh inactive/deleted, tapi product master production sebaiknya tidak hard delete jika pernah transaksi.
- Stock opname harus conflict-aware.
- Kategori sebaiknya table `product_categories`, bukan string bebas, jika ingin scale.

## Area 7. Shift System

### Temuan

Shift system sudah punya opening, closing, approval, correction, auto-close, dan WA notification. Ini bagus.

Kelemahan utama:

- closing calculation dari frontend,
- auto-close dijalankan sebagai maintenance saat load user, bukan guaranteed scheduled job,
- WA status tidak durable,
- approval masih bisa lebih kuat dengan PIN owner dan audit atomic.

### Recommendation

- `open_shift_atomic`
- `close_shift_atomic`
- `approve_shift_atomic`
- `approve_shift_with_correction_atomic`
- scheduled auto-close via cron atau Supabase scheduled function,
- shift event log append-only.

## Area 8. Employee Management

### Temuan

Employee management sudah melampaui kebutuhan akun kasir:

- account status,
- PIN,
- payroll,
- performance,
- presence,
- device,
- security controls.

Ini powerful, tetapi rawan menjadi HR module yang terlalu berat.

### Recommendation

Pisahkan:

- Operational roster: online, shift, last seen, today transactions.
- Account control: role, status, PIN.
- Payroll: optional, tidak di default operational view.

## Area 9. Security & Audit

### Temuan

Kekuatan:

- Supabase Auth.
- RLS.
- RPC role validation.
- PIN verification.
- audit_logs immutable trigger.

Kelemahan:

- beberapa audit dari frontend,
- sensitive action success/failed ditulis dari hook client,
- fallback direct-write,
- owner sebagai superuser harus konsisten di semua layer,
- PIN 4-8 digit perlu rate limit/lockout.

### Recommendation

- Tambah rate limit PIN failed attempt.
- Audit critical di RPC.
- Hilangkan fallback production.
- Owner superuser tetap boleh semua, tetapi semua action destructive owner harus audited.
- Session metadata masuk audit secara konsisten.

## Area 10. Performance

### Temuan

Build lulus tetapi ada warning chunk besar. Data load global juga menjadi risiko utama.

Risk:

- context value besar memicu rerender,
- realtime refetch mahal,
- table rendering panjang,
- export dependency besar,
- dashboard menghitung data client.

### Recommendation

- Lazy-load export modules.
- Pagination.
- Virtualized table untuk history besar.
- Server summary untuk dashboard.
- Memoize context per domain.
- Gunakan query caching.

## Area 11. UI/UX Design System

### Temuan

Design system sudah punya `brand-*` class dan komponen Panel, MetricCard, Button, Input, Table. Ini cukup baik.

Kelemahan:

- class utility dan custom masih campur,
- page density belum punya standar,
- destructive modal belum selalu punya struktur yang sama,
- table mobile belum jelas pattern-nya.

### Recommendation

Buat design tokens dan UI rules:

- button sizes,
- input height,
- table density,
- modal size,
- alert severity,
- badge semantic,
- form grid,
- mobile card table.

## Area 12. Reporting System

### Temuan

Reporting kaya, tetapi risk-nya adalah terlalu banyak metric. Owner retail biasanya butuh jawaban cepat:

- uang masuk berapa,
- profit berapa,
- kas aman atau tidak,
- stok apa yang harus dibeli,
- saldo mana yang kurang,
- kasir mana yang perlu dicek.

### Recommendation

Reporting hierarchy:

1. Alert/anomaly.
2. Today summary.
3. Trend.
4. Breakdown.
5. Detail table.
6. Export.

Jangan mulai laporan dengan terlalu banyak card setara.

## Area 13. Mobile Experience

### Temuan

Belum cukup bukti bahwa mobile benar-benar operationally usable. Responsive layout bukan sama dengan mobile POS.

### Recommendation

Mobile kasir:

- sticky bottom total,
- cart drawer,
- numeric keypad,
- product cards besar,
- scan-first input,
- one-thumb checkout.

Mobile owner:

- alert list,
- approval shift,
- stok kritis,
- saldo kritis,
- laporan detail tetap desktop-first.

## Area 14. WhatsApp Automation

### Temuan

Automation sudah ada secara konsep, tetapi belum production-safe karena hold flag dan file idempotency.

### Recommendation

Notification architecture:

```text
notification_jobs
  id
  type
  entity_type
  entity_id
  idempotency_key
  target
  payload
  message
  status
  attempt_count
  next_retry_at
  sent_at
  last_error
  provider_response
  created_at
```

Worker:

- send pending,
- retry failed,
- never block transaction,
- surface failure to owner.

## Target Architecture Recommendation

### Current

Frontend besar -> Supabase RPC/tables -> some Express integration.

### Target

Frontend:

- UI only,
- page queries,
- local workflow state,
- no financial final calculation.

Supabase:

- source of truth,
- atomic transaction engine,
- immutable audit,
- reporting views,
- realtime source.

Backend:

- integration jobs,
- WhatsApp queue worker,
- external provider adapters,
- health check.

## Roadmap Implementasi

### Phase 0. Freeze

Durasi: 1-2 hari.

- Freeze feature expansion.
- Tandai semua fallback direct-write.
- Tandai semua delete destructive.
- Pastikan owner role superuser konsisten.

### Phase 1. Critical Financial Hardening

Durasi: 1-2 minggu.

- Implement `close_shift_atomic`.
- Implement transaction void/reversal.
- Make wallet ledger append-only.
- Add wallet balance snapshot.
- Add stock opname conflict detection.
- Disable production fallback direct-write.

### Phase 2. Realtime and Data Loading

Durasi: 1-2 minggu.

- Split realtime channels per domain.
- Replace refetch-all with granular invalidation.
- Move dashboard to server summary.
- Add stale/offline UI state.
- Add query response version guard.

### Phase 3. Architecture Refactor

Durasi: 2-4 minggu.

- Extract services from `DataContext`.
- Split providers by domain.
- Create page-level query hooks.
- Lazy-load export dependencies.
- Remove legacy backend routes.

### Phase 4. UX Operational Redesign

Durasi: 2-3 minggu.

- Cashier Command Center.
- Digital quick flow.
- Owner Command Center.
- Mobile POS mode.
- Standard modal/table/filter design.

### Phase 5. Observability and Automation

Durasi: 1-2 minggu.

- Notification jobs.
- WhatsApp retry.
- Operational events.
- Incident code.
- Health dashboard.
- Backup/reconciliation checklist.

## Production Backlog

### P0

- DB authoritative shift closing.
- Wallet append-only ledger.
- Transaction void with reversal.
- Disable production direct-write fallback.
- Stock opname conflict detection.
- Durable WhatsApp notification jobs.

### P1

- Split `DataContext`.
- Server authoritative dashboard.
- Realtime granular invalidation.
- Audit critical actions inside RPC.
- Owner PIN for approval/correction/destructive actions.
- Backend legacy cleanup.

### P2

- Mobile POS mode.
- Cashier command center.
- Digital quick input.
- Reporting hierarchy redesign.
- Bundle optimization.
- Employee page split.

### P3

- Supplier reorder recommendations.
- Materialized report refresh.
- Local print bridge.
- Multi-store readiness.
- Advanced fraud anomaly detection.

## Definition of Done

Sistem dianggap production-hardened jika:

- Shift closing tidak menghitung dari frontend state.
- Tidak ada delete transaksi production tanpa reversal.
- Wallet ledger tidak bisa diedit/hapus.
- Stock opname tidak bisa overwrite movement terbaru tanpa warning.
- Dashboard/laporan owner memakai server summary.
- Realtime tidak refetch semua tabel besar untuk event kecil.
- Audit critical action ditulis di RPC.
- WhatsApp punya job queue dan retry.
- Kasir bisa transaksi cepat dengan scan/search, quick payment, print, dan reprint.
- Owner bisa scan anomaly dalam 30 detik.
- Build dan lint bersih tanpa chunk utama terlalu besar.

## Kesimpulan

POS Raja Aksesoris punya pondasi produk yang kuat. Masalahnya bukan fitur kurang, tetapi sistem sudah masuk fase dimana disiplin arsitektur harus menang atas penambahan fitur.

Prioritas berikutnya harus jelas:

1. Amankan uang.
2. Amankan stok.
3. Amankan shift.
4. Amankan audit.
5. Ringankan frontend.
6. Buat realtime benar-benar realtime.
7. Jadikan kasir cepat dan owner tajam.

Jika roadmap ini dijalankan, sistem bisa naik kelas dari POS web besar menjadi retail operations platform yang stabil.
