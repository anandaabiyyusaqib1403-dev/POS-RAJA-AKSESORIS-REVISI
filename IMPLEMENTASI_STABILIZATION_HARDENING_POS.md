# Implementasi Stabilization & Operational Hardening POS Raja Aksesoris

## Objective Release

Versi berikutnya harus menjadi **Stabilization & Operational Hardening Release**.

Fokus bukan menambah fitur random, tetapi mengubah sistem dari aplikasi dengan banyak fitur menjadi retail operation system yang:

- cepat untuk kasir,
- jelas untuk owner,
- aman secara operasional,
- scalable untuk data besar,
- maintainable untuk developer,
- siap production jangka panjang.

## 1. Arsitektur Improvement Plan

### Keputusan Arsitektur Utama

Gunakan **Option A**:

**Supabase sebagai source utama. Express hanya untuk WhatsApp, cron, external jobs, dan integrasi pihak ketiga.**

Alasan:

- Frontend saat ini sudah kuat bergantung ke Supabase Auth, RLS, RPC, dan realtime.
- Banyak atomic operation sudah ditulis di Supabase function.
- Memindahkan semua ke Express full backend akan jauh lebih mahal.
- Express route MySQL yang ada tampak legacy dan tidak sinkron dengan schema Supabase utama.

### Target Arsitektur

Frontend React:

- UI dan flow kasir.
- Query per halaman.
- Local state ringan.
- Tidak lagi menyimpan seluruh database di satu global context.

Supabase:

- Source of truth data.
- Auth.
- RLS.
- Atomic RPC.
- Views/materialized views.
- Audit log.
- Realtime event source.

Express backend:

- WhatsApp notification.
- Retry queue worker.
- Scheduled jobs jika tidak memakai Supabase cron.
- Health check.
- External provider integration.

### Prinsip Baru

- Jangan load semua data global.
- Jangan hitung laporan besar di client.
- Jangan mutate data sensitif tanpa audit.
- Jangan action owner tanpa PIN untuk operasi critical.
- Jangan tampilkan raw error ke user production.

## 2. Prioritas Implementasi

### Phase 1: Production Stabilization

Prioritas tertinggi:

1. Data loading dipisah per halaman.
2. Pagination untuk history, logs, wallet, retur, stock mutation.
3. Error hardening.
4. Backend cleanup.
5. Owner PIN untuk reset dan approval.
6. Audit log immutable baseline.

### Phase 2: Kasir Speed

1. Compact POS mode.
2. Autofocus barcode/search.
3. Keyboard shortcut.
4. Quick payment.
5. Repeat last transaction.
6. Favorite product/service.

### Phase 3: Owner Control

1. Anomaly dashboard.
2. Shift review detail.
3. Low margin alert.
4. Critical stock alert.
5. Wallet reconciliation.

### Phase 4: Scale & Reporting

1. Summary views.
2. Materialized reporting.
3. Archive strategy.
4. Query indexes.
5. Background jobs.

## 3. Refactor Strategy

### Current Problem

`DataContext` terlalu besar dan menjadi pusat semua data:

- produk,
- transaksi,
- wallet,
- kas,
- shift,
- stock opname,
- retur,
- laporan,
- logs,
- realtime.

Ini membuat:

- load awal berat,
- halaman saling bergantung,
- realtime reload global,
- sulit testing,
- sulit scale.

### Target Refactor

Pisahkan menjadi domain hooks:

- `useProductsQuery`
- `useCashierSession`
- `useTransactionsQuery`
- `useWalletLedgerQuery`
- `useShiftQuery`
- `useDashboardSummary`
- `useSalesReportQuery`
- `useStockMutationQuery`
- `useReturnsQuery`
- `useAuditLogQuery`

### Data Context Baru

`DataContext` sebaiknya hanya menyimpan:

- auth user derived context,
- active cashier/shift summary,
- notification helpers,
- shared invalidation utilities.

Jangan lagi menyimpan semua tabel mentah.

### Mutation Layer

Buat service layer:

- `src/services/products.js`
- `src/services/transactions.js`
- `src/services/wallet.js`
- `src/services/shifts.js`
- `src/services/reports.js`
- `src/services/audit.js`

Semua mutation panggil service, bukan langsung tersebar di page.

## 4. UI/UX Redesign Recommendation

### Kasir Command Center

Buat mode kasir utama yang single-screen:

- Search/scan produk di atas.
- Product grid kiri.
- Cart kanan.
- Total besar.
- Payment action sticky.
- Print/reprint dekat tombol transaksi.

Hilangkan dari layar kasir:

- deskripsi panjang,
- card informatif yang tidak diperlukan,
- panel nested,
- teks onboarding berulang.

### Keyboard Shortcut

Tambahkan:

- `F2`: focus search/barcode.
- `F4`: lanjut checkout.
- `F8`: bayar pas.
- `Esc`: reset cart atau tutup modal.
- `Enter`: confirm active action.

Tampilkan shortcut dalam tooltip atau footer kecil, bukan teks besar.

### Barcode First

Behavior ideal:

- Search input autofocus saat halaman kasir dibuka.
- Scan barcode langsung add to cart.
- Scan barcode sama menambah qty.
- Jika barcode tidak ditemukan, tampilkan modal kecil: "Produk tidak ditemukan".

### Quick Payment

Untuk cash:

- Bayar pas.
- Nominal cepat berdasarkan total.
- Kembalian besar dan jelas.

Untuk QRIS:

- Tombol quick QRIS.
- Tidak perlu input cash.

Untuk transfer/e-wallet:

- Recent payment terakhir.
- Default payment kasir bisa disimpan per device.

### Digital Flow

Pisahkan menjadi dua mode:

1. **Produk Layanan**
   - pilih kategori,
   - provider,
   - nominal,
   - nomor tujuan,
   - checkout.

2. **Input Manual**
   - transfer bank/e-wallet,
   - nominal,
   - harga jual,
   - modal/sumber saldo,
   - checkout.

Jangan gabungkan mental model keduanya dalam satu panel panjang.

## 5. Database Optimization Plan

### Pagination Tables

Wajib pagination:

- `transaksi`
- `item_transaksi`
- `transaksi_digital`
- `transaksi_dompet`
- `transaksi_logistik`
- `kas`
- `stok_mutasi`
- `product_activity_logs`
- `supplier_returns`
- `customer_returns`
- `stock_opname_sessions`

### Index Recommendation

Tambahkan atau pastikan index:

- `transaksi(created_at desc)`
- `transaksi(kasir_id, created_at desc)`
- `transaksi(shift_id)`
- `transaksi(no_transaksi)`
- `item_transaksi(transaksi_id)`
- `item_transaksi(produk_id)`
- `transaksi_digital(created_at desc)`
- `transaksi_digital(kasir_id, created_at desc)`
- `transaksi_digital(provider, created_at desc)`
- `transaksi_digital(jenis, created_at desc)`
- `transaksi_dompet(platform, created_at desc)`
- `transaksi_dompet(source_type, source_id)`
- `stok_mutasi(produk_id, created_at desc)`
- `stok_mutasi(tipe, created_at desc)`
- `kas(tanggal desc, created_at desc)`
- `shifts(status, start_time desc)`
- `shifts(cashier_id, start_time desc)`
- `supplier_returns(status, created_at desc)`
- `customer_returns(transaction_id, created_at desc)`
- `audit_logs(actor_id, created_at desc)`
- `audit_logs(target_table, target_id)`
- `audit_logs(action, created_at desc)`

### Summary Views

Buat views:

- `daily_sales_summary`
- `cashier_shift_summary`
- `provider_sales_summary`
- `wallet_daily_summary`
- `stock_summary`
- `product_sales_summary`
- `return_summary`

Dashboard membaca summary, bukan raw transaction.

### Materialized View Strategy

Untuk toko kecil, normal view cukup.

Untuk data besar:

- gunakan materialized view,
- refresh tiap closing shift,
- refresh tiap malam,
- refresh manual setelah import besar.

## 6. Security Hardening Checklist

### Immutable Audit Log

Buat tabel `audit_logs`:

- `id`
- `actor_id`
- `actor_role`
- `action`
- `target_table`
- `target_id`
- `before_value jsonb`
- `after_value jsonb`
- `reason`
- `device_info`
- `session_id`
- `ip_address`
- `created_at`

Rules:

- Insert only.
- No update.
- No delete from frontend role.
- Owner bisa read.
- Kasir tidak perlu read audit global.

### Action Wajib Audit

- edit harga,
- edit modal,
- edit stok,
- mutasi stok,
- mutasi wallet,
- retur supplier,
- retur konsumen,
- approve shift,
- approve correction,
- reset data,
- restore transaction,
- permanent delete,
- owner reset PIN.

### Owner PIN Required

Wajib PIN owner untuk:

- approve shift,
- approve correction,
- reset data,
- stock adjustment selain stok masuk,
- permanent delete produk,
- permanent delete transaksi,
- wallet correction manual.

### Error Hardening

Production:

- Jangan tampilkan raw stack/error.
- Buat incident code:
  - `ERR-AUTH-001`
  - `ERR-DATA-001`
  - `ERR-SHIFT-001`
  - `ERR-WALLET-001`
- Log internal ke console hanya dev.
- User melihat pesan operasional.

## 7. Scalability Roadmap

### Step 1

Ganti global load dengan page-level queries.

### Step 2

Tambah pagination dan date filter di history/laporan.

### Step 3

Tambah summary views untuk dashboard.

### Step 4

Realtime hanya update state spesifik:

- produk changed -> invalidate product query,
- transaksi changed -> invalidate dashboard summary,
- shift changed -> update shift state,
- wallet changed -> invalidate wallet summary.

### Step 5

Archive data lama:

- transaksi aktif tetap query 90 hari terakhir,
- data lama masuk archive/report mode,
- export tetap bisa ambil range lama.

## 8. Production Deployment Recommendation

### Frontend

- Build Vite static.
- Deploy ke Vercel/Netlify/hosting static.
- ENV hanya:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_BACKEND_URL`

### Backend

Express hanya untuk:

- `/ping`
- `/api/health`
- `/api/whatsapp/opening`
- `/api/whatsapp/closing`
- `/api/whatsapp/retry`
- cron/external jobs

Hapus atau disable route MySQL legacy di production.

### Observability

Tambahkan:

- backend request log,
- WhatsApp delivery log,
- frontend incident code,
- Supabase function error monitoring,
- daily backup checklist.

## 9. High-Risk Area Warning

### High Risk 1: DataContext Global

Paling berisiko untuk scalability. Harus dipecah.

### High Risk 2: Reset Data

Berbahaya jika tanpa owner PIN, backup, dan audit immutable.

### High Risk 3: Backend Legacy MySQL

Membingungkan dan rawan salah deploy. Harus dipisah atau dihapus.

### High Risk 4: Digital Transaction Input

Risiko salah input tinggi karena banyak field finansial mirip.

### High Risk 5: WhatsApp File-Based Idempotency

Tidak aman untuk multi-instance atau ephemeral deployment.

## 10. Suggested Folder Structure

```text
src/
  app/
    AppProviders.jsx
    routes.jsx
  components/
    pos/
      BarcodeSearch.jsx
      CartPanel.jsx
      PaymentPanel.jsx
      QuickPaymentButtons.jsx
    reports/
    audit/
    ui/
  features/
    cashier/
      CashierCommandCenter.jsx
      hooks/
      services/
    digital/
      DigitalQuickSale.jsx
      DigitalManualSale.jsx
      hooks/
    shifts/
      ShiftPage.jsx
      ShiftApprovalPanel.jsx
      hooks/
    inventory/
      ProductsPage.jsx
      StockMutationPanel.jsx
      StockOpnamePage.jsx
      hooks/
    wallet/
      WalletPage.jsx
      WalletLedgerTable.jsx
      hooks/
    reports/
      DashboardPage.jsx
      SalesReportPage.jsx
      FinanceReportPage.jsx
      hooks/
    audit/
      AuditLogPage.jsx
      hooks/
  services/
    supabaseClient.js
    products.service.js
    transactions.service.js
    wallet.service.js
    shifts.service.js
    reports.service.js
    audit.service.js
  hooks/
    usePaginatedQuery.js
    useKeyboardShortcuts.js
    useIncidentError.js
  utils/
```

## 11. Suggested API Structure

### Supabase RPC

- `create_accessory_transaction_atomic`
- `create_digital_transaction_atomic`
- `create_wallet_transaction_atomic`
- `save_stock_mutation_atomic`
- `approve_shift_atomic`
- `reset_operational_data_atomic`
- `write_audit_log`
- `create_supplier_return_atomic`
- `create_customer_return_atomic`

### Supabase Views

- `daily_sales_summary`
- `cashier_shift_summary`
- `provider_sales_summary`
- `wallet_daily_summary`
- `stock_summary`
- `product_sales_summary`
- `shift_anomaly_summary`

### Express API

```text
GET  /ping
GET  /api/health
POST /api/whatsapp/opening
POST /api/whatsapp/closing
POST /api/whatsapp/retry
GET  /api/whatsapp/status/:shiftId
```

## 12. Suggested State Management Improvement

### Current

Single large context:

- simple at first,
- now too heavy,
- causes global reload,
- hard to optimize.

### Target

Use page-level hooks with cache:

- TanStack Query is ideal.
- If avoiding dependency, create lightweight query hooks.

Recommended:

- `useQuery` for read.
- `useMutation` for write.
- Invalidate only affected query.
- Keep cart/payment local to page.
- Keep active shift in small global context.

### Query Keys

Examples:

- `["products", filters]`
- `["transactions", page, filters]`
- `["dashboard-summary", dateRange]`
- `["wallet-ledger", page, filters]`
- `["shift-summary", shiftId]`
- `["audit-logs", page, filters]`

## Final Implementation Sequence

1. Freeze feature expansion.
2. Add audit log migration.
3. Harden owner PIN actions.
4. Split DataContext reads into services.
5. Add pagination to history/log-heavy pages.
6. Add dashboard summary views.
7. Refactor kasir to compact command center.
8. Clean backend legacy route.
9. Add production error boundary.
10. Add deployment and monitoring checklist.

## Definition of Done

Release ini dianggap selesai jika:

- halaman kasir tidak menunggu semua data laporan,
- dashboard tidak menghitung dari seluruh raw transaksi di client,
- history memakai pagination,
- reset dan approval butuh PIN owner,
- audit log mencatat aksi sensitif,
- backend production tidak membawa route legacy MySQL yang tidak dipakai,
- WhatsApp punya database notification log,
- kasir bisa transaksi dengan search/scan, checkout, bayar pas, dan print dalam flow cepat,
- build dan lint bersih,
- error production tidak membocorkan raw stack.