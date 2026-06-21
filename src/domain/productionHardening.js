const CASH_METHODS = new Set(["cash", "tunai"]);

function normalizeNumber(value, fallback = 0) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function normalizeMethod(value) {
  return String(value || "cash").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function calculateAuthoritativeShiftSnapshot({
  accessoryTransactions = [],
  digitalTransactions = [],
  logisticsTransactions = [],
} = {}) {
  const paymentRows = [];
  let totalItems = 0;

  accessoryTransactions
    .filter((transaction) => transaction.status !== "voided" && !transaction.voided_at && !transaction.deleted_at)
    .forEach((transaction) => {
      const total = normalizeNumber(transaction.total_bayar);
      const payments = Array.isArray(transaction.payments) && transaction.payments.length
        ? transaction.payments
        : [{ method: transaction.metode_bayar || "cash", amount: total }];

      payments.forEach((payment) => {
        paymentRows.push({
          method: normalizeMethod(payment.method),
          amount: normalizeNumber(payment.amount),
        });
      });

      totalItems += Array.isArray(transaction.items)
        ? transaction.items.reduce((sum, item) => sum + normalizeNumber(item.qty), 0)
        : 0;
    });

  digitalTransactions
    .filter((transaction) => transaction.status !== "voided" && !transaction.voided_at && !transaction.deleted_at)
    .forEach((transaction) => {
      paymentRows.push({
        method: normalizeMethod(transaction.payment_method),
        amount: normalizeNumber(transaction.harga_jual ?? transaction.selling_price ?? transaction.total),
      });
      totalItems += 1;
    });

  logisticsTransactions
    .filter((transaction) => transaction.status !== "voided" && !transaction.voided_at && !transaction.deleted_at)
    .forEach((transaction) => {
      paymentRows.push({
        method: normalizeMethod(transaction.payment_method || transaction.platform_sumber),
        amount: normalizeNumber(transaction.price ?? transaction.harga_jual),
      });
      totalItems += 1;
    });

  const digitalBreakdown = {};
  let totalCash = 0;
  let totalDigital = 0;

  paymentRows.forEach((payment) => {
    if (CASH_METHODS.has(payment.method)) {
      totalCash += payment.amount;
    } else {
      totalDigital += payment.amount;
      digitalBreakdown[payment.method] = (digitalBreakdown[payment.method] || 0) + payment.amount;
    }
  });

  return {
    total_transactions:
      accessoryTransactions.filter((row) => row.status !== "voided" && !row.voided_at && !row.deleted_at).length +
      digitalTransactions.filter((row) => row.status !== "voided" && !row.voided_at && !row.deleted_at).length +
      logisticsTransactions.filter((row) => row.status !== "voided" && !row.voided_at && !row.deleted_at).length,
    total_items: totalItems,
    total_cash: totalCash,
    total_digital: totalDigital,
    digital_breakdown: digitalBreakdown,
  };
}

export function applyWalletMovement(balance, movement) {
  const currentBalance = normalizeNumber(balance);
  const nominal = normalizeNumber(movement?.nominal);
  const adminFee = normalizeNumber(movement?.biaya_admin);
  const kind = movement?.jenis || "masuk";
  const incoming = Math.max(nominal - adminFee, 0);
  const outgoing = nominal + adminFee;

  if (kind === "masuk") {
    return currentBalance + incoming;
  }

  if (kind === "keluar" || kind === "tarik_tunai" || kind === "transfer_antar") {
    const nextBalance = currentBalance - outgoing;
    if (nextBalance < 0 && movement?.allowNegative !== true) {
      throw new Error("Saldo wallet tidak boleh negatif.");
    }
    return nextBalance;
  }

  throw new Error("Jenis mutasi wallet tidak valid.");
}

export function createWalletReversalEntry(movement) {
  const nominal = normalizeNumber(movement?.nominal);
  const adminFee = normalizeNumber(movement?.biaya_admin);

  if (movement?.jenis === "masuk") {
    return {
      platform: movement.platform,
      jenis: "keluar",
      nominal,
      biaya_admin: adminFee,
      reversal_of: movement.id,
    };
  }

  return {
    platform: movement?.platform,
    jenis: "masuk",
    nominal: nominal + adminFee,
    biaya_admin: 0,
    reversal_of: movement?.id,
  };
}

export function buildAccessoryStockReversal(transaction) {
  return (transaction?.items || []).map((item) => ({
    produk_id: item.produk_id || item.id,
    tipe: "masuk",
    jumlah: normalizeNumber(item.qty),
    referensi: transaction.no_transaksi,
    catatan: "Reversal void transaksi",
  }));
}

export function detectStockOpnameConflicts(items = [], stockMovements = []) {
  return items.filter((item) =>
    stockMovements.some((movement) => {
      const itemProductId = item.product_id || item.produk_id;
      const movementProductId = movement.product_id || movement.produk_id;
      const countedAt = new Date(item.counted_at || item.cutoff_at || item.created_at || 0).getTime();
      const movedAt = new Date(movement.created_at || 0).getTime();

      return itemProductId && itemProductId === movementProductId && movedAt > countedAt;
    })
  );
}

export function assertPrintFailureDoesNotInvalidateTransaction({ transactionSaved, printResult }) {
  if (!transactionSaved) {
    throw new Error("Transaksi belum tersimpan.");
  }

  return {
    transactionSaved: true,
    printOk: Boolean(printResult?.ok),
    canReprint: true,
  };
}
