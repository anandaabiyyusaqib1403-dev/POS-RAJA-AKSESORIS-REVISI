# POS RAJA AKSESORIS - OPENING & CLOSING SHIFT SYSTEM

**Status: New Task - Phase 1 Planning Complete**

## **BUSINESS RULES RECAP**
- Opening cash = 0 auto
- Cashier: open ≥07:00, close ≥20:00
- Owner: anytime override
- 1 active shift per cashier
- Wallet balances NOT reset
- Transactions locked to shift

## **PHASE 1: Database Schema**
- [ ] 1.1 Create `supabase/migrations/20241002_shift_system.sql` 
- [ ] 1.2 Run migration
- [ ] 1.3 Test insert shift record

## **PHASE 2: DataContext Functions**
- [ ] 2.1 Add `startShift()`, `closeShift()`, `getActiveShift()`, `getShiftReport()`
- [ ] 2.2 Auto-link transactions to current shift

## **PHASE 3: UI Pages**
- [ ] 3.1 Create `src/pages/ShiftPage.jsx` (open/close UI)
- [ ] 3.2 Add ShiftStatus indicator to CashierPage.jsx Navbar
- [ ] 3.3 Owner approval UI in new AdminShiftsPage.jsx

## **PHASE 4: Integration**
- [ ] 4.1 Block checkout if no active shift (cashier only)
- [ ] 4.2 Auto-calculate shift totals from transactions
- [ ] 4.3 PIN validation for close

## **PHASE 5: Test & Polish**
- [ ] 5.1 Test time restrictions
- [ ] 5.2 Test edge cases (no txns, forget close)
- [ ] 5.3 Update Dashboard with shift metrics

