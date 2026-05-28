import { formatDateInput } from "../../utils/format";
import {
  normalizePaymentMethodId,
  normalizeServiceCategory,
  normalizeWalletId,
} from "./shared";

const todayDate = formatDateInput(new Date());

export function normalizeAccessoryTransaction(transaction: Record<string, any>) {
  const payments = Array.isArray(transaction.payments)
    ? transaction.payments
        .map((payment) => ({
          method: normalizePaymentMethodId(payment.method || payment.metode || "cash"),
          amount: Number(payment.amount || payment.nominal || 0),
        }))
        .filter((payment) => payment.amount > 0)
    : [];

  return {
    ...transaction,
    kasir_id: transaction.kasir_id || transaction.cashier || null,
    metode_bayar: transaction.metode_bayar
      ? normalizePaymentMethodId(transaction.metode_bayar)
      : "cash",
    payments,
    total_bayar: Number(transaction.total_bayar || 0),
    uang_diterima: Number(transaction.uang_diterima || 0),
    kembalian: Number(transaction.kembalian || 0),
    shift_id: transaction.shift_id || null,
    status: transaction.status || "active",
    voided_at: transaction.voided_at || null,
    voided_by: transaction.voided_by || null,
    void_reason: transaction.void_reason || "",
    void_reversal_id: transaction.void_reversal_id || null,
    deleted_at: transaction.deleted_at || null,
    deleted_by: transaction.deleted_by || null,
    items: Array.isArray(transaction.items)
      ? transaction.items.map((item) => {
          const qty = Number(item.qty || 0);
          const hargaSatuan = Number(item.harga_satuan || 0);
          const subtotal = Number(item.subtotal || hargaSatuan * qty || 0);
          const cost = Number(item.cost ?? item.cost_total ?? item.modal ?? 0);

          return {
            ...item,
            qty,
            harga_satuan: hargaSatuan,
            subtotal,
            category: item.category || item.kategori || "",
            provider: item.provider || "",
            selling_price: Number(item.selling_price ?? subtotal),
            cost,
            profit: Number(item.profit ?? subtotal - cost),
          };
        })
      : [],
  };
}

export function normalizeDigitalTransaction(transaction: Record<string, any>) {
  const category = normalizeServiceCategory(transaction.category || transaction.jenis || "lainnya");
  const details =
    transaction.transaction_details && typeof transaction.transaction_details === "object"
      ? transaction.transaction_details
      : {};
  const transactionItems = Array.isArray(transaction.transaction_items)
    ? transaction.transaction_items.map((item, index) => {
        const qty = Number(item.qty || 1);
        const sellingPrice = Number(item.selling_price || item.price || 0);
        const cost = Number(item.cost || 0);
        const subtotal = Number(item.subtotal ?? qty * sellingPrice);
        const costTotal = Number(item.cost_total ?? qty * cost);

        return {
          ...item,
          id: item.id || `${index}-${item.product_id || item.product_name_snapshot || "item"}`,
          product_id: item.product_id || item.service_product_id || null,
          service_product_id: item.service_product_id || item.product_id || null,
          product_name_snapshot: item.product_name_snapshot || item.product_name || "",
          category: normalizeServiceCategory(item.category || category),
          provider: item.provider || transaction.provider || "",
          service_type: item.service_type || item.serviceType || transaction.service_type || "",
          qty,
          price: Number(item.price || sellingPrice),
          selling_price: sellingPrice,
          cost,
          subtotal,
          cost_total: costTotal,
          profit: Number(item.profit ?? subtotal - costTotal),
          target_number: item.target_number || item.nomor_tujuan || "",
          customer_name: item.customer_name || item.nama_tujuan || "",
        };
      })
    : [];
  const sellingPrice = Number(transaction.selling_price ?? transaction.harga_jual ?? 0);
  const cost = Number(transaction.cost ?? transaction.modal ?? 0);
  const profit =
    typeof transaction.profit === "number"
      ? transaction.profit
      : typeof transaction.keuntungan === "number"
        ? transaction.keuntungan
        : sellingPrice - cost;
  const productName =
    transaction.product_name ||
    transactionItems[0]?.product_name_snapshot ||
    transaction.catatan ||
    "";
  const adminFee = Number(transaction.admin_fee ?? transaction.biaya_admin ?? details.admin_fee ?? 0);
  const total = Number(
    transaction.total ?? details.total ?? Number(transaction.nominal || 0) + adminFee
  );
  const platform =
    transaction.platform ||
    transaction.transfer_platform ||
    details.platform ||
    transaction.provider ||
    "";
  const receiverName =
    transaction.receiver_name ||
    transaction.receiver ||
    details.receiver_name ||
    transaction.nama_tujuan ||
    transaction.customer_name ||
    "";

  return {
    ...transaction,
    kasir_id: transaction.kasir_id || transaction.cashier || null,
    jenis: category,
    category,
    nominal: Number(transaction.nominal || 0),
    admin_fee: adminFee,
    total,
    harga_jual: sellingPrice,
    modal: cost,
    keuntungan: profit,
    platform,
    transfer_platform: platform,
    provider: transaction.provider || details.platform_label || transactionItems[0]?.provider || "",
    service_type: transaction.service_type || transactionItems[0]?.service_type || "",
    nomor_tujuan: transaction.nomor_tujuan || transaction.target_number || "",
    nama_tujuan: transaction.nama_tujuan || transaction.customer_name || "",
    platform_sumber: transaction.platform_sumber
      ? normalizeWalletId(transaction.platform_sumber)
      : null,
    payment_customer:
      transaction.payment_customer ||
      details.payment_customer ||
      transaction.paymentCustomer ||
      "",
    payment_supplier:
      transaction.payment_supplier ||
      details.payment_supplier ||
      transaction.paymentSupplier ||
      "",
    payment_method: transaction.payment_method
      ? normalizePaymentMethodId(transaction.payment_method)
      : transaction.paymentMethod
        ? normalizePaymentMethodId(transaction.paymentMethod)
        : "cash",
    shift_id: transaction.shift_id || null,
    transaction_items: transactionItems,
    transaction_details: transaction.transaction_details || {
      phone_number: transaction.nomor_tujuan || transaction.target_number || "",
      customer_name: transaction.nama_tujuan || transaction.customer_name || "",
    },
    service_product_id: transaction.service_product_id || transaction.product_id || null,
    product_id: transaction.product_id || transaction.service_product_id || null,
    product_name: productName,
    selling_price: sellingPrice,
    cost,
    profit,
    target_number: transaction.target_number || transaction.nomor_tujuan || "",
    receiver_name: receiverName,
    customer_name: transaction.customer_name || transaction.nama_tujuan || receiverName,
    catatan: transaction.catatan || productName,
    status: transaction.status || "active",
    voided_at: transaction.voided_at || null,
    voided_by: transaction.voided_by || null,
    void_reason: transaction.void_reason || "",
    void_reversal_id: transaction.void_reversal_id || null,
    deleted_at: transaction.deleted_at || null,
    deleted_by: transaction.deleted_by || null,
  };
}

export function normalizeLogisticsTransaction(transaction: Record<string, any>) {
  const courier = transaction.courier || transaction.ekspedisi || "";
  const sender = transaction.sender || transaction.sender_name || "";
  const receiver = transaction.receiver || transaction.receiver_name || "";
  const destination = transaction.destination || "";
  const packageType = transaction.packageType || transaction.package_type || "Regular";
  const weight = Number(transaction.weight || 0);
  const price = Number(transaction.price ?? transaction.harga_jual ?? 0);
  const paymentMethod = transaction.paymentMethod || transaction.payment_method || transaction.platform_sumber;
  const normalizedPaymentMethod = paymentMethod ? normalizePaymentMethodId(paymentMethod) : null;
  const modal = Number(transaction.modal || 0);

  return {
    ...transaction,
    type: transaction.type || "logistik",
    courier,
    ekspedisi: courier,
    sender,
    sender_name: sender,
    receiver,
    receiver_name: receiver,
    destination,
    packageType,
    package_type: packageType,
    weight,
    price,
    paymentMethod: normalizedPaymentMethod,
    payment_method: normalizedPaymentMethod,
    harga_jual: price,
    modal,
    keuntungan:
      typeof transaction.keuntungan === "number"
        ? transaction.keuntungan
        : price - modal,
    platform_sumber: normalizedPaymentMethod,
    shift_id: transaction.shift_id || null,
    date: transaction.date || transaction.created_at || new Date().toISOString(),
    status: transaction.status || "active",
    voided_at: transaction.voided_at || null,
    voided_by: transaction.voided_by || null,
    void_reason: transaction.void_reason || "",
    void_reversal_id: transaction.void_reversal_id || null,
    cashier: transaction.cashier || transaction.kasir_id || null,
    no_resi: transaction.no_resi || "",
    catatan: transaction.catatan || "",
    deleted_at: transaction.deleted_at || null,
    deleted_by: transaction.deleted_by || null,
  };
}

export function normalizeCashEntry(entry: Record<string, any>) {
  return {
    ...entry,
    jenis: entry.jenis || "pengeluaran",
    kategori: entry.kategori || "lainnya",
    nominal: Number(entry.nominal || 0),
    keterangan: entry.keterangan || "",
    tanggal: entry.tanggal || todayDate,
    deleted_at: entry.deleted_at || null,
    deleted_by: entry.deleted_by || null,
  };
}

export function normalizeFinancialLog(log: Record<string, any>) {
  return {
    ...log,
    log_type: log.log_type || "adjustment",
    direction: log.direction || "neutral",
    amount: Number(log.amount || 0),
    payment_method: log.payment_method || "",
    reference: log.reference || "",
    notes: log.notes || "",
  };
}

export function createDeletedTransactionRecord(source: string, record: Record<string, any>) {
  return {
    id: `${source}-${record.id}`,
    source,
    transaction_id: record.id,
    raw: record,
    deleted_at: record.deleted_at || null,
    deleted_by: record.deleted_by || null,
  };
}

export function splitTransactionRowsByDeleted(rows: Record<string, any>[], source: string) {
  return rows.reduce(
    (acc, row) => {
      if (row.deleted_at) {
        acc.deletedRows.push(createDeletedTransactionRecord(source, row));
      } else {
        acc.activeRows.push(row);
      }
      return acc;
    },
    { activeRows: [] as Record<string, any>[], deletedRows: [] as ReturnType<typeof createDeletedTransactionRecord>[] }
  );
}

export function sortDeletedTransactions(rows: Record<string, any>[]) {
  return [...rows].sort((left, right) => {
    const leftTime = new Date(left.deleted_at || left.raw?.created_at || 0).getTime();
    const rightTime = new Date(right.deleted_at || right.raw?.created_at || 0).getTime();
    return rightTime - leftTime;
  });
}
