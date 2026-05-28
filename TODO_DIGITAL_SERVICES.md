# Digital Services Management System - Implementation Plan
Status: ✅ APPROVED

## Overview
Complete spec: service_products CRUD+Excel, fast cashier workflow, flexible pricing, wallet/shift validation.

Current: 90% DB/UI ready. Missing management+Excel.

## Steps (sequential)

### 1. DB Migration [✅]
- Create `supabase/migrations/20260417_09_digital_services_complete.sql`
- Add `default_price integer` to `services_products` (nullable)
- Update RLS if needed

### 2. DataContext Updates [ ]
- Add `createServiceProduct(payload)`
- Add `updateServiceProduct(id, payload)`
- Add `deleteServiceProduct(id)` (active=false)
- Add `importServiceProducts(products)` (upsert)
- `serviceProducts` always dynamic (no fallback)

### 3. Utils: serviceImport.js [✅]
- `parseServiceWorkbook(file)` → service products array
- `downloadServiceTemplate()` → Excel with samples
- Format: Kategori|Provider|Nama Layanan|Modal|Harga Default|Status
- Validation: required fields, numbers, valid status/enums

### 4. ServiceProductsPage.jsx [✅]
- Copy ProductsPage structure
- CRUD: add/edit/inactive (no hard delete)
- Excel: import + template download + results preview
- Filters/search by category/provider/status
- Owner-only (role check)

### 5. DigitalPage Enhancements [ ]
- Prefill `sellingPrice` = product.default_price || ''
- Quick buttons: +500/+1000/+2000 (increment selling_price)
- Warning: if selling_price < cost → yellow/red highlight
- Snapshot: product_name/provider/cost to transaction_items

### 6. Data/Config Updates [✅]
- `src/data/serviceProducts.js`: export [] (dynamic only)
- `navigation.js`: Add `/layanan-produk` under Layanan Digital
- `Sidebar.jsx`: Add nav link

### 7. Testing [ ]
- Import template → verify data
- Select product → default_price prefilled
- Quick edit → price updates → profit auto
- PASAR KUOTA → wallet deduct cost → block if insufficient
- Shift close → disable save
- History: full list with provider/nomor_tujuan/profit/method

## Completion Criteria
- [ ] All steps ✓
- [ ] No console errors
- [ ] Full workflow: import→sell→history
- `attempt_completion`

**Next: Create migration file**

