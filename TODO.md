# TODO: Fitur Tambahan POS Raja Aksesoris

## ✅ Approved Plan (Prioritas dari User Feedback)
Status: [ ] Not Started | [ ] In Progress | [x] Completed

### Prioritas 1: Thermal Print Struk (58mm ESC/POS)
- [ ] Step 1: Install react-to-print (`npm i react-to-print`)
- [ ] Step 2: Create `src/utils/print.js` (printReceipt function)
- [ ] Step 3: Update `ReceiptModal.jsx` (+ Print button, @react-to-print)
- [ ] Step 4: Test print di Chrome (ESC/POS via USB/Network)
- [ ] Step 5: Update README.md + mark complete

### Prioritas 2: Diskon & Promo Codes
- [ ] Create DiscountModal.jsx
- [ ] Add discount fn ke DataContext.jsx
- [ ] Integrate ke CashierPage.jsx (per-item/cart discount)
- [ ] Supabase table `promo_codes`
- [ ] Test + complete

### Prioritas 3: Activate Laporan/Riwayat Routes
- [ ] Add routes ke App.jsx
- [ ] Implement filters/export di Laporan.jsx, Riwayat.jsx
- [ ] Test + complete

### Prioritas 4: Supplier Management
- [ ] New SuppliersPage.jsx
- [ ] Supabase `suppliers`, `purchase_orders` tables
- [ ] Link ke ProductsPage (harga supplier history)
- [ ] Test + complete

### Prioritas 5-6: Multi-Outlet, Customer Loyalty
- [Pending user spec]

## 📋 Progress Tracking
- Current: Starting Feature #1 (Thermal Print)
- Total Features: 6
- Completed: 0/6

**Next Action:** Install deps → Step 1 complete → Update this file.
