# Role Access Control & PIN Protection Guide

## Overview

This POS system implements role-based access control with PIN-protected sensitive actions. This allows cashiers to access all operational features while maintaining security for critical operations.

## Role Definitions

### CASHIER (Kasir)
- **Access**: Can access all operational menus
  - Saldo (Balance/Wallet)
  - Stok Barang (Product Stock)
  - Catat Operasional (Record Operational)
  - Logistik (Logistics)
  - Hutang (Debts/Receivables)
  - Kasir (POS - Cash Register)
  - Riwayat Transaksi (Transaction History)
  - Kalkulator (Calculator)
  - Bantuan (Help)

- **Restrictions**: Sensitive actions require PIN confirmation
  - Delete data
  - Edit stock
  - Edit prices
  - Refund/void transactions

### OWNER (Pemilik)
- **Access**: Full access to all features including dashboard and financial reports
- **Restrictions**: No PIN required (trusted operator)

---

## Implementation Guide

### 1. Navigation Configuration

Navigation is defined in `src/config/navigation.js`:

```javascript
export const navigationSections = {
  pemilik: [ /* owner menu */ ],
  kasir: [ /* cashier menu */ ],
};
```

Update this file to control which menu items are visible to each role.

### 2. Route Protection

Routes are protected in `src/App.jsx` using the `ProtectedRoute` component:

```jsx
<Route element={<ProtectedRoute allowedRoles={["kasir", "pemilik"]}><AppShell /></ProtectedRoute>}>
  <Route path="/kasir" element={<CashierPage />} />
  <Route path="/saldo" element={<WalletPage />} />
  {/* accessible to both kasir and pemilik */}
</Route>

<Route element={<ProtectedRoute allowedRoles={["pemilik"]}><AppShell /></ProtectedRoute>}>
  <Route path="/dashboard" element={<Dashboard />} />
  {/* only for owner */}
</Route>
```

### 3. PIN Protection for Sensitive Actions

#### Setup

Import the hook in your component:

```jsx
import { usePinConfirmation } from "../hooks/usePinConfirmation";
import PinConfirmationModal from "../components/PinConfirmationModal";
```

#### Usage Pattern

```jsx
export default function SensitivePage() {
  const { isPinModalOpen, closePinModal, executeSensitiveAction, actionDescription } = usePinConfirmation();
  const { deleteProduct } = useData();

  const handleDeleteProduct = async (productId) => {
    try {
      await executeSensitiveAction(
        async () => {
          await deleteProduct(productId);
          showNotification("success", "Produk berhasil dihapus");
        },
        "PRODUCT.DELETE"
      );
    } catch (error) {
      showNotification("error", error.message);
    }
  };

  return (
    <>
      {/* Your page content */}
      <button onClick={() => handleDeleteProduct(123)}>Hapus Produk</button>

      {/* PIN Confirmation Modal */}
      <PinConfirmationModal
        isOpen={isPinModalOpen}
        onClose={closePinModal}
        onConfirm={async () => {
          try {
            await executeConfirmedAction();
          } catch (error) {
            showNotification("error", error.message);
          }
        }}
        title="Konfirmasi PIN"
        message={`Konfirmasi PIN untuk ${actionDescription}`}
      />
    </>
  );
}
```

Hmm, I need to use `executeConfirmedAction` from the hook. Let me revise:

```jsx
export default function SensitivePage() {
  const { 
    isPinModalOpen, 
    closePinModal, 
    executeSensitiveAction, 
    executeConfirmedAction,
    actionDescription 
  } = usePinConfirmation();
  const { deleteProduct } = useData();

  const handleDeleteProduct = async (productId) => {
    try {
      await executeSensitiveAction(
        async () => {
          await deleteProduct(productId);
          showNotification("success", "Produk berhasil dihapus");
        },
        "PRODUCT.DELETE"
      );
    } catch (error) {
      showNotification("error", error.message);
    }
  };

  return (
    <>
      <button onClick={() => handleDeleteProduct(123)}>Hapus Produk</button>

      <PinConfirmationModal
        isOpen={isPinModalOpen}
        onClose={closePinModal}
        onConfirm={async () => {
          try {
            await executeConfirmedAction();
            showNotification("success", "Aksi berhasil dikonfirmasi");
          } catch (error) {
            showNotification("error", error.message);
          }
        }}
        title="Konfirmasi PIN"
        message={`Konfirmasi PIN untuk ${actionDescription}`}
      />
    </>
  );
}
```

### 4. Sensitive Action Keys

Available action keys for PIN protection (defined in `src/utils/sensitiveActions.js`):

```javascript
SENSITIVE_ACTIONS = {
  PRODUCT: {
    DELETE: "Hapus produk",
    EDIT_STOCK: "Edit stok barang",
    EDIT_PRICE: "Ubah harga",
    TOGGLE_STATUS: "Aktifkan/nonaktifkan produk",
  },
  TRANSACTION: {
    REFUND: "Refund/void transaksi",
    DELETE: "Hapus transaksi",
  },
  DEBT: {
    DELETE: "Hapus hutang/piutang",
    MARK_PAID: "Tandai sebagai lunas",
  },
  CASH: {
    DELETE_ENTRY: "Hapus catatan kas",
    DELETE_MULTIPLE: "Hapus multiple catatan kas",
  },
};
```

### 5. PIN Verification Details

- **PIN Verification**: Located in `src/contexts/AuthContext.jsx`
  - Uses SHA-256 hashing (browser crypto API)
  - Verifies against user's stored PIN hash
  - Throws descriptive errors for debugging

- **Demo Users**:
  - Owner: `owner@raja.test` / PIN: `123456`
  - Cashier: `kasir@raja.test` / PIN: `123456`

### 6. Behavior by Role

#### For OWNER (pemilik)
- All pages accessible
- No PIN required for sensitive actions
- `executeSensitiveAction` executes immediately without modal

#### For CASHIER (kasir)
- Restricted to operational pages (no dashboard, financial reports)
- All operational pages accessible
- PIN required for sensitive actions
- `executeSensitiveAction` opens PIN modal before executing

---

## Security Best Practices

1. **Always use `usePinConfirmation` hook** for sensitive operations
2. **Clearly indicate which actions require PIN** in the UI
3. **Test PIN flow** with both roles before deployment
4. **Log sensitive actions** for audit trail
5. **Never store PIN in plain text** - always use hash verification
6. **Invalidate PIN** after certain conditions (failed attempts, timeout)

---

## Pages with Sensitive Actions (To be Updated)

### ProductsPage (/stok-barang)
- [ ] Edit stock - `PRODUCT.EDIT_STOCK`
- [ ] Edit price - `PRODUCT.EDIT_PRICE`
- [ ] Toggle status - `PRODUCT.TOGGLE_STATUS`

### CashierPage (/kasir)
- [ ] Refund transaction - `TRANSACTION.REFUND`
- [ ] Void transaction - `TRANSACTION.DELETE`

### DebtsPage (/hutang)
- [ ] Delete debt record - `DEBT.DELETE`
- [ ] Mark as paid - `DEBT.MARK_PAID`

### CashPage (/operasional)
- [ ] Delete entry - `CASH.DELETE_ENTRY`

---

## Testing the PIN System

### Test Scenarios

1. **Owner Login**
   - Should access all pages
   - Sensitive actions should execute without PIN modal

2. **Cashier Login**
   - Should access operational pages only
   - Should NOT see dashboard, financial reports, customers
   - Sensitive actions should open PIN modal

3. **PIN Verification**
   - Correct PIN should allow action
   - Wrong PIN should show error
   - Empty PIN should show error

### Test PIN
- Demo PIN: `123456`
- Hash: `03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4`

---

## Future Enhancements

1. **Attempt limiting**: Lock after 3 failed PIN attempts
2. **Timeout**: Require PIN re-entry after 30 minutes
3. **Audit logging**: Track all sensitive actions with timestamp/user
4. **Granular permissions**: More detailed role-based access (e.g., "can edit prices but not delete")
5. **Biometric auth**: Support fingerprint/face recognition for PIN
