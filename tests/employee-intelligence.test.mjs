import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPLOYEE_ACTIVITY_MAX_PAGE_SIZE,
  EMPLOYEE_ACTIVITY_PAGE_SIZE,
  EMPLOYEE_PERMISSION_GROUPS,
  clampEmployeeActivityLimit,
  flattenEmployeePermissionKeys,
  getEmployeeRouteActivityStatus,
} from "../src/config/employeeIntelligence.js";

test("employee activity pagination stays bounded", () => {
  assert.equal(clampEmployeeActivityLimit(0), 1);
  assert.equal(clampEmployeeActivityLimit(undefined), EMPLOYEE_ACTIVITY_PAGE_SIZE);
  assert.equal(clampEmployeeActivityLimit(999), EMPLOYEE_ACTIVITY_MAX_PAGE_SIZE);
});

test("employee permission keys are unique and grouped", () => {
  const keys = flattenEmployeePermissionKeys();
  assert.ok(EMPLOYEE_PERMISSION_GROUPS.length >= 5);
  assert.equal(keys.length, new Set(keys).size);
  assert.ok(keys.includes("transaction.refund"));
  assert.ok(keys.includes("employee.session_revoke"));
});

test("employee route activity status uses whitelist", () => {
  assert.equal(getEmployeeRouteActivityStatus("/kasir"), "Sedang checkout");
  assert.equal(getEmployeeRouteActivityStatus("/stock-opname"), "Sedang input stok");
  assert.equal(getEmployeeRouteActivityStatus("/shift"), "Sedang closing shift");
  assert.equal(getEmployeeRouteActivityStatus("/laporan-keuangan"), "Sedang lihat laporan");
  assert.equal(getEmployeeRouteActivityStatus("/help"), "Idle");
});
