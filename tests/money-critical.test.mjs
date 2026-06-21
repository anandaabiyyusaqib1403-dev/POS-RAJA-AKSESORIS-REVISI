import test from "node:test";
import assert from "node:assert/strict";
import {
  applyWalletMovement,
  assertPrintFailureDoesNotInvalidateTransaction,
  buildAccessoryStockReversal,
  calculateAuthoritativeShiftSnapshot,
  createWalletReversalEntry,
  detectStockOpnameConflicts,
} from "../src/domain/productionHardening.js";
import { createMoneyRequestKeyStore } from "../src/core/money/moneyRequestKeys.js";
import {
  getMoneySaveFailureMessage,
  isMoneySaveResultUncertain,
} from "../src/core/money/moneyRetry.js";

test("shift snapshot counts transactions from final active rows only", () => {
  const snapshot = calculateAuthoritativeShiftSnapshot({
    accessoryTransactions: [
      {
        total_bayar: 100_000,
        metode_bayar: "cash",
        items: [{ qty: 2 }],
      },
      {
        total_bayar: 50_000,
        metode_bayar: "qris",
        items: [{ qty: 1 }],
        status: "voided",
      },
    ],
    digitalTransactions: [
      {
        harga_jual: 25_000,
        payment_method: "qris",
      },
    ],
    logisticsTransactions: [
      {
        price: 15_000,
        payment_method: "bca",
      },
    ],
  });

  assert.equal(snapshot.total_transactions, 3);
  assert.equal(snapshot.total_items, 4);
  assert.equal(snapshot.total_cash, 100_000);
  assert.equal(snapshot.total_digital, 40_000);
  assert.deepEqual(snapshot.digital_breakdown, { qris: 25_000, bca: 15_000 });
});

test("voiding accessory transaction creates stock reversal movements", () => {
  const reversals = buildAccessoryStockReversal({
    no_transaksi: "TRX-001",
    items: [
      { produk_id: "produk-a", qty: 2 },
      { produk_id: "produk-b", qty: 1 },
    ],
  });

  assert.deepEqual(reversals, [
    {
      produk_id: "produk-a",
      tipe: "masuk",
      jumlah: 2,
      referensi: "TRX-001",
      catatan: "Reversal void transaksi",
    },
    {
      produk_id: "produk-b",
      tipe: "masuk",
      jumlah: 1,
      referensi: "TRX-001",
      catatan: "Reversal void transaksi",
    },
  ]);
});

test("wallet movement rejects negative balance and reversal restores balance", () => {
  const afterTopUp = applyWalletMovement(0, {
    jenis: "masuk",
    nominal: 100_000,
    biaya_admin: 0,
  });

  assert.equal(afterTopUp, 100_000);
  assert.throws(
    () =>
      applyWalletMovement(afterTopUp, {
        jenis: "keluar",
        nominal: 150_000,
        biaya_admin: 0,
      }),
    /Saldo wallet tidak boleh negatif/
  );

  const original = {
    id: "wallet-entry-1",
    platform: "pasar_kuota",
    jenis: "keluar",
    nominal: 40_000,
    biaya_admin: 0,
  };
  const afterPayment = applyWalletMovement(afterTopUp, original);
  const reversal = createWalletReversalEntry(original);

  assert.equal(afterPayment, 60_000);
  assert.equal(applyWalletMovement(afterPayment, reversal), 100_000);
  assert.equal(reversal.reversal_of, original.id);
});

test("stock opname detects movement after item was counted", () => {
  const conflicts = detectStockOpnameConflicts(
    [
      {
        id: "item-1",
        product_id: "produk-a",
        counted_at: "2026-05-14T10:00:00.000Z",
      },
      {
        id: "item-2",
        product_id: "produk-b",
        counted_at: "2026-05-14T10:00:00.000Z",
      },
    ],
    [
      {
        product_id: "produk-a",
        created_at: "2026-05-14T10:05:00.000Z",
      },
      {
        product_id: "produk-b",
        created_at: "2026-05-14T09:55:00.000Z",
      },
    ]
  );

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].id, "item-1");
});

test("print failure remains non-blocking after transaction has been saved", () => {
  const result = assertPrintFailureDoesNotInvalidateTransaction({
    transactionSaved: true,
    printResult: {
      ok: false,
      blocked: true,
    },
  });

  assert.deepEqual(result, {
    transactionSaved: true,
    printOk: false,
    canReprint: true,
  });
});

test("retrying a pending money intent reuses its request id until confirmed", () => {
  let sequence = 0;
  const requestStore = createMoneyRequestKeyStore({
    createId: () => `request-${++sequence}`,
    now: () => 1_000,
  });
  const originalIntent = {
    items: [{ productId: "produk-a", qty: 2 }],
    payment: { method: "cash", amount: 100_000 },
  };
  const equivalentIntent = {
    payment: { amount: 100_000, method: "cash" },
    items: [{ qty: 2, productId: "produk-a" }],
  };

  assert.equal(requestStore.reserve("accessory_sale", originalIntent), "request-1");
  assert.equal(requestStore.reserve("accessory_sale", equivalentIntent), "request-1");

  requestStore.complete("accessory_sale", originalIntent, "request-1");

  assert.equal(requestStore.reserve("accessory_sale", originalIntent), "request-2");
});

test("different money intent cannot reuse a pending request id", () => {
  let sequence = 0;
  const requestStore = createMoneyRequestKeyStore({
    createId: () => `request-${++sequence}`,
    now: () => 1_000,
  });

  assert.equal(
    requestStore.reserve("wallet_mutation", { nominal: 50_000, jenis: "masuk" }),
    "request-1"
  );
  assert.equal(
    requestStore.reserve("wallet_mutation", { nominal: 60_000, jenis: "masuk" }),
    "request-2"
  );
});

test("uncertain network failure guides cashier to retry without duplicate transaction", () => {
  const networkFailure = new Error("Failed to fetch");

  assert.equal(isMoneySaveResultUncertain(networkFailure), true);
  assert.match(
    getMoneySaveFailureMessage(networkFailure, "Gagal menyimpan transaksi."),
    /retry aman tanpa transaksi ganda/
  );
  assert.equal(
    getMoneySaveFailureMessage(new Error("Saldo tidak cukup."), "Gagal menyimpan."),
    "Saldo tidak cukup."
  );
});
