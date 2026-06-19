import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CASHIER_NAME,
  formatCashierName,
} from "../src/utils/cashier.js";

test("cashier fallback stays neutral when staff changes", () => {
  assert.equal(DEFAULT_CASHIER_NAME, "Kasir tidak tercatat");
  assert.equal(formatCashierName(""), "Kasir tidak tercatat");
  assert.equal(formatCashierName("kasir"), "Kasir tidak tercatat");
  assert.equal(
    formatCashierName("00000000-0000-4000-8000-000000000001"),
    "Kasir tidak tercatat"
  );
});

test("cashier formatter preserves explicit staff names", () => {
  assert.equal(formatCashierName("kasir pagi"), "Kasir Pagi");
  assert.equal(formatCashierName("kasir_siang"), "Kasir Siang");
  assert.equal(formatCashierName("amri syowfial"), "Amri Syowfial");
});
