# Production Reset Guide

## Overview

This guide walks through the complete process of resetting the POS system for production, clearing all operational data while keeping system structure and features intact.

---

## What Gets Deleted ❌

✗ All transactions (transaction records)
✗ All transaction items (line items)
✗ All service transactions
✗ All logs (system and activity logs)
✗ All returns and return items
✗ All localStorage (except `pos_mode` setting)
✗ All sessionStorage

---

## What Gets Preserved ✅

✓ All users
✓ All roles
✓ Wallet types (Cash, DANA, BCA, etc)
✓ System settings
✓ Table structures (NO tables dropped)
✓ Feature flags
✓ Demo/Real mode feature
✓ All code and features

---

## Implementation Steps

### 1. Backend Setup

#### A. Database Reset Script (SQL)

Location: `backend/sql/production-reset.sql`

This script:
- Deletes all operational data in correct order
- Resets auto-increment counters
- Preserves all table structures
- Can be run directly in MySQL Workbench or via CLI

```bash
# Via MySQL CLI
mysql -h localhost -u root -p database_name < backend/sql/production-reset.sql

# Or import through MySQL Workbench
# Open query editor → Load file → Run
```

#### B. Reset API Endpoints

Location: `backend/routes/reset.js`

Two endpoints created:

**POST /api/reset/production**
- Executes full data reset
- Requires owner role (pemilik)
- Clears all operational data
- Resets wallet balances to 0
- Logs action to activity_logs

```javascript
Response: {
  success: true,
  message: "✓ Sistem berhasil direset...",
  deletedCount: 1234,
  timestamp: "2026-04-18T10:30:00Z",
  resetBy: "user_id"
}
```

**POST /api/reset/validate**
- Validates reset will work properly
- Shows what will be deleted
- Warns about large data sets
- Owner role required

```javascript
Response: {
  safe: true,
  warnings: [],
  counts: {
    transactions: 150,
    logs: 2300,
    returns: 12,
    users: 8,
    affectedByReset: 2462
  }
}
```

#### C. Register Routes in Express Server

Add to `backend/server.js`:

```javascript
import resetRoutes from "./routes/reset.js";

// ... other imports and setup ...

// Register reset routes (protected by owner role)
app.use("/api/reset", resetRoutes);
```

### 2. Frontend Implementation (Already Complete)

#### A. Reset Button

- Location: `src/components/AdminPanel.jsx`
- Owner-only access (checks `user.role === "pemilik"`)
- Red button with 🔴 indicator
- Fixed at bottom-right corner

#### B. Confirmation Modal

- Location: `src/components/ResetDataModal.jsx`
- Requires typing "RESET" exactly (case-insensitive input)
- Shows clear warnings
- Prevents accidental data loss

#### C. Storage Cleanup

When reset executes:
```javascript
// Clears all storage except essential settings
const posMode = localStorage.getItem("pos_mode");
localStorage.clear();
sessionStorage.clear();

// Restores mode preference
if (posMode) {
  localStorage.setItem("pos_mode", posMode);
}
```

#### D. Mode Handling

- Demo mode feature preserved
- Demo data NOT auto-loaded
- Defaults to Real Mode
- User can toggle between modes manually
- Mode preference persists via localStorage

---

## Production Reset Process

### Step-by-Step

1. **Owner logs in** to system

2. **Verify current state** (optional)
   ```
   POST /api/reset/validate
   Review what will be deleted
   ```

3. **Click "🔴 Reset Sistem" button**
   - Located at bottom-right corner (Admin Panel)
   - Only visible if logged in as owner

4. **Read warning modal**
   - Shows all consequences
   - Lists what will be deleted

5. **Type "RESET" confirmation**
   - Case-insensitive
   - Automatically converts to uppercase
   - Button only activates on exact match

6. **Confirm deletion**
   - Executes POST /api/reset/production
   - Shows loading state
   - Clears all operational data

7. **System automatically reloads**
   - Returns to home page
   - Shows success notification
   - Ready for production use

---

## Safety Features

### 1. Role-Based Access
```javascript
// Only owner can reset
if (req.user.role !== "pemilik") {
  return 403 error
}
```

### 2. Confirmation Multiple Steps
- Button click
- Modal warning review
- Text typing confirmation ("RESET")
- Final submit

### 3. Transaction Safety
```javascript
// Database changes are atomic
BEGIN TRANSACTION
  DELETE FROM tables...
  UPDATE wallets SET balance = 0
  ALTER TABLE ... AUTO_INCREMENT = 1
COMMIT
```

If any step fails, ALL changes rollback.

### 4. Audit Logging
Every reset is logged to `activity_logs`:
```sql
INSERT INTO activity_logs
  (user_id, action, description, created_at)
VALUES
  (user_id, 'SYSTEM_RESET', 'Production reset executed. X records deleted.', NOW())
```

---

## Demo Mode vs Real Mode

### Demo Mode (Development/Testing)
- User can toggle via Mode Toggle button
- No dummy data auto-loaded
- Works with real database data
- Perfect for safe testing before production

### Real Mode (Production)
- Default mode on first login
- All transactions recorded permanently
- Live wallet balances
- Used for actual business operations

### Mode Toggle
- Visible in Admin Panel (owner only)
- 🟨 Yellow = Demo Mode active
- 🔴 Red = Real Mode active
- Preference persists to localStorage

---

## Data Reset vs Mode Toggle

**Reset (Clears Data)**
```
All operational data deleted
Wallets reset to zero
Transaction history removed
Logs cleared
Tables remain intact
```

**Mode Toggle (Changes Perspective)**
```
Same data viewed differently
Demo = Test safely
Real = Production recording
No data is deleted
Both can access full features
```

---

## SQL Manual Reset (Emergency)

If frontend is unavailable, reset via SQL:

```bash
# 1. Connect to MySQL
mysql -u root -p

# 2. Select database
USE pos_system_db;

# 3. Run reset script
source /path/to/backend/sql/production-reset.sql;

# 4. Verify
SELECT COUNT(*) FROM transactions;  -- Should show 0
SELECT COUNT(*) FROM logs;          -- Should show 0
SELECT * FROM wallets;              -- Should show balance 0
```

---

## Verification After Reset

### Frontend Checks
- ✓ No transactions visible
- ✓ Empty transaction history
- ✓ Wallets show 0 balance
- ✓ No logs visible
- ✓ All features still work
- ✓ Can create new transactions

### Database Checks
```sql
-- Should all return 0
SELECT COUNT(*) FROM transactions;
SELECT COUNT(*) FROM transaction_items;
SELECT COUNT(*) FROM services_transactions;
SELECT COUNT(*) FROM returns;
SELECT COUNT(*) FROM logs;
SELECT COUNT(*) FROM activity_logs;

-- Should show 0
SELECT * FROM wallets WHERE balance != 0;

-- Should have data (NOT deleted)
SELECT COUNT(*) FROM users;          -- Should be > 0
SELECT COUNT(*) FROM roles;          -- Should be > 0
```

---

## Troubleshooting

### Reset Button Not Visible
- Check you're logged in
- Verify your role is "pemilik"
- Clear browser cache
- Refresh page

### Reset Endpoint Returns 403
- Ensure you have owner role
- Check authentication token is valid
- Verify JWT is not expired

### Database Lock Error
- Close all other connections to database
- Wait a few seconds
- Try again
- Check for stuck queries: `SHOW PROCESSLIST;`

### Transaction Rollback
- Check for foreign key violations
- Ensure all tables exist
- Review error logs for details
- Run `FOREIGN_KEY_CHECKS = 0` if needed

### Data Not Cleared
- Verify SQL script executed completely
- Check for permission errors
- Ensure you have DELETE privilege
- Review MySQL error logs

---

## Before Going Live

### Checklist

- [ ] Backend routes registered in server.js
- [ ] SQL script tested in development database
- [ ] Owner account created (pemilik role)
- [ ] Reset button visible and clickable
- [ ] Confirmation modal displays warnings
- [ ] Test reset in staging environment
- [ ] Verify all data actually deleted
- [ ] Verify all features still work
- [ ] Test demo mode toggle
- [ ] Document reset procedure for team
- [ ] Create backup before first production reset

### Test Reset in Staging

1. Create test data (transactions, logs, returns)
2. Click reset button
3. Confirm with "RESET"
4. Verify all data deleted
5. Verify tables still exist
6. Create new transaction to test functionality

---

## Production Deployment

Once tested:

1. **Backup production database** ⚠️
   ```bash
   mysqldump -u root -p database_name > backup.sql
   ```

2. **Deploy code changes**
   - backend/routes/reset.js
   - backend/sql/production-reset.sql
   - Updated AdminPanel.jsx
   - Updated backend/server.js

3. **Verify deployment**
   - Check routes are accessible
   - Verify owner role works
   - Test in staging first

4. **Owner trains on process**
   - Show location of reset button
   - Explain confirmation steps
   - When/why to use reset

5. **Monitor first reset**
   - Watch system reload
   - Verify data actually deleted
   - Confirm activity log entry created

---

## Important Notes

⚠️ **Irreversible Action**
- Reset cannot be undone without restore
- Always backup before reset
- Only owner should perform resets

⚠️ **Timing**
- Reset may take time with large datasets
- Don't interrupt process
- Wait for page reload confirmation

⚠️ **Production Safety**
- Run in staging first
- Backup database first
- Have rollback plan
- Document the reset

---

## Architecture Diagram

```
┌─────────────────────────────────────┐
│        AdminPanel Component         │
│  (Owner-only, Fixed bottom-right)   │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       │                │
   ┌───▼─────┐  ┌──────▼──────┐
   │ModeToggle│  │Reset Button │
   │ 🟨 🔴    │  │ 🔴 Reset    │
   └──────────┘  └──────┬──────┘
                        │
              ┌─────────▼────────┐
              │ResetDataModal    │
              │- Show warnings   │
              │- Type "RESET"    │
              │- Confirm action  │
              └─────────┬────────┘
                        │
            ┌───────────▼──────────┐
            │POST /api/reset/       │
            │production            │
            └───────────┬──────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
    ┌───▼──────┐                  ┌────▼─────┐
    │Database  │                  │localStorage│
    │Reset SQL │                  │Clear all   │
    │- Delete  │                  │(save mode) │
    │- Truncate│                  └────────────┘
    │- Reset AI│
    └──────────┘
        │
        └──────────────┬─────────────────┐
                       │                 │
                   ✓ Success      ⌛ Reload
                   Show msg          Home
```

---

## Contact & Support

For issues with reset:
1. Check error message
2. Review troubleshooting section
3. Check database logs
4. Backup and restore if needed
5. Contact system administrator

---

**Last Updated:** April 18, 2026
**Version:** 1.0
**Status:** Production Ready
