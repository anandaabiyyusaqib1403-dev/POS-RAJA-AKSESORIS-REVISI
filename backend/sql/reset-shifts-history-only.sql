-- =============================================================================
-- SHIFT + HISTORY RESET SCRIPT
-- =============================================================================
--
-- This script clears shift records and operational history only.
-- It preserves product master data, service products, user accounts, settings,
-- and feature tables needed by the application.
--
-- Run with:
-- mysql -h <host> -u <user> -p <database> < backend/sql/reset-shifts-history-only.sql
--
-- WARNING: This will permanently delete shift and history data.
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM item_transaksi WHERE 1=1;
DELETE FROM transaksi_digital WHERE 1=1;
DELETE FROM transaksi_logistik WHERE 1=1;
DELETE FROM transaksi_dompet WHERE 1=1;
DELETE FROM transaksi WHERE 1=1;
DELETE FROM services_transactions WHERE 1=1;
DELETE FROM shifts WHERE 1=1;
DELETE FROM kas WHERE 1=1;
DELETE FROM stok_mutasi WHERE 1=1;
DELETE FROM customer_return_items WHERE 1=1;
DELETE FROM supplier_return_items WHERE 1=1;
DELETE FROM customer_returns WHERE 1=1;
DELETE FROM supplier_returns WHERE 1=1;
DELETE FROM returns WHERE 1=1;
DELETE FROM return_items WHERE 1=1;
DELETE FROM stock_opname_items WHERE 1=1;
DELETE FROM stock_opname_sessions WHERE 1=1;
DELETE FROM operational_events WHERE 1=1;
DELETE FROM notification_jobs WHERE 1=1;
DELETE FROM employee_sessions WHERE 1=1;
DELETE FROM employee_payrolls WHERE 1=1;
DELETE FROM product_activity_logs WHERE 1=1;
DELETE FROM audit_logs WHERE 1=1;
DELETE FROM activity_logs WHERE 1=1;
DELETE FROM logs WHERE 1=1;

UPDATE wallets SET balance = 0 WHERE 1=1;

SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE transaksi AUTO_INCREMENT = 1;
ALTER TABLE item_transaksi AUTO_INCREMENT = 1;
ALTER TABLE transaksi_digital AUTO_INCREMENT = 1;
ALTER TABLE transaksi_logistik AUTO_INCREMENT = 1;
ALTER TABLE transaksi_dompet AUTO_INCREMENT = 1;
ALTER TABLE services_transactions AUTO_INCREMENT = 1;
ALTER TABLE shifts AUTO_INCREMENT = 1;
ALTER TABLE customer_return_items AUTO_INCREMENT = 1;
ALTER TABLE supplier_return_items AUTO_INCREMENT = 1;
ALTER TABLE customer_returns AUTO_INCREMENT = 1;
ALTER TABLE supplier_returns AUTO_INCREMENT = 1;
ALTER TABLE returns AUTO_INCREMENT = 1;
ALTER TABLE return_items AUTO_INCREMENT = 1;
ALTER TABLE stock_opname_items AUTO_INCREMENT = 1;
ALTER TABLE stock_opname_sessions AUTO_INCREMENT = 1;
ALTER TABLE operational_events AUTO_INCREMENT = 1;
ALTER TABLE notification_jobs AUTO_INCREMENT = 1;
ALTER TABLE employee_sessions AUTO_INCREMENT = 1;
ALTER TABLE employee_payrolls AUTO_INCREMENT = 1;
ALTER TABLE product_activity_logs AUTO_INCREMENT = 1;
ALTER TABLE audit_logs AUTO_INCREMENT = 1;
ALTER TABLE activity_logs AUTO_INCREMENT = 1;
ALTER TABLE logs AUTO_INCREMENT = 1;

SELECT COUNT(*) AS shift_count FROM shifts;
SELECT COUNT(*) AS transaction_count FROM transaksi;
SELECT COUNT(*) AS log_count FROM logs;
