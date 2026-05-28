import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260527_02_audit_storage_retention_foundation.sql", import.meta.url),
  "utf8"
);
const auditPage = readFileSync(new URL("../src/pages/AuditLogPage.jsx", import.meta.url), "utf8");
const summaryHook = readFileSync(
  new URL("../src/hooks/useAuditStorageSummary.js", import.meta.url),
  "utf8"
);

test("audit storage foundation monitors growth without automatic evidence deletion", () => {
  assert.match(migration, /owner_get_audit_storage_summary/);
  assert.match(migration, /owner_get_audit_storage_breakdown/);
  assert.match(migration, /audit_retention_class/);
  assert.match(migration, /pg_stat_user_tables/);
  assert.match(migration, /on-demand event scan/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(audit_logs|product_activity_logs)/i);
  assert.doesNotMatch(migration, /truncate\s+(table\s+)?public\.(audit_logs|product_activity_logs)/i);
});

test("owner audit UI displays storage monitoring delivered by the owner RPC", () => {
  assert.match(summaryHook, /owner_get_audit_storage_summary/);
  assert.match(auditPage, /useAuditStorageSummary/);
  assert.match(auditPage, /Kapasitas audit/);
  assert.match(auditPage, /Audit kritis tidak dihapus otomatis/);
});
