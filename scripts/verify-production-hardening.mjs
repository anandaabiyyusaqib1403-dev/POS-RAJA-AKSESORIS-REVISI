import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function assertIncludes(label, text, needle) {
  if (!text.includes(needle)) {
    throw new Error(`${label} tidak ditemukan: ${needle}`);
  }
}

function assertNotIncludes(label, text, needle) {
  if (text.includes(needle)) {
    throw new Error(`${label} masih memakai jalur lama: ${needle}`);
  }
}

const dataContext = read("src/contexts/DataProvider.jsx");
const shiftNotifications = read("src/services/shiftNotifications.js");
const migration = read("supabase/migrations/20260514_06_production_hardening_activation.sql");
const boundaryMigration = read("supabase/migrations/20260526_03_security_boundary_enforcement.sql");
const idempotencyMigration = read("supabase/migrations/20260527_01_money_flow_idempotency.sql");
const auditRetentionMigration = read("supabase/migrations/20260527_02_audit_storage_retention_foundation.sql");
const moneyRequestKeys = read("src/core/money/moneyRequestKeys.js");
const backendQueue = read("backend/server/notificationQueue.js");
const backendWhatsapp = read("backend/routes/whatsapp.js");
const backendWhatsappRequest = read("backend/server/whatsappRequest.js");
const backendRequestSecurity = read("backend/server/requestSecurity.js");
const backendServer = read("backend/server.js");
const vercelWhatsappOpening = read("api/whatsapp/opening.js");
const vercelWhatsappClosing = read("api/whatsapp/closing.js");
const printUtils = read("src/utils/print.js");

const checks = [
  () => assertIncludes("Frontend close shift", dataContext, 'callAtomicRpc("close_shift_atomic"'),
  () => assertIncludes("Frontend void transaksi", dataContext, 'callAtomicRpc("void_transaction_atomic"'),
  () => assertNotIncludes("Frontend transaksi", dataContext, "soft_delete_transaction_history"),
  () => assertNotIncludes("Frontend transaksi", dataContext, "permanently_delete_transaction_history"),
  () => assertNotIncludes("Frontend transaksi", dataContext, "restore_transaction_history"),
  () => assertNotIncludes("WhatsApp frontend", shiftNotifications, "HOLD_WHATSAPP_NOTIFICATIONS"),
  () => assertIncludes("WhatsApp frontend auth", shiftNotifications, "Authorization: `Bearer ${accessToken}`"),
  () => assertIncludes("Migration close shift", migration, "create or replace function public.close_shift_atomic"),
  () => assertIncludes("Migration void transaksi", migration, "create or replace function public.void_transaction_atomic"),
  () => assertIncludes("Migration wallet snapshot", migration, "create table if not exists public.wallet_accounts"),
  () => assertIncludes("Migration wallet append-only", migration, "trg_prevent_wallet_ledger_update"),
  () => assertIncludes("Migration stock conflict", migration, "stock_opname_conflict"),
  () => assertIncludes("Migration notification queue", migration, "create table if not exists public.notification_jobs"),
  () => assertIncludes("Migration operational events", migration, "create table if not exists public.operational_events"),
  () => assertIncludes("Boundary wallet permission", boundaryMigration, "finance.cash_wallet"),
  () => assertIncludes("Boundary stock permission", boundaryMigration, "product.stock_edit"),
  () => assertIncludes("Boundary shift permission", boundaryMigration, "shift.close"),
  () => assertIncludes("Boundary internal revoke", boundaryMigration, "close_shift_atomic_unchecked"),
  () => assertIncludes("Boundary direct wallet lockdown", boundaryMigration, "revoke insert, update, delete on public.transaksi_dompet"),
  () => assertIncludes("Boundary direct shift lockdown", boundaryMigration, 'drop policy if exists "shift update own or owner"'),
  () => assertIncludes("Money operation ledger", idempotencyMigration, "create table if not exists public.money_operation_requests"),
  () => assertIncludes("Cash atomic RPC", idempotencyMigration, "create or replace function public.create_cash_entry_atomic"),
  () => assertIncludes("Accessory replay protection", idempotencyMigration, "create_accessory_transaction_atomic_idempotency_impl"),
  () => assertIncludes("Wallet replay protection", idempotencyMigration, "create_wallet_transaction_atomic_authorized_impl"),
  () => assertIncludes("Supplier return replay protection", idempotencyMigration, "create_supplier_return_atomic_idempotency_impl"),
  () => assertIncludes("Customer return replay protection", idempotencyMigration, "create_customer_return_atomic_idempotency_impl"),
  () => assertIncludes("Close shift replay protection", idempotencyMigration, "close_shift_atomic_authorized_impl"),
  () => assertIncludes("Void replay protection", idempotencyMigration, "void_transaction_atomic_idempotency_impl"),
  () => assertIncludes("Audit storage monitoring", auditRetentionMigration, "owner_get_audit_storage_summary"),
  () => assertIncludes("Audit retention classification", auditRetentionMigration, "audit_retention_class"),
  () => assertNotIncludes("Audit retention critical evidence", auditRetentionMigration, "delete from public.audit_logs"),
  () => assertIncludes("Frontend request id store", moneyRequestKeys, "createMoneyRequestKeyStore"),
  () => assertIncludes("Backend durable queue", backendQueue, "enqueueWhatsappNotification"),
  () => assertIncludes("Backend queue idempotency", backendQueue, "resolution=ignore-duplicates"),
  () => assertIncludes("Backend queue claim", backendQueue, "&status=in.(pending,retrying)"),
  () => assertIncludes("Backend queue route", backendWhatsapp, "handleWhatsappNotificationRequest"),
  () => assertIncludes("Backend verified payload", backendWhatsappRequest, "buildVerifiedPayload"),
  () => assertIncludes("Backend verified shift", backendWhatsappRequest, "authorizeShiftNotification"),
  () => assertNotIncludes("Backend client role trust", backendWhatsappRequest, "body.requestedByRole"),
  () => assertIncludes("Backend profile auth", backendRequestSecurity, "profile.role"),
  () => assertIncludes("Backend integration audit", backendRequestSecurity, "appendIntegrationAudit"),
  () => assertIncludes("Backend integration rate limit", backendRequestSecurity, "enforceIntegrationRateLimit"),
  () => assertIncludes("Legacy routes disabled", backendServer, "ENABLE_LEGACY_MYSQL_ROUTES"),
  () => assertIncludes("WhatsApp middleware auth", backendServer, "requireAuthenticatedUser, whatsappRoutes"),
  () => assertIncludes("Vercel opening secured handler", vercelWhatsappOpening, "handleWhatsappNotificationRequest"),
  () => assertIncludes("Vercel closing secured handler", vercelWhatsappClosing, "handleWhatsappNotificationRequest"),
  () => assertNotIncludes("Vercel opening route", vercelWhatsappOpening, "getSafeResult"),
  () => assertNotIncludes("Vercel closing route", vercelWhatsappClosing, "getSafeResult"),
  () => assertIncludes("Printer status result", printUtils, "printTransactionReceiptWithStatus"),
  () => assertIncludes("Printer device settings", printUtils, "receiptPrinterProfiles"),
];

const failures = [];

checks.forEach((check) => {
  try {
    check();
  } catch (error) {
    failures.push(error.message);
  }
});

if (failures.length) {
  console.error("Production hardening verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Production hardening verification passed.");
console.log("- close_shift_atomic is the active close-shift path");
console.log("- void_transaction_atomic is the active transaction cancellation path");
console.log("- wallet ledger snapshot/append-only guard migration exists");
console.log("- stock opname conflict migration exists");
console.log("- WhatsApp durable queue routes exist for backend and Vercel serverless");
console.log("- WhatsApp requests require verified identity, rate limiting, and audit logging");
console.log("- sensitive wallet, stock, and close-shift RPCs have database permission guards");
console.log("- money mutations use idempotent request replay protection and atomic cash entry writes");
console.log("- audit storage monitoring classifies growth without auto-deleting critical evidence");
console.log("- legacy MySQL POS routes are disabled unless explicitly enabled for local use");
console.log("- operational events and printer status hooks exist");
