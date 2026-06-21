-- =============================================================================
-- PRODUCTION DATA RESET SCRIPT
-- =============================================================================
-- 
-- âš ï¸  WARNING: This script deletes ALL operational data
-- 
-- SAFE TO RUN:
-- âœ“ All data structures (tables) remain intact
-- âœ“ Only data rows are deleted
-- âœ“ System configuration preserved
-- âœ“ User accounts preserved
-- âœ“ Roles preserved
--
-- DELETED:
-- âœ— All transactions
-- âœ— All transaction items
-- âœ— All service transactions
-- âœ— All logs
-- âœ— All activity logs
--
-- PRESERVED:
-- âœ“ Users table
-- âœ“ Roles table
-- âœ“ Wallet types
-- âœ“ Settings
-- âœ“ Table structures
--
-- =============================================================================

-- Disable foreign key checks temporarily
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================================
-- STEP 1: Delete all transaction-related data
-- =============================================================================

-- Delete transaction items (has FK to transactions)
DELETE FROM transaction_items WHERE 1=1;

-- Delete service transactions
DELETE FROM services_transactions WHERE 1=1;

-- Delete main transactions
DELETE FROM transactions WHERE 1=1;

-- =============================================================================
-- STEP 2: Delete all logs
-- =============================================================================

-- Delete activity logs
DELETE FROM activity_logs WHERE 1=1;

-- Delete system logs
DELETE FROM logs WHERE 1=1;

-- =============================================================================
-- STEP 3: Reset wallet balances to 0
-- =============================================================================

UPDATE wallets SET balance = 0 WHERE 1=1;

-- =============================================================================
-- STEP 4: Reset auto-increment counters (optional but recommended)
-- =============================================================================

-- This ensures IDs start fresh from 1
ALTER TABLE transactions AUTO_INCREMENT = 1;
ALTER TABLE transaction_items AUTO_INCREMENT = 1;
ALTER TABLE services_transactions AUTO_INCREMENT = 1;
ALTER TABLE logs AUTO_INCREMENT = 1;
ALTER TABLE activity_logs AUTO_INCREMENT = 1;

-- =============================================================================
-- STEP 5: Re-enable foreign key checks
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- STEP 6: Verify deletion (optional - review results)
-- =============================================================================

-- Check transaction count (should be 0)
SELECT COUNT(*) as transaction_count FROM transactions;

-- Check logs count (should be 0)
SELECT COUNT(*) as log_count FROM logs;

-- Check wallet balances (should all be 0)
SELECT id, name, balance FROM wallets;

-- =============================================================================
-- SUCCESS MESSAGE
-- =============================================================================
-- âœ“ All operational data has been cleared
-- âœ“ System is ready for production
-- âœ“ All features remain functional
-- âœ“ User accounts and settings preserved
-- =============================================================================
