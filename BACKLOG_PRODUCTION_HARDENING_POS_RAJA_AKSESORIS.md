# Backlog Production Hardening POS Raja Aksesoris

Dokumen ini adalah turunan taktis dari `EVALUASI_MENYELURUH_PRODUCTION_POS_RAJA_AKSESORIS.md`.

Tujuannya: mengubah temuan audit menjadi pekerjaan implementasi yang bisa dieksekusi per sprint.

## Sprint 0: Freeze dan Safety Gate

Status target: tidak ada fitur baru sebelum area uang, stok, shift, dan audit diamankan.

### Task 0.1. Tandai jalur fallback direct-write

Priority: P0  
Owner: engineering  
Area: architecture, database safety

Checklist:

- Cari semua `callOptionalAtomicRpc`.
- Klasifikasikan fallback yang melakukan insert/update/delete langsung.
- Tambah guard production:
  - jika RPC missing di production, tampilkan error blocking,
  - fallback hanya jalan di development.
- Tambah pesan UI: "Migration belum lengkap. Fitur ini belum aman dipakai."

Acceptance criteria:

- Tidak ada mutation production yang silently fallback ke direct table write.
- Lint dan build tetap lulus.

### Task 0.2. Dokumentasikan source of truth backend

Priority: P1  
Owner: engineering  
Area: backend architecture

Checklist:

- Tetapkan Supabase sebagai source of truth data.
- Tetapkan Express hanya untuk integration jobs.
- Tandai route MySQL legacy sebagai archived/deprecated.
- Update README atau buat `BACKEND_SOURCE_OF_TRUTH.md`.

Acceptance criteria:

- Developer baru paham endpoint mana yang aktif production.
- Route legacy tidak dianggap bagian dari alur data POS.

## Sprint 1: Financial Critical Hardening

### Task 1.1. Implement `close_shift_atomic`

Priority: P0  
Owner: database engineer  
Area: shift, financial reporting

Problem:

Closing shift saat ini menghitung dari state React.

Implementation outline:

- Buat migration baru.
- RPC input:
  - `p_shift_id uuid`
  - `p_actual_cash integer`
  - `p_notes text`
- RPC behavior:
  - validasi user login,
  - validasi role/cashier ownership,
  - lock shift row `for update`,
  - hitung transaksi aksesoris by `shift_id`,
  - hitung transaksi digital by `shift_id`,
  - hitung transaksi logistik by `shift_id`,
  - hitung cash/digital breakdown dari payment method,
  - update shift menjadi `pending`,
  - simpan `expected_cash`, `actual_cash`, `difference`, `total_cash`, `total_digital`, `total_transactions`, `total_items`,
  - tulis audit log.

Frontend changes:

- `closeShift()` hanya panggil RPC.
- WhatsApp closing pakai hasil RPC.

Acceptance criteria:

- Closing tetap benar walau transaksi dibuat dari tab lain tepat sebelum closing.
- Closing tidak bergantung pada `DATA_LOAD_LIMITS`.
- Shift yang sudah pending tidak bisa ditutup ulang.

### Task 1.2. Implement transaction void dengan reversal

Priority: P0  
Owner: database engineer  
Area: transaction integrity

Problem:

Delete transaksi tidak membalik stok/wallet.

Implementation outline:

- Tambah status transaksi: `active`, `voided`.
- Tambah kolom:
  - `voided_at`
  - `voided_by`
  - `void_reason`
  - `void_reversal_id`
- Buat RPC `void_transaction_atomic(p_source text, p_id uuid, p_reason text)`.
- Untuk aksesoris:
  - lock transaction,
  - lock items/products,
  - insert stock movement reversal,
  - update product stock,
  - reverse QRIS wallet inflow jika ada.
- Untuk digital:
  - reverse wallet deduction,
  - reverse QRIS inflow,
  - mark voided.
- Untuk logistics:
  - reverse QRIS inflow jika ada.
- Untuk wallet manual:
  - create opposite wallet movement,
  - mark original as voided.
- Tulis audit log.

Acceptance criteria:

- Tidak ada hard delete transaksi production.
- Laporan mengecualikan voided transaction tetapi audit tetap menyimpan histori.
- Stock dan wallet balance berubah via reversal entry.

### Task 1.3. Wallet ledger append-only

Priority: P0  
Owner: database engineer  
Area: wallet, fintech safety

Problem:

Wallet ledger bisa soft/hard delete.

Implementation outline:

- Tambah tabel `wallet_accounts`.
- Tambah tabel baru `wallet_ledger` atau harden `transaksi_dompet`.
- Tambah `balance_before`, `balance_after`.
- Tambah trigger prevent update/delete untuk ledger production.
- RPC `create_wallet_transaction_atomic` update account balance dalam transaction.
- Reversal membuat entry baru.

Acceptance criteria:

- Saldo saat ini bisa dibaca cepat dari `wallet_accounts`.
- Riwayat wallet lengkap dan immutable.
- Koreksi tidak menghapus histori.

### Task 1.4. Stock opname conflict detection

Priority: P0  
Owner: database engineer  
Area: inventory safety

Problem:

Apply opname bisa overwrite transaksi setelah count.

Implementation outline:

- Saat create session, simpan `cutoff_at`.
- Saat save item, simpan `counted_at`.
- Saat apply, cek `stok_mutasi` setelah cutoff/count.
- Jika ada movement baru, mark item sebagai `conflict`.
- RPC menolak apply jika ada conflict unresolved.
- Tambah UI conflict resolution.

Acceptance criteria:

- Opname tidak bisa menghilangkan efek transaksi terbaru.
- Owner melihat produk mana yang konflik.

## Sprint 2: Audit dan Security

### Task 2.1. Audit critical actions inside RPC

Priority: P1  
Owner: database engineer  
Area: audit

Checklist action:

- shift open/close/approve/correction,
- product create/edit/delete/restore/permanent delete,
- price/cost change,
- stock mutation,
- wallet mutation,
- transaction void,
- employee status change,
- PIN reset,
- security control change.

Acceptance criteria:

- Jika action sukses, audit wajib ada.
- Jika audit gagal, action critical gagal juga.

### Task 2.2. Owner PIN for destructive actions

Priority: P1  
Owner: frontend + database  
Area: security UX

Actions requiring owner PIN:

- approve shift with correction,
- permanent delete product,
- void transaction,
- manual wallet correction,
- stock adjustment non-restock,
- disable PIN/security controls,
- reset production data.

Acceptance criteria:

- Owner tetap superuser, tetapi destructive action selalu audited dan dikonfirmasi.
- Kasir tetap mengikuti policy PIN sesuai security controls.

### Task 2.3. PIN attempt rate limit

Priority: P1  
Owner: database engineer  
Area: auth/security

Implementation outline:

- Tambah table `pin_attempts`.
- Track failed attempts per user/session.
- Lock PIN check sementara setelah beberapa gagal.
- Tulis audit failed PIN.

Acceptance criteria:

- Brute force PIN tidak feasible dari UI/API.
- Owner bisa melihat failed PIN anomaly.

## Sprint 3: Data Loading dan Realtime

### Task 3.1. Split read data by page

Priority: P1  
Owner: frontend engineer  
Area: performance

Current problem:

Global `loadData()` mengambil banyak domain sekaligus.

Implementation outline:

- Buat query hook per halaman:
  - `useProductsPageData`
  - `useCashierData`
  - `useWalletData`
  - `useShiftData`
  - `useReturnsData`
  - `useReportsData`
- `DataContext` hanya simpan active cashier dan current shift summary.

Acceptance criteria:

- Buka halaman kasir tidak perlu load laporan, payroll, retur, audit.
- Halaman owner berat tidak mempengaruhi kasir.

### Task 3.2. Realtime invalidation layer

Priority: P1  
Owner: realtime engineer  
Area: realtime

Implementation outline:

- Buat `src/realtime/realtimeClient.js`.
- Buat domain subscription:
  - inventory,
  - sales,
  - wallet,
  - shifts,
  - employee presence.
- Event kecil patch state kecil.
- Event besar invalidate query spesifik.
- Tambah `lastSyncedAt` dan `isStale`.

Acceptance criteria:

- Realtime update tidak memicu full `loadData()`.
- Stok produk berubah granular.
- Shift/presence update tidak menarik semua transaksi.

### Task 3.3. Server authoritative dashboard

Priority: P1  
Owner: database + frontend  
Area: reporting performance

Implementation outline:

- Buat RPC `get_dashboard_alerts_today`.
- Buat RPC/view `get_dashboard_summary(p_start, p_end)`.
- Dashboard membaca summary server.
- Data mentah hanya untuk drilldown.

Acceptance criteria:

- Dashboard tidak bergantung pada limited context rows.
- Angka dashboard sama dengan laporan.

## Sprint 4: UX Operational Redesign

### Task 4.1. Cashier Command Center

Priority: P2  
Owner: product designer + frontend  
Area: kasir UX

Layout:

- top: search/barcode input,
- left: product/service quick grid,
- right: cart,
- bottom/right sticky: total dan payment actions,
- keyboard shortcuts tetap aktif.

Acceptance criteria:

- Kasir bisa scan, bayar pas, print tanpa pindah halaman.
- Flow cash dan QRIS maksimal 2-3 action setelah produk dipilih.

### Task 4.2. Digital quick mode

Priority: P2  
Owner: product designer + frontend  
Area: digital service UX

Implementation:

- Pisah produk layanan dan input manual.
- Recent/favorite provider.
- Preview wallet impact.
- Profit warning merah jika margin negatif.

Acceptance criteria:

- Kasir tidak bingung antara customer payment dan supplier wallet.
- Transaksi pulsa/kuota bisa disimpan cepat.

### Task 4.3. Owner Command Center

Priority: P2  
Owner: product designer + frontend  
Area: owner UX

Default owner screen:

- shift pending,
- WA failed,
- stock critical,
- wallet low,
- cash mismatch,
- transaksi voided,
- failed PIN,
- top action buttons.

Acceptance criteria:

- Owner bisa tahu kondisi toko dalam 30 detik.
- Laporan detail tidak mengalahkan anomaly.

## Sprint 5: WhatsApp and Observability

### Task 5.1. Durable WhatsApp queue

Priority: P0/P1  
Owner: backend engineer  
Area: integration

Implementation outline:

- Tambah table `notification_jobs`.
- `postShiftWhatsappNotification` create job atau hit API yang create job.
- Worker send Fonnte.
- Retry failed.
- UI tampilkan status.

Acceptance criteria:

- No silent failure.
- No duplicate message for same shift/type.
- Owner bisa retry manual.

### Task 5.2. Operational events

Priority: P2  
Owner: database + frontend  
Area: observability

Events:

- login,
- logout/session end,
- open shift,
- close shift,
- failed checkout,
- failed PIN,
- void transaction,
- WhatsApp failed,
- stock conflict.

Acceptance criteria:

- Owner punya timeline operasional.
- Debug production tidak hanya dari console.

## Sprint 6: Bundle and Frontend Performance

### Task 6.1. Lazy load export dependencies

Priority: P2  
Owner: frontend engineer  
Area: bundle

Checklist:

- Dynamic import `exceljs`.
- Dynamic import `file-saver`.
- Lazy import lottie assets.
- Manual chunk vendor besar.

Acceptance criteria:

- Initial chunk turun signifikan.
- Export tetap bekerja.

### Task 6.2. Virtualize large tables

Priority: P3  
Owner: frontend engineer  
Area: table performance

Targets:

- Riwayat transaksi.
- Audit logs.
- Product history.
- Stock mutation.
- Returns.

Acceptance criteria:

- Table tetap smooth untuk ribuan row.

## Risk Matrix

| Risk | Priority | Fix |
|---|---:|---|
| Closing shift salah karena client state | P0 | `close_shift_atomic` |
| Wallet balance berubah tanpa audit | P0 | append-only ledger |
| Delete transaksi tidak reversal | P0 | void transaction |
| Stock opname overwrite movement | P0 | conflict detection |
| WhatsApp gagal diam-diam | P0/P1 | durable queue |
| DataContext monolith | P1 | domain providers/services |
| Realtime query storm | P1 | invalidation layer |
| Dashboard beda angka | P1 | server summary |
| Audit bypass | P1 | audit inside RPC |
| Kasir flow lambat | P2 | command center |

## Minimal Release Gate

Jangan label sistem "production-hardened" sampai syarat ini terpenuhi:

- `npm run lint` lulus.
- `npm run build` lulus.
- Closing shift DB-authoritative.
- Wallet mutation append-only atau minimal no hard delete.
- Transaction void punya reversal.
- Audit critical action server-side.
- WhatsApp status tidak silent.
- Dashboard summary server-side.
- Kasir tidak load semua domain saat buka POS.
