import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNavigationSections,
  getDefaultRoute,
  getRouteMeta,
  normalizePathname,
} from "../src/core/navigation/navigation.js";
import {
  getEffectiveFeatures,
  getRuntimeFlags,
  isFeatureEnabled,
} from "../src/core/runtime/runtimeFlags.js";
import {
  EMPLOYEE_ACTIVITY_STATUS,
  getEmployeeRouteActivityStatus,
} from "../src/features/employees/config/employeeIntelligence.js";
import { resolveProviderLogo } from "../src/features/provider-logos/resolveProviderLogo.js";

function flattenRoutes(sections) {
  return sections.flatMap((section) =>
    section.items.flatMap((item) => [item.to, ...(item.children || []).map((child) => child.to)])
  );
}

test("navigation defaults and role sections remain stable", () => {
  assert.equal(getDefaultRoute("pemilik"), "/dashboard");
  assert.equal(getDefaultRoute("kasir"), "/kasir");

  const ownerRoutes = flattenRoutes(buildNavigationSections("pemilik"));
  const cashierRoutes = flattenRoutes(buildNavigationSections("kasir"));

  assert.ok(ownerRoutes.includes("/dashboard"));
  assert.ok(ownerRoutes.includes("/kasir"));
  assert.ok(cashierRoutes.includes("/kasir"));
  assert.ok(cashierRoutes.includes("/stok-barang#tambah-kelola"));
  assert.equal(cashierRoutes.includes("/dashboard"), false);
});

test("route metadata normalizes query strings, hashes, and trailing slashes", () => {
  assert.equal(normalizePathname("/stok-barang#tambah-produk"), "/stok-barang");
  assert.equal(normalizePathname("/stok-barang?tab=produk"), "/stok-barang");
  assert.equal(normalizePathname("/stok-barang/"), "/stok-barang");

  for (const pathname of [
    "/stok-barang",
    "/stok-barang/",
    "/stok-barang#tambah-produk",
    "/stok-barang?tab=produk",
  ]) {
    assert.equal(getRouteMeta(pathname).title, "Stok Barang");
  }
});

test("feature flags resolve safe mode, unstable runtime, and disable precedence", () => {
  assert.equal(getEffectiveFeatures({ safeMode: true, enableReports: true }).reports, false);
  assert.equal(getEffectiveFeatures({ allowUnstableRuntime: false }).realtime, false);
  assert.equal(getEffectiveFeatures({ disableReports: true, enableReports: true }).reports, false);
  assert.equal(getEffectiveFeatures({ enableReports: false, disableReports: false }).reports, false);
  assert.equal(isFeatureEnabled({ enableWallet: false }, "wallet"), false);

  const noReportsRoutes = flattenRoutes(buildNavigationSections("pemilik", { enableReports: false }));
  assert.equal(noReportsRoutes.includes("/laporan-keuangan"), false);
  assert.equal(noReportsRoutes.includes("/laporan-penjualan"), false);
});

test("runtime flags still read query params and apply priority", () => {
  globalThis.window = {
    location: {
      search: "?safeMode=true&enableReports=true&allowUnstableRuntime=true",
    },
  };

  const flags = getRuntimeFlags();
  assert.equal(flags.safeMode, true);
  assert.equal(flags.enableReports, false);
  assert.equal(flags.disableReports, true);
  assert.equal(flags.enableRealtime, false);

  delete globalThis.window;
});

test("provider logo resolver matches known providers and falls back safely", () => {
  assert.equal(resolveProviderLogo("Telkomsel", "pulsa").label, "Telkomsel");
  assert.equal(resolveProviderLogo("Indosat", "pulsa").src, "/assets/provider-logos/indosat.png");
  assert.equal(resolveProviderLogo("PLN", "token_listrik").asset, "pln.svg");
  assert.equal(resolveProviderLogo("DANA", "transfer_ewallet").label, "DANA");
  assert.equal(resolveProviderLogo("QRIS", "transfer_ewallet").asset, "qris.png");

  const unknown = resolveProviderLogo("Unknown Provider");
  assert.equal(unknown.mark, "UP");
  assert.equal(unknown.label, "Unknown Provider");
  assert.equal(unknown.background, "#111827");
  assert.equal(unknown.color, "#ffffff");
});

test("employee route activity statuses are explicit and never empty", () => {
  assert.equal(getEmployeeRouteActivityStatus("/kasir"), EMPLOYEE_ACTIVITY_STATUS.CHECKOUT);
  assert.equal(getEmployeeRouteActivityStatus("/stok-barang"), EMPLOYEE_ACTIVITY_STATUS.STOCK_INPUT);
  assert.equal(getEmployeeRouteActivityStatus("/shift"), EMPLOYEE_ACTIVITY_STATUS.SHIFT_CLOSING);
  assert.equal(getEmployeeRouteActivityStatus("/dashboard"), EMPLOYEE_ACTIVITY_STATUS.REPORT_VIEW);
  assert.equal(getEmployeeRouteActivityStatus("/unknown-route"), EMPLOYEE_ACTIVITY_STATUS.IDLE);
});
