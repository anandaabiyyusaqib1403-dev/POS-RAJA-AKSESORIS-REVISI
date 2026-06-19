-- =============================================================================
-- TRANSACTION HISTORY RESET SCRIPT
-- =============================================================================
--
-- This script deletes only transaction-related operational data.
-- It preserves product master data, system settings, users, and table structure.
--
-- Run with:
-- mysql -h <host> -u <user> -p <database> < backend/sql/reset-transactions-only.sql
--
-- WARNING: This will permanently delete transaction history and logs.
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM transaction_items WHERE 1=1;
DELETE FROM services_transactions WHERE 1=1;
DELETE FROM transactions WHERE 1=1;
DELETE FROM logs WHERE 1=1;
DELETE FROM activity_logs WHERE 1=1;

SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE transactions AUTO_INCREMENT = 1;
ALTER TABLE transaction_items AUTO_INCREMENT = 1;
ALTER TABLE services_transactions AUTO_INCREMENT = 1;
ALTER TABLE logs AUTO_INCREMENT = 1;
ALTER TABLE activity_logs AUTO_INCREMENT = 1;

SELECT COUNT(*) AS transaction_count FROM transactions;
SELECT COUNT(*) AS log_count FROM logs;
