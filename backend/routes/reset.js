import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESET_CONFIRMATION = "RESET_PRODUCTION";
const RESET_SQL_PATH = path.resolve(__dirname, "../../supabase/reset-production.sql");
const RESET_TABLES = [
  "notification_jobs",
  "operational_events",
  "employee_sessions",
  "employee_payrolls",
  "stock_opname_items",
  "stock_opname_sessions",
  "supplier_return_items",
  "customer_return_items",
  "financial_logs",
  "customer_returns",
  "supplier_returns",
  "item_transaksi",
  "transaksi_digital",
  "transaksi_logistik",
  "transaksi_dompet",
  "kas",
  "stok_masuk",
  "stok_mutasi",
  "product_activity_logs",
  "audit_logs",
  "transaksi",
  "shifts",
  "suppliers",
];

function getSupabaseConfig() {
  return {
    url: String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, ""),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  };
}

function getServiceHeaders(config) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

async function fetchSupabase(config, pathname, options = {}) {
  if (!config.url || !config.serviceRoleKey) {
    throw new Error("SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi untuk reset produksi.");
  }

  const response = await fetch(`${config.url}${pathname}`, {
    ...options,
    headers: {
      ...getServiceHeaders(config),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Supabase request failed (${response.status}).`);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return { data, response };
}

async function countRows(config, table) {
  const response = await fetch(`${config.url}/rest/v1/${table}?select=*`, {
    method: "HEAD",
    headers: {
      ...getServiceHeaders(config),
      Prefer: "count=exact",
    },
  });

  if (response.status === 404) return { table, count: 0, missing: true };
  if (!response.ok) {
    const text = await response.text();
    return {
      table,
      count: 0,
      error: text || `Count failed (${response.status})`,
    };
  }

  return {
    table,
    count: Number(response.headers.get("content-range")?.split("/")?.[1] || 0),
    missing: false,
  };
}

async function buildResetPreview() {
  const config = getSupabaseConfig();
  if (!config.url || !config.serviceRoleKey) {
    throw new Error("SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi untuk reset produksi.");
  }

  const counts = await Promise.all(RESET_TABLES.map((table) => countRows(config, table)));
  const affectedRows = counts.reduce((sum, row) => sum + Number(row.count || 0), 0);

  return {
    safe: counts.every((row) => !row.error),
    dryRun: true,
    affectedRows,
    counts,
    preserved: ["produk", "services_products", "users", "auth.users", "app_settings"],
    resetConfirmation: RESET_CONFIRMATION,
  };
}

async function executeSupabaseReset(user) {
  const config = getSupabaseConfig();
  const sql = await fs.readFile(RESET_SQL_PATH, "utf8");
  const before = await buildResetPreview();

  await fetchSupabase(config, "/rest/v1/rpc/exec_sql", {
    method: "POST",
    body: JSON.stringify({ sql }),
  });

  await fetchSupabase(config, "/rest/v1/audit_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      actor_id: user.id,
      actor_role: user.role,
      action: "system.reset.production",
      target_table: "system",
      target_id: null,
      before_value: {
        affectedRows: before.affectedRows,
        counts: before.counts,
      },
      after_value: {
        resetAt: new Date().toISOString(),
      },
      reason: "Production operational data reset",
      incident_code: "PRODUCTION-RESET",
    }),
  });

  const after = await buildResetPreview();
  return { before, after };
}

function authenticateOwner(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ ok: false, error: "Tidak terautentikasi" });
  }

  if (req.user.role !== "pemilik") {
    return res.status(403).json({
      ok: false,
      error: "Hanya owner yang dapat mengakses reset produksi.",
      requiredRole: "pemilik",
      actualRole: req.user.role,
    });
  }

  next();
}

router.post("/validate", authenticateOwner, async (_req, res) => {
  try {
    const preview = await buildResetPreview();
    res.json({ ok: true, ...preview });
  } catch (error) {
    res.status(500).json({
      ok: false,
      safe: false,
      error: error.message || "Gagal validasi reset produksi.",
    });
  }
});

router.post("/production", authenticateOwner, async (req, res) => {
  try {
    if (req.body?.dryRun === true) {
      const preview = await buildResetPreview();
      return res.json({ ok: true, ...preview });
    }

    if (req.body?.confirmation !== RESET_CONFIRMATION) {
      return res.status(400).json({
        ok: false,
        error: `Konfirmasi wajib diisi: ${RESET_CONFIRMATION}`,
        resetConfirmation: RESET_CONFIRMATION,
      });
    }

    const result = await executeSupabaseReset(req.user);
    return res.json({
      ok: true,
      message: "Reset produksi Supabase selesai.",
      deletedCount: result.before.affectedRows,
      before: result.before,
      after: result.after,
      resetBy: req.user.id,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "Gagal menjalankan reset produksi.",
      details: error.details || null,
    });
  }
});

export default router;
