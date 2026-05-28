import assert from "node:assert/strict";
import test from "node:test";

import {
  DATA_DOMAINS,
  getRouteDataDomains,
  hasDataDomain,
} from "../src/core/realtime/routeDataDomains.js";

test("cashier route loads only the data needed for checkout continuity", () => {
  const domains = getRouteDataDomains("/kasir", "kasir");

  for (const domain of [
    DATA_DOMAINS.SHIFT,
    DATA_DOMAINS.SETTINGS,
    DATA_DOMAINS.INVENTORY,
    DATA_DOMAINS.ACCESSORY_SALES,
    DATA_DOMAINS.WALLET,
  ]) {
    assert.equal(hasDataDomain(domains, domain), true);
  }

  for (const domain of [
    DATA_DOMAINS.DIGITAL_SALES,
    DATA_DOMAINS.LOGISTICS_SALES,
    DATA_DOMAINS.CASH,
    DATA_DOMAINS.RETURNS,
    DATA_DOMAINS.EMPLOYEES,
  ]) {
    assert.equal(hasDataDomain(domains, domain), false);
  }
});

test("digital cashier route stays independent from stock and accessory sales traffic", () => {
  const domains = getRouteDataDomains("/keuangan", "kasir");

  assert.equal(hasDataDomain(domains, DATA_DOMAINS.SERVICE_PRODUCTS), true);
  assert.equal(hasDataDomain(domains, DATA_DOMAINS.DIGITAL_SALES), true);
  assert.equal(hasDataDomain(domains, DATA_DOMAINS.WALLET), true);
  assert.equal(hasDataDomain(domains, DATA_DOMAINS.INVENTORY), false);
  assert.equal(hasDataDomain(domains, DATA_DOMAINS.ACCESSORY_SALES), false);
});

test("owner dashboard receives broad operational data without exposing owner domains to cashiers", () => {
  const ownerDashboard = getRouteDataDomains("/dashboard?period=today", "pemilik");
  const cashierDashboard = getRouteDataDomains("/dashboard", "kasir");

  for (const domain of [
    DATA_DOMAINS.EMPLOYEES,
    DATA_DOMAINS.RETURNS,
    DATA_DOMAINS.STOCK_OPNAME,
    DATA_DOMAINS.PRODUCT_ACTIVITY,
  ]) {
    assert.equal(hasDataDomain(ownerDashboard, domain), true);
    assert.equal(hasDataDomain(cashierDashboard, domain), false);
  }
});

test("financial reporting keeps inventory loaded for accessory cost calculation", () => {
  const domains = getRouteDataDomains("/laporan-keuangan", "pemilik");

  assert.equal(hasDataDomain(domains, DATA_DOMAINS.INVENTORY), true);
  assert.equal(hasDataDomain(domains, DATA_DOMAINS.ACCESSORY_SALES), true);
  assert.equal(hasDataDomain(domains, DATA_DOMAINS.RETURNS), true);
});
