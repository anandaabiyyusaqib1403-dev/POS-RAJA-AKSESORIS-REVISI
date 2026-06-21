import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./useAuth";
import { useAppMode } from "./AppModeContext";
import { supabase } from "../lib/supabase";
import { DataContext } from "./data-context";
import {
  EmployeeDataContext,
  ProductDataContext,
  ReportDataContext,
  SecurityDataContext,
  ShiftDataContext,
  TransactionDataContext,
  WalletDataContext,
} from "./domain-data-contexts";
import {
  formatDateInput,
  formatDateKey,
  generateTransactionNumber,
  isDateInRange,
} from "../utils/format";
import { formatCashierName } from "../utils/cashier";
import { toClientMessage } from "../utils/clientMessages";
import {
  calculateShiftMetrics,
  canCloseShift,
  canOpenShift,
  normalizeCashierStation,
  normalizeShiftType,
  findActiveShift,
  isShiftExpiredByAutoClose,
} from "../utils/shift";
import { DATA_LOAD_TIMEOUT_MS, LARGE_REFRESH_THROTTLE_MS } from "../core/constants/dataLoad";
import {
  SERVICE_PRODUCT_DELETE_MIGRATION_MESSAGE,
  SERVICE_PRODUCT_STALE_MESSAGE,
  SHIFT_SCHEMA_HOTFIX_MESSAGE,
  SUPPLIER_RETURN_MIGRATION_MESSAGE,
  WARRANTY_CLAIM_MIGRATION_MESSAGE,
} from "../core/constants/migrationMessages";
import {
  createSupabaseError,
  getSupabaseErrorText,
  isMissingRpcError,
  isMissingShiftApprovalSchemaError,
  isServiceProductNotFoundError,
} from "../core/errors/supabaseErrors";
import {
  getOptionalRows,
  isMissingColumnError,
  isMissingRelationOrSchemaError,
  isOptionalResetTableError,
  isPermissionDeniedForTable,
} from "../core/errors/schemaDrift";
import { withRetry } from "../core/retry/networkRetry";
import {
  createGeneratedProductCode,
  createProductActivityLog,
  getProductCodeConflictMessage,
  normalizeProduct,
  normalizeProductActivityLog,
  normalizeProductCode,
  productStatuses,
  sanitizeImportedProduct,
  splitInventoryProducts,
} from "../core/normalizers/productNormalizer";
import {
  normalizeStockLog,
  normalizeStockOpnameItem,
  normalizeStockOpnameSession,
  summarizeStockOpnameItems,
} from "../core/normalizers/inventoryNormalizer";
import {
  normalizeCustomerReturn,
  normalizeSupplierReturn,
} from "../core/normalizers/returnNormalizer";
import {
  normalizeAccessoryTransaction,
  normalizeCashEntry,
  normalizeDigitalTransaction,
  normalizeFinancialLog,
  normalizeLogisticsTransaction,
  sortDeletedTransactions,
  splitTransactionRowsByDeleted,
} from "../core/normalizers/transactionNormalizer";
import { normalizeWalletTransaction } from "../core/normalizers/walletNormalizer";
import { normalizeShiftRecord } from "../core/normalizers/shiftNormalizer";
import {
  normalizeAppSetting,
  normalizeEmployeePayroll,
  normalizeSecurityControls,
  normalizeStaffUser,
} from "../core/normalizers/employeeNormalizer";
import {
  normalizePaymentMethodId,
  normalizeServiceCategory,
  pasarKuotaServiceCategorySet,
  toSafeInteger,
} from "../core/normalizers/shared";
import {
  findServiceProductByIdOrKey,
  getServiceProductKey,
  normalizeServiceProduct,
  sanitizeServiceProductPayload,
} from "../features/transactions/normalizers/serviceProductNormalizer";
import {
  getServiceProductDbPayload,
  runServiceProductQuery,
  runServiceProductWriteQuery,
} from "../features/transactions/services/serviceProductPersistence";
import {
  getOptionalProductActivityRows,
  getProductDbPayload,
  throwDuplicateProductCodeError,
} from "../features/products/services/productPersistence";
import { createStockOpnameSchemaError } from "../features/stock-opname/services/stockOpnameErrors";
import {
  buildCashDailySummary,
  buildTrendSeries,
  getAccessoryTransactionCost,
  summarizeLogisticsByCourier,
} from "../features/analytics/calculators/operationalAnalytics";
import {
  buildWalletCards,
  getWalletImpactAmount,
  summarizeWalletPlatforms,
} from "../features/wallet/calculators/walletBalances";
import { validateWalletBalance } from "../features/wallet/validators/walletValidation";
import { getDigitalServiceWalletDeduction } from "../features/wallet/services/digitalWalletDeduction";
import { createRealtimeRefreshGuard } from "../core/realtime/realtimeGuards";
import { createRealtimeRefreshQueue } from "../core/realtime/realtimeQueue";
import { subscribeRealtimeChannel } from "../core/realtime/realtimeSubscriptions";
import { DATA_DOMAINS, getRouteDataDomains, hasDataDomain } from "../core/realtime/routeDataDomains";
import { createMoneyRequestKeyStore } from "../core/money/moneyRequestKeys";
import { EMPLOYEE_PERMISSIONS } from "../core/permissions/employeePermissions";
import { productCategoryGroups } from "../data/productCategories";
import { walletPlatformLabelMap } from "../data/businessOptions";
import { postShiftWhatsappNotification } from "../services/shiftNotifications";
import { recordOperationalEventSoon } from "../services/observability";
import { callAtomicRpc, callOptionalAtomicRpc } from "../services/rpc/supabaseRpc";
import { instrumentRequestStart, instrumentRequestEnd } from "../utils/debugRuntime";

const todayDate = formatDateInput(new Date());
const DATA_LOAD_LIMITS = {
  shifts: 240,
  transactions: 600,
  transactionItems: 5000,
  digitalTransactions: 700,
  stockMutations: 800,
  walletTransactions: 800,
  logisticsTransactions: 500,
  cashEntries: 700,
  productActivityLogs: 500,
  stockOpnameSessions: 180,
  stockOpnameItems: 2500,
  supplierReturns: 400,
  supplierReturnItems: 1600,
  customerReturns: 400,
  customerReturnItems: 1600,
  employeePayrolls: 500,
  appSettings: 50,
};

function withDataLoadTimeout(promise, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), DATA_LOAD_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}

async function runDataStage(stageName, task, { severity = "warning" } = {}) {
  const reqCtx = instrumentRequestStart(`stage:${stageName}`);

  const startedAt = Date.now();

  try {
    await withDataLoadTimeout(
      Promise.resolve().then(task),
      `${stageName} terlalu lama.`
    );
    instrumentRequestEnd(reqCtx, true);
    return true;
  } catch (error) {
    console.warn("DATA STAGE FAILED", {
      stage: stageName,
      elapsedMs: Date.now() - startedAt,
      error: error?.message || String(error),
    });
    recordOperationalEventSoon({
      eventType: "data_stage_failed",
      severity,
      source: "frontend",
      details: {
        stage: stageName,
        message: error?.message || String(error),
        route: typeof window !== "undefined" ? window.location.pathname : "",
      },
    });
    return false;
  }
}

async function runDataStageResult(stageName, task, fallbackValue, options) {
  let result = fallbackValue;
  const ok = await runDataStage(stageName, async () => {
    result = await task();
  }, options);

  return ok ? result : fallbackValue;
}
const USER_SELECT = [
  "id",
  "nama",
  "email",
  "username",
  "phone",
  "role",
  "cashier_station",
  "station_code",
  "station_name",
  "status",
  "pin_hash",
  "base_salary",
  "default_bonus",
  "default_deduction",
  "last_login",
  "last_device",
  "archived_at",
  "created_at",
  "updated_at",
].join(", ");
const USER_SELECT_FALLBACK = [
  "id",
  "nama",
  "email",
  "username",
  "phone",
  "role",
  "status",
  "pin_hash",
  "base_salary",
  "default_bonus",
  "default_deduction",
  "last_login",
  "last_device",
  "archived_at",
  "created_at",
  "updated_at",
].join(", ");
const EMPLOYEE_PAYROLL_SELECT = [
  "id",
  "employee_id",
  "period_month",
  "base_salary",
  "bonus",
  "deduction",
  "status",
  "notes",
  "paid_at",
  "paid_by",
  "created_at",
  "updated_at",
].join(", ");
const APP_SETTING_SELECT = "key, value, updated_by, updated_at";
const SHIFT_SELECT = [
  "id",
  "cashier_id",
  "employee_id",
  "employee_name",
  "cashier_station",
  "station_code",
  "station_name",
  "shift_type",
  "start_time",
  "end_time",
  "opening_cash",
  "total_cash",
  "total_digital",
  "digital_breakdown",
  "total_transactions",
  "total_items",
  "actual_cash",
  "expected_cash",
  "difference",
  "notes",
  "approval_notes",
  "status",
  "approved_by",
  "approved_at",
  "correction_difference",
  "correction_type",
  "closed_by",
  "created_at",
].join(", ");
const SHIFT_SELECT_FALLBACK = [
  "id",
  "cashier_id",
  "start_time",
  "end_time",
  "opening_cash",
  "total_cash",
  "total_digital",
  "digital_breakdown",
  "total_transactions",
  "total_items",
  "actual_cash",
  "expected_cash",
  "difference",
  "notes",
  "approval_notes",
  "status",
  "approved_by",
  "approved_at",
  "correction_difference",
  "correction_type",
  "closed_by",
  "created_at",
].join(", ");
const PRODUCT_SELECT = [
  "id",
  "kode_produk",
  "nama",
  "kategori",
  "stok",
  "stok_minimum",
  "harga_beli",
  "harga_jual",
  "satuan",
  "aktif",
  "status",
  "deleted_at",
  "deleted_by",
  "created_at",
  "updated_at",
].join(", ");
const ACCESSORY_TRANSACTION_SELECT = [
  "id",
  "no_transaksi",
  "kasir_id",
  "metode_bayar",
  "payments",
  "total_bayar",
  "uang_diterima",
  "kembalian",
  "shift_id",
  "catatan",
  "status",
  "voided_at",
  "voided_by",
  "void_reason",
  "void_reversal_id",
  "deleted_at",
  "deleted_by",
  "created_at",
].join(", ");
const ACCESSORY_ITEM_SELECT = [
  "id",
  "transaksi_id",
  "produk_id",
  "nama_produk",
  "qty",
  "harga_satuan",
  "subtotal",
  "category",
  "provider",
  "selling_price",
  "cost",
  "profit",
].join(", ");
const DIGITAL_TRANSACTION_SELECT = [
  "id",
  "no_transaksi",
  "kasir_id",
  "jenis",
  "nominal",
  "admin_fee",
  "harga_jual",
  "selling_price",
  "modal",
  "cost",
  "keuntungan",
  "profit",
  "transfer_platform",
  "provider",
  "nomor_tujuan",
  "target_number",
  "nama_tujuan",
  "customer_name",
  "receiver_name",
  "platform_sumber",
  "payment_customer",
  "payment_supplier",
  "payment_method",
  "shift_id",
  "transaction_items",
  "transaction_details",
  "service_product_id",
  "catatan",
  "status",
  "voided_at",
  "voided_by",
  "void_reason",
  "void_reversal_id",
  "deleted_at",
  "deleted_by",
  "created_at",
].join(", ");
const WALLET_TRANSACTION_BASE_SELECT = [
  "id",
  "platform",
  "jenis",
  "platform_tujuan",
  "nominal",
  "biaya_admin",
  "keterangan",
  "created_at",
].join(", ");
const WALLET_TRANSACTION_SELECT = [
  WALLET_TRANSACTION_BASE_SELECT,
  "source_type",
  "source_id",
  "source_ref",
  "balance_before",
  "balance_after",
  "reversal_of",
  "deleted_at",
  "deleted_by",
].join(", ");
const LOGISTICS_TRANSACTION_SELECT = [
  "id",
  "no_transaksi",
  "type",
  "ekspedisi",
  "sender_name",
  "receiver_name",
  "destination",
  "package_type",
  "weight",
  "price",
  "harga_jual",
  "modal",
  "keuntungan",
  "payment_method",
  "platform_sumber",
  "shift_id",
  "kasir_id",
  "no_resi",
  "catatan",
  "status",
  "voided_at",
  "voided_by",
  "void_reason",
  "void_reversal_id",
  "deleted_at",
  "deleted_by",
  "created_at",
].join(", ");
const CASH_ENTRY_SELECT = [
  "id",
  "jenis",
  "kategori",
  "nominal",
  "keterangan",
  "tanggal",
  "deleted_at",
  "deleted_by",
  "created_at",
].join(", ");
const STOCK_MUTATION_SELECT = [
  "id",
  "produk_id",
  "tipe",
  "jumlah",
  "stok_sebelum",
  "stok_sesudah",
  "referensi",
  "catatan",
  "created_at",
].join(", ");
const SERVICE_PRODUCT_SELECT = [
  "id",
  "name",
  "category",
  "provider",
  "service_type",
  "cost",
  "default_price",
  "status",
  "created_at",
].join(", ");
const SERVICES_PRODUCTS_SOURCE_SELECT = [
  "id",
  "name",
  "category",
  "provider",
  "service_type",
  "cost",
  "default_price",
  "active",
  "created_at",
].join(", ");
const PRODUCT_ACTIVITY_LOG_SELECT =
  "id, product_id, action, actor_id, details, product_snapshot, created_at";
const STOCK_OPNAME_SESSION_SELECT = [
  "id",
  "name",
  "category",
  "status",
  "created_by",
  "applied_by",
  "cutoff_at",
  "created_at",
  "updated_at",
  "completed_at",
  "total_products",
  "checked_products",
  "total_minus",
  "total_plus",
  "total_loss",
].join(", ");
const STOCK_OPNAME_ITEM_SELECT = [
  "id",
  "session_id",
  "product_id",
  "product_name",
  "product_code",
  "category",
  "system_stock",
  "real_stock",
  "difference",
  "note",
  "cost",
  "applied_delta",
  "counted_at",
  "conflict_status",
  "conflict_reason",
  "created_at",
  "updated_at",
].join(", ");
const SUPPLIER_RETURN_SELECT = [
  "id",
  "no_retur",
  "supplier_id",
  "supplier_name",
  "status",
  "reason",
  "condition",
  "notes",
  "total_quantity",
  "total_estimated_value",
  "settlement_amount",
  "settlement_method",
  "settlement_notes",
  "created_by",
  "completed_by",
  "completed_at",
  "created_at",
  "updated_at",
].join(", ");
const SUPPLIER_RETURN_ITEM_SELECT = [
  "id",
  "supplier_return_id",
  "product_id",
  "product_name",
  "product_code",
  "category",
  "quantity",
  "unit_cost",
  "subtotal_cost",
  "condition",
  "notes",
].join(", ");
const CUSTOMER_RETURN_SELECT = [
  "id",
  "no_retur",
  "transaction_id",
  "transaction_no",
  "customer_name",
  "status",
  "reason",
  "condition",
  "notes",
  "total_quantity",
  "total_refund_amount",
  "refund_method",
  "restock",
  "created_by",
  "created_at",
  "updated_at",
].join(", ");
const CUSTOMER_RETURN_ITEM_SELECT = [
  "id",
  "customer_return_id",
  "transaction_item_id",
  "product_id",
  "product_name",
  "product_code",
  "category",
  "quantity",
  "unit_price",
  "subtotal_refund",
  "restock",
  "condition",
  "notes",
].join(", ");
const WALLET_REFRESH_TIMEOUT_MS = 15000;

function withWalletRefreshTimeout(promise) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      reject(new Error("Memuat saldo internal terlalu lama. Cek koneksi lalu coba lagi."));
    }, WALLET_REFRESH_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => {
    globalThis.clearTimeout(timeoutId);
  });
}

async function fetchServiceProductSnapshot() {
  const serviceProductRes = await runServiceProductQuery(
    (query, tableName) =>
      query
        .select(
          tableName === "services_products"
            ? SERVICES_PRODUCTS_SOURCE_SELECT
            : SERVICE_PRODUCT_SELECT
        )
        .order("provider", { ascending: true })
        .order("name", { ascending: true }),
    { allowMissing: true }
  );

  return {
    rows: getOptionalRows(serviceProductRes).map(normalizeServiceProduct),
    tableName: serviceProductRes?.tableName || null,
  };
}

export function DataProvider({
  children,
  activePath = "/",
  minimalDataMode = false,
  realtimeEnabled = true,
}) {
  const { user, verifyPin } = useAuth();
  const { isDemo, demoShift } = useAppMode();
  const activeDomains = useMemo(
    () => getRouteDataDomains(activePath, user?.role),
    [activePath, user?.role]
  );
  const activeDomainsRef = useRef(activeDomains);
  activeDomainsRef.current = activeDomains;
  const [products, setProducts] = useState([]);

  const realtimeRefreshGuardRef = useRef(null);
  if (!realtimeRefreshGuardRef.current) {
    realtimeRefreshGuardRef.current = createRealtimeRefreshGuard({
      withTimeout: withDataLoadTimeout,
    });
  }
  const moneyRequestKeyStoreRef = useRef(null);
  if (!moneyRequestKeyStoreRef.current) {
    moneyRequestKeyStoreRef.current = createMoneyRequestKeyStore();
  }
  const reserveMoneyRequestId = useCallback(
    (operationType, intent) => moneyRequestKeyStoreRef.current.reserve(operationType, intent),
    []
  );
  const completeMoneyRequest = useCallback(
    (operationType, intent, requestId) =>
      moneyRequestKeyStoreRef.current.complete(operationType, intent, requestId),
    []
  );

  const runRealtimeRefresh = useCallback(
    async (key, refreshFn) => {
      await realtimeRefreshGuardRef.current.run(key, refreshFn);
    },
    []
  );

  const [deletedProducts, setDeletedProducts] = useState([]);
  const [serviceProducts, setServiceProducts] = useState([]);
  const [accessoryTransactions, setAccessoryTransactions] = useState([]);
  const [digitalTransactions, setDigitalTransactions] = useState([]);
  const [deletedTransactions, setDeletedTransactions] = useState([]);

  const [walletTransactions, setWalletTransactions] = useState([]);
  const [logisticsTransactions, setLogisticsTransactions] = useState([]);
  const [cashEntries, setCashEntries] = useState([]);
  const [stockLogs, setStockLogs] = useState([]);
  const [stockOpnameSessions, setStockOpnameSessions] = useState([]);
  const [supplierReturns, setSupplierReturns] = useState([]);
  const [customerReturns, setCustomerReturns] = useState([]);
  const [productActivityLogs, setProductActivityLogs] = useState([]);
  const [shiftRecords, setShiftRecords] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [employeePayrolls, setEmployeePayrolls] = useState([]);
  const [appSettings, setAppSettings] = useState({});
  const [selectedCashierIdState, setSelectedCashierIdState] = useState("");
  const [serviceProductRealtimeTable, setServiceProductRealtimeTable] = useState(null);
  const [coreLoading, setCoreLoading] = useState(false);
  const [coreError, setCoreError] = useState("");
  const loading = coreLoading;
  const loadVersionRef = useRef(0);
  const hasCompletedInitialLoadRef = useRef(false);
  const maintenanceCompletedRef = useRef(false);
  const maintenancePromiseRef = useRef(null);

  const shiftRefreshVersionRef = useRef(0);
  const productRefreshVersionRef = useRef(0);
  const accessoryRefreshVersionRef = useRef(0);
  const digitalRefreshVersionRef = useRef(0);
  const logisticsRefreshVersionRef = useRef(0);
  const cashRefreshVersionRef = useRef(0);
  const stockRefreshVersionRef = useRef(0);
  const walletRefreshVersionRef = useRef(0);
  const serviceProductRefreshVersionRef = useRef(0);

  const setSelectedCashierId = useCallback((nextCashierId) => {
    const safeCashierId = nextCashierId || "";
    setSelectedCashierIdState(safeCashierId);
  }, []);

  // Notifikasi stok rendah
  const checkLowStockNotifications = useCallback(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const lowStockProducts = products.filter(
      (product) => product.aktif && product.stok > 0 && product.stok <= product.stok_minimum
    );

    if (lowStockProducts.length > 0) {
      const notification = new Notification("Stok Rendah - Raja Aksesoris", {
        body: `${lowStockProducts.length} produk mendekati stok minimum. Cek halaman produk.`,
        tag: "low-stock",
      });

      notification.onclick = () => {
        window.focus();
        window.location.href = "/produk";
      };
    }
  }, [products]);

  const refreshServiceProductState = useCallback(async () => {
    const requestVersion = ++serviceProductRefreshVersionRef.current;
    const snapshot = await fetchServiceProductSnapshot();
    if (
      requestVersion !== serviceProductRefreshVersionRef.current ||
      !hasDataDomain(activeDomainsRef.current, DATA_DOMAINS.SERVICE_PRODUCTS)
    ) {
      return [];
    }
    setServiceProducts(snapshot.rows);
    setServiceProductRealtimeTable(snapshot.tableName || null);
    return snapshot.rows;
  }, []);

  const replaceDeletedTransactionsForSource = useCallback((source, sourceRows) => {
    setDeletedTransactions((rows) =>
      sortDeletedTransactions([
        ...rows.filter((row) => row.source !== source),
        ...sourceRows,
      ])
    );
  }, []);

  const resetLoadedState = useCallback(({ invalidateRequests = true } = {}) => {
    if (invalidateRequests) {
      loadVersionRef.current += 1;
      shiftRefreshVersionRef.current += 1;
      productRefreshVersionRef.current += 1;
      accessoryRefreshVersionRef.current += 1;
      digitalRefreshVersionRef.current += 1;
      logisticsRefreshVersionRef.current += 1;
      cashRefreshVersionRef.current += 1;
      stockRefreshVersionRef.current += 1;
      walletRefreshVersionRef.current += 1;
      serviceProductRefreshVersionRef.current += 1;
    }
    setProducts([]);
    setDeletedProducts([]);
    setAccessoryTransactions([]);
    setDigitalTransactions([]);
    setDeletedTransactions([]);
    setWalletTransactions([]);
    setLogisticsTransactions([]);
    setCashEntries([]);
    setStockLogs([]);
    setStockOpnameSessions([]);
    setSupplierReturns([]);
    setCustomerReturns([]);
    setProductActivityLogs([]);
    setServiceProducts([]);
    setServiceProductRealtimeTable(null);
    setShiftRecords([]);
    setStaffUsers([]);
    setEmployeePayrolls([]);
    setAppSettings({});
    maintenanceCompletedRef.current = false;
    maintenancePromiseRef.current = null;
  }, []);

  const runMaintenanceJobs = useCallback(async () => {
    const purgeRes = await supabase.rpc("purge_expired_deleted_products");
    if (purgeRes.error && !isMissingRpcError(purgeRes.error)) {
      throw purgeRes.error;
    }

    const transactionPurgeRes = await supabase.rpc("purge_expired_deleted_transactions");
    if (transactionPurgeRes.error && !isMissingRpcError(transactionPurgeRes.error)) {
      throw transactionPurgeRes.error;
    }

    const autoCloseShiftRes = await supabase.rpc("auto_close_expired_active_shifts");
    if (autoCloseShiftRes.error && !isMissingRpcError(autoCloseShiftRes.error)) {
      throw autoCloseShiftRes.error;
    }
  }, []);

  const runMaintenanceJobsOnce = useCallback(async () => {
    if (maintenanceCompletedRef.current) return;

    maintenancePromiseRef.current ||= runMaintenanceJobs()
      .then(() => {
        maintenanceCompletedRef.current = true;
      })
      .finally(() => {
        maintenancePromiseRef.current = null;
      });

    await maintenancePromiseRef.current;
  }, [runMaintenanceJobs]);

  const refreshShiftData = useCallback(async () => {
    const requestVersion = ++shiftRefreshVersionRef.current;

    if (!user) {
      setShiftRecords([]);
      setStaffUsers([]);
      return;
    }

    let usersRes = await supabase
      .from("users")
      .select(USER_SELECT)
      .is("archived_at", null)
      .order("nama", { ascending: true });
    if (isMissingColumnError(usersRes.error, ["cashier_station", "station_code", "station_name"])) {
      usersRes = await supabase
        .from("users")
        .select(USER_SELECT_FALLBACK)
        .is("archived_at", null)
        .order("nama", { ascending: true });
    }

    let shiftsRes = await supabase
      .from("shifts")
      .select(SHIFT_SELECT)
      .order("start_time", { ascending: false })
      .limit(DATA_LOAD_LIMITS.shifts);
    if (
      isMissingColumnError(shiftsRes.error, [
        "employee_id",
        "employee_name",
        "cashier_station",
        "station_code",
        "station_name",
        "shift_type",
      ])
    ) {
      shiftsRes = await supabase
        .from("shifts")
        .select(SHIFT_SELECT_FALLBACK)
        .order("start_time", { ascending: false })
        .limit(DATA_LOAD_LIMITS.shifts);
    }

    if (requestVersion !== shiftRefreshVersionRef.current) return;

    setStaffUsers(getOptionalRows(usersRes).map(normalizeStaffUser));
    setShiftRecords(getOptionalRows(shiftsRes).map(normalizeShiftRecord));
  }, [user]);

  const refreshEmployeePayrollData = useCallback(async () => {
    if (!user || user.role !== "pemilik") {
      setEmployeePayrolls([]);
      return [];
    }

    const payrollsRes = await supabase
      .from("employee_payrolls")
      .select(EMPLOYEE_PAYROLL_SELECT)
      .order("period_month", { ascending: false })
      .limit(DATA_LOAD_LIMITS.employeePayrolls);

    try {
      const payrollRows = getOptionalRows(payrollsRes).map(normalizeEmployeePayroll);
      if (!hasDataDomain(activeDomainsRef.current, DATA_DOMAINS.EMPLOYEES)) return payrollRows;
      setEmployeePayrolls(payrollRows);
      return payrollRows;
    } catch (error) {
      if (isPermissionDeniedForTable(error, ["employee_payrolls"])) {
        setEmployeePayrolls([]);
        return [];
      } else {
        throw error;
      }
    }
  }, [user]);

  const refreshAppSettings = useCallback(async () => {
    if (!user) {
      setAppSettings({});
      return;
    }

    const result = await supabase
      .from("app_settings")
      .select(APP_SETTING_SELECT)
      .limit(DATA_LOAD_LIMITS.appSettings);

    if (result.error) {
      if (isOptionalResetTableError(result.error) || isPermissionDeniedForTable(result.error, ["app_settings"])) {
        setAppSettings({});
        return;
      }
      throw result.error;
    }

    const nextSettings = {};
    (result.data || []).map(normalizeAppSetting).forEach((setting) => {
      nextSettings[setting.key] = setting;
    });
    setAppSettings(nextSettings);
  }, [user]);

  const refreshProductData = useCallback(async () => {
    const requestVersion = ++productRefreshVersionRef.current;

    if (!user) {
      setProducts([]);
      setDeletedProducts([]);
      return [];
    }

    const { data, error } = await supabase
      .from("produk")
      .select(PRODUCT_SELECT)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const productRows = (data || []).map(normalizeProduct);
    const {
      activeProducts: activeProductRows,
      deletedProducts: deletedProductRows,
    } = splitInventoryProducts(productRows);

    if (
      requestVersion !== productRefreshVersionRef.current ||
      !hasDataDomain(activeDomainsRef.current, DATA_DOMAINS.INVENTORY)
    ) {
      return [];
    }

    setProducts(activeProductRows);
    setDeletedProducts(deletedProductRows);
    return activeProductRows;
  }, [user]);

  const refreshAccessoryTransactionData = useCallback(async () => {
    const requestVersion = ++accessoryRefreshVersionRef.current;

    if (!user) {
      setAccessoryTransactions([]);
      replaceDeletedTransactionsForSource("aksesoris", []);
      return [];
    }

    const transaksiRes = await supabase
      .from("transaksi")
      .select(ACCESSORY_TRANSACTION_SELECT)
      .order("created_at", { ascending: false })
      .limit(DATA_LOAD_LIMITS.transactions);

    const transactionRows = getOptionalRows(transaksiRes);
    const transactionIds = transactionRows.map((transaction) => transaction.id).filter(Boolean);
    let itemRows = [];

    if (transactionIds.length) {
      const { data: itemData, error: itemError } = await supabase
        .from("item_transaksi")
        .select(ACCESSORY_ITEM_SELECT)
        .in("transaksi_id", transactionIds)
        .limit(DATA_LOAD_LIMITS.transactionItems);

      if (itemError) throw itemError;
      itemRows = itemData || [];
    }

    const itemsByTransaction = itemRows.reduce((acc, item) => {
      acc[item.transaksi_id] ??= [];
      acc[item.transaksi_id].push(item);
      return acc;
    }, {});

    const normalizedAccessoryRows = transactionRows.map((trx) => ({
      ...normalizeAccessoryTransaction(trx),
      items: itemsByTransaction[trx.id] || [],
    }));
    const accessorySplit = splitTransactionRowsByDeleted(normalizedAccessoryRows, "aksesoris");

    if (
      requestVersion !== accessoryRefreshVersionRef.current ||
      !hasDataDomain(activeDomainsRef.current, DATA_DOMAINS.ACCESSORY_SALES)
    ) {
      return [];
    }

    setAccessoryTransactions(accessorySplit.activeRows);
    replaceDeletedTransactionsForSource("aksesoris", accessorySplit.deletedRows);
    return accessorySplit.activeRows;
  }, [replaceDeletedTransactionsForSource, user]);

  const refreshDigitalTransactionData = useCallback(async () => {
    const requestVersion = ++digitalRefreshVersionRef.current;

    if (!user) {
      setDigitalTransactions([]);
      replaceDeletedTransactionsForSource("digital", []);
      return [];
    }

    const digitalRes = await supabase
      .from("transaksi_digital")
      .select(DIGITAL_TRANSACTION_SELECT)
      .order("created_at", { ascending: false })
      .limit(DATA_LOAD_LIMITS.digitalTransactions);

    const digitalSplit = splitTransactionRowsByDeleted(
      getOptionalRows(digitalRes).map(normalizeDigitalTransaction),
      "digital"
    );

    if (
      requestVersion !== digitalRefreshVersionRef.current ||
      !hasDataDomain(activeDomainsRef.current, DATA_DOMAINS.DIGITAL_SALES)
    ) {
      return [];
    }

    setDigitalTransactions(digitalSplit.activeRows);
    replaceDeletedTransactionsForSource("digital", digitalSplit.deletedRows);
    return digitalSplit.activeRows;
  }, [replaceDeletedTransactionsForSource, user]);

  const refreshWalletData = useCallback(async () => {
    const requestVersion = ++walletRefreshVersionRef.current;

    if (!user) {
      setWalletTransactions([]);
      replaceDeletedTransactionsForSource("saldo", []);
      return [];
    }

    let walletRes = await withWalletRefreshTimeout(
      supabase
        .from("transaksi_dompet")
        .select(WALLET_TRANSACTION_SELECT)
        .order("created_at", { ascending: false })
        .limit(DATA_LOAD_LIMITS.walletTransactions)
    );

    if (
      walletRes.error &&
      isMissingColumnError(walletRes.error, [
        "source_type",
        "source_id",
        "source_ref",
        "balance_before",
        "balance_after",
        "reversal_of",
        "deleted_at",
        "deleted_by",
      ])
    ) {
      walletRes = await withWalletRefreshTimeout(
        supabase
          .from("transaksi_dompet")
          .select(WALLET_TRANSACTION_BASE_SELECT)
          .order("created_at", { ascending: false })
          .limit(DATA_LOAD_LIMITS.walletTransactions)
      );
    }

    const walletSplit = splitTransactionRowsByDeleted(
      getOptionalRows(walletRes).map(normalizeWalletTransaction),
      "saldo"
    );

    if (
      requestVersion !== walletRefreshVersionRef.current ||
      !hasDataDomain(activeDomainsRef.current, DATA_DOMAINS.WALLET)
    ) {
      return [];
    }

    setWalletTransactions(walletSplit.activeRows);
    replaceDeletedTransactionsForSource("saldo", walletSplit.deletedRows);
    return walletSplit.activeRows;
  }, [replaceDeletedTransactionsForSource, user]);

  const refreshLogisticsTransactionData = useCallback(async () => {
    const requestVersion = ++logisticsRefreshVersionRef.current;

    if (!user) {
      setLogisticsTransactions([]);
      replaceDeletedTransactionsForSource("logistik", []);
      return [];
    }

    const logisticsRes = await supabase
      .from("transaksi_logistik")
      .select(LOGISTICS_TRANSACTION_SELECT)
      .order("created_at", { ascending: false })
      .limit(DATA_LOAD_LIMITS.logisticsTransactions);

    const logisticsSplit = splitTransactionRowsByDeleted(
      getOptionalRows(logisticsRes).map(normalizeLogisticsTransaction),
      "logistik"
    );

    if (
      requestVersion !== logisticsRefreshVersionRef.current ||
      !hasDataDomain(activeDomainsRef.current, DATA_DOMAINS.LOGISTICS_SALES)
    ) {
      return [];
    }

    setLogisticsTransactions(logisticsSplit.activeRows);
    replaceDeletedTransactionsForSource("logistik", logisticsSplit.deletedRows);
    return logisticsSplit.activeRows;
  }, [replaceDeletedTransactionsForSource, user]);

  const refreshCashData = useCallback(async () => {
    const requestVersion = ++cashRefreshVersionRef.current;

    if (!user) {
      setCashEntries([]);
      replaceDeletedTransactionsForSource("operasional", []);
      return [];
    }

    const cashRes = await supabase
      .from("kas")
      .select(CASH_ENTRY_SELECT)
      .order("tanggal", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(DATA_LOAD_LIMITS.cashEntries);

    const cashSplit = splitTransactionRowsByDeleted(
      getOptionalRows(cashRes).map(normalizeCashEntry),
      "operasional"
    );

    if (
      requestVersion !== cashRefreshVersionRef.current ||
      !hasDataDomain(activeDomainsRef.current, DATA_DOMAINS.CASH)
    ) {
      return [];
    }

    setCashEntries(cashSplit.activeRows);
    replaceDeletedTransactionsForSource("operasional", cashSplit.deletedRows);
    return cashSplit.activeRows;
  }, [replaceDeletedTransactionsForSource, user]);

  const refreshStockMutationData = useCallback(async () => {
    const requestVersion = ++stockRefreshVersionRef.current;

    if (!user) {
      setStockLogs([]);
      return [];
    }

    const stockMutationRes = await supabase
      .from("stok_mutasi")
      .select(STOCK_MUTATION_SELECT)
      .order("created_at", { ascending: false })
      .limit(DATA_LOAD_LIMITS.stockMutations);

    let stockRows = [];
    if (stockMutationRes.error && isOptionalResetTableError(stockMutationRes.error)) {
      const legacyStockRes = await supabase
        .from("stok_masuk")
        .select("id, produk_id, jumlah, catatan, created_at")
        .order("created_at", { ascending: false })
        .limit(DATA_LOAD_LIMITS.stockMutations);
      if (legacyStockRes.error && !isOptionalResetTableError(legacyStockRes.error)) {
        throw legacyStockRes.error;
      }
      stockRows = (legacyStockRes.data || []).map((log) =>
        normalizeStockLog({
          ...log,
          tipe: "masuk",
          catatan: "Migrasi dari stok masuk",
        })
      );
    } else if (stockMutationRes.error) {
      throw stockMutationRes.error;
    } else {
      stockRows = (stockMutationRes.data || []).map(normalizeStockLog);
    }

    if (
      requestVersion !== stockRefreshVersionRef.current ||
      !hasDataDomain(activeDomainsRef.current, DATA_DOMAINS.INVENTORY)
    ) {
      return [];
    }

    setStockLogs(stockRows);
    return stockRows;
  }, [user]);

  const refreshProductActivityLogData = useCallback(async () => {
    if (!user || user.role !== "pemilik") {
      setProductActivityLogs([]);
      return [];
    }

    const productActivityLogRes = await supabase
      .from("product_activity_logs")
      .select(PRODUCT_ACTIVITY_LOG_SELECT)
      .order("created_at", { ascending: false })
      .limit(DATA_LOAD_LIMITS.productActivityLogs);

    const productActivityRows =
      getOptionalProductActivityRows(productActivityLogRes).map(normalizeProductActivityLog);
    if (!hasDataDomain(activeDomainsRef.current, DATA_DOMAINS.PRODUCT_ACTIVITY)) {
      return productActivityRows;
    }
    setProductActivityLogs(productActivityRows);
    return productActivityRows;
  }, [user]);

  const refreshStockOpnameData = useCallback(async () => {
    if (!user || user.role !== "pemilik") {
      setStockOpnameSessions([]);
      return [];
    }

    const stockOpnameSessionRes = await supabase
      .from("stock_opname_sessions")
      .select(STOCK_OPNAME_SESSION_SELECT)
      .order("created_at", { ascending: false })
      .limit(DATA_LOAD_LIMITS.stockOpnameSessions);

    const stockOpnameItemRes = await supabase
      .from("stock_opname_items")
      .select(STOCK_OPNAME_ITEM_SELECT)
      .limit(DATA_LOAD_LIMITS.stockOpnameItems);

    const stockOpnameItemRows = getOptionalRows(stockOpnameItemRes).map(normalizeStockOpnameItem);
    const stockOpnameRows = getOptionalRows(stockOpnameSessionRes).map((session) =>
      normalizeStockOpnameSession(session, stockOpnameItemRows)
    );
    if (!hasDataDomain(activeDomainsRef.current, DATA_DOMAINS.STOCK_OPNAME)) {
      return stockOpnameRows;
    }
    setStockOpnameSessions(stockOpnameRows);
    return stockOpnameRows;
  }, [user]);

  const refreshReturnData = useCallback(async () => {
    if (!user || user.role !== "pemilik") {
      setSupplierReturns([]);
      setCustomerReturns([]);
      return { supplierReturns: [], customerReturns: [] };
    }

    const supplierReturnRes = await supabase
      .from("supplier_returns")
      .select(SUPPLIER_RETURN_SELECT)
      .order("created_at", { ascending: false })
      .limit(DATA_LOAD_LIMITS.supplierReturns);

    const supplierReturnItemRes = await supabase
      .from("supplier_return_items")
      .select(SUPPLIER_RETURN_ITEM_SELECT)
      .limit(DATA_LOAD_LIMITS.supplierReturnItems);

    const customerReturnRes = await supabase
      .from("customer_returns")
      .select(CUSTOMER_RETURN_SELECT)
      .order("created_at", { ascending: false })
      .limit(DATA_LOAD_LIMITS.customerReturns);

    const customerReturnItemRes = await supabase
      .from("customer_return_items")
      .select(CUSTOMER_RETURN_ITEM_SELECT)
      .limit(DATA_LOAD_LIMITS.customerReturnItems);

    const supplierReturnItemRows = getOptionalRows(supplierReturnItemRes);
    const supplierReturnRows = getOptionalRows(supplierReturnRes).map((row) =>
      normalizeSupplierReturn(row, supplierReturnItemRows)
    );
    const customerReturnItemRows = getOptionalRows(customerReturnItemRes);
    const customerReturnRows = getOptionalRows(customerReturnRes).map((row) =>
      normalizeCustomerReturn(row, customerReturnItemRows)
    );

    if (!hasDataDomain(activeDomainsRef.current, DATA_DOMAINS.RETURNS)) {
      return { supplierReturns: supplierReturnRows, customerReturns: customerReturnRows };
    }
    setSupplierReturns(supplierReturnRows);
    setCustomerReturns(customerReturnRows);
    return { supplierReturns: supplierReturnRows, customerReturns: customerReturnRows };
  }, [user]);

  const refreshTransactionData = useCallback(
    async () => {
      const accessoryRows = await runDataStageResult(
        "transactions_accessory",
        refreshAccessoryTransactionData,
        []
      );
      const digitalRows = await runDataStageResult(
        "transactions_digital",
        refreshDigitalTransactionData,
        []
      );
      const walletRows = await runDataStageResult(
        "transactions_wallet",
        refreshWalletData,
        []
      );
      const logisticsRows = await runDataStageResult(
        "transactions_logistics",
        refreshLogisticsTransactionData,
        []
      );
      const cashRows = await runDataStageResult(
        "transactions_cash",
        refreshCashData,
        []
      );
      return [accessoryRows, digitalRows, walletRows, logisticsRows, cashRows];
    },
    [
      refreshAccessoryTransactionData,
      refreshCashData,
      refreshDigitalTransactionData,
      refreshLogisticsTransactionData,
      refreshWalletData,
    ]
  );

  const refreshInventoryData = useCallback(
    async () => {
      const productRows = await runDataStageResult("inventory_products", refreshProductData, []);
      const stockRows = await runDataStageResult("inventory_stock", refreshStockMutationData, []);
      return [productRows, stockRows];
    },
    [refreshProductData, refreshStockMutationData]
  );

  const loadRouteData = useCallback(
    async (domains) => {
      if (!user || minimalDataMode) return;

      const tasks = [];
      const addTask = (stageName, task) => {
        tasks.push(runDataStage(stageName, task));
      };

    addTask("maintenance", runMaintenanceJobsOnce);

      if (hasDataDomain(domains, DATA_DOMAINS.INVENTORY)) {
        addTask("inventory", refreshInventoryData);
      }
      if (hasDataDomain(domains, DATA_DOMAINS.SERVICE_PRODUCTS)) {
        addTask("service_products", refreshServiceProductState);
      }
      if (hasDataDomain(domains, DATA_DOMAINS.ACCESSORY_SALES)) {
        addTask("transactions_accessory", refreshAccessoryTransactionData);
      }
      if (hasDataDomain(domains, DATA_DOMAINS.DIGITAL_SALES)) {
        addTask("transactions_digital", refreshDigitalTransactionData);
      }
      if (hasDataDomain(domains, DATA_DOMAINS.LOGISTICS_SALES)) {
        addTask("transactions_logistics", refreshLogisticsTransactionData);
      }
      if (hasDataDomain(domains, DATA_DOMAINS.WALLET)) {
        addTask("transactions_wallet", refreshWalletData);
      }
      if (hasDataDomain(domains, DATA_DOMAINS.CASH)) {
        addTask("transactions_cash", refreshCashData);
      }
      if (hasDataDomain(domains, DATA_DOMAINS.PRODUCT_ACTIVITY)) {
        addTask("product_activity_logs", refreshProductActivityLogData);
      }
      if (hasDataDomain(domains, DATA_DOMAINS.STOCK_OPNAME)) {
        addTask("stock_opname", refreshStockOpnameData);
      }
      if (hasDataDomain(domains, DATA_DOMAINS.RETURNS)) {
        addTask("returns", refreshReturnData);
      }
      if (hasDataDomain(domains, DATA_DOMAINS.EMPLOYEES)) {
        addTask("employee_payrolls", refreshEmployeePayrollData);
      }

      await Promise.all(tasks);
    },
    [
      minimalDataMode,
      refreshAccessoryTransactionData,
      refreshCashData,
      refreshDigitalTransactionData,
      refreshEmployeePayrollData,
      refreshInventoryData,
      refreshLogisticsTransactionData,
      refreshProductActivityLogData,
      refreshReturnData,
      refreshServiceProductState,
      refreshStockOpnameData,
      refreshWalletData,
      runMaintenanceJobsOnce,
      user,
    ]
  );

  const loadData = useCallback(async () => {
    const requestVersion = ++loadVersionRef.current;
    setCoreLoading(true);
    setCoreError("");

    try {
      if (!user) {
        hasCompletedInitialLoadRef.current = false;
        resetLoadedState({ invalidateRequests: false });
        return;
      }

      const shiftLoaded = await runDataStage("core_shift", refreshShiftData, { severity: "critical" });
      const settingsLoaded = await runDataStage("core_settings", refreshAppSettings, { severity: "warning" });
      if (!shiftLoaded) {
        setCoreError("Data shift belum berhasil dimuat.");
      } else if (!settingsLoaded) {
        setCoreError("Pengaturan aplikasi belum berhasil dimuat.");
      }
      await loadRouteData(activeDomains);
    } catch (error) {
      console.error("Data load failed:", error);
      setCoreError(error?.message || "Data inti belum berhasil dimuat.");
      recordOperationalEventSoon({
        eventType: "data_load_failed",
        severity: "critical",
        source: "frontend",
        details: {
          message: error?.message || String(error),
          route: typeof window !== "undefined" ? window.location.pathname : "",
        },
      });
    } finally {
      if (requestVersion === loadVersionRef.current) {
        setCoreLoading(false);
        hasCompletedInitialLoadRef.current = true;
      }
    }

  }, [
    activeDomains,
    refreshAppSettings,
    loadRouteData,
    refreshShiftData,
    resetLoadedState,
    user,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!hasDataDomain(activeDomains, DATA_DOMAINS.INVENTORY)) {
      productRefreshVersionRef.current += 1;
      stockRefreshVersionRef.current += 1;
      setProducts([]);
      setDeletedProducts([]);
      setStockLogs([]);
    }
    if (!hasDataDomain(activeDomains, DATA_DOMAINS.SERVICE_PRODUCTS)) {
      serviceProductRefreshVersionRef.current += 1;
      setServiceProducts([]);
      setServiceProductRealtimeTable(null);
    }
    if (!hasDataDomain(activeDomains, DATA_DOMAINS.ACCESSORY_SALES)) {
      accessoryRefreshVersionRef.current += 1;
      setAccessoryTransactions([]);
      setDeletedTransactions((rows) => rows.filter((row) => row.source !== "aksesoris"));
    }
    if (!hasDataDomain(activeDomains, DATA_DOMAINS.DIGITAL_SALES)) {
      digitalRefreshVersionRef.current += 1;
      setDigitalTransactions([]);
      setDeletedTransactions((rows) => rows.filter((row) => row.source !== "digital"));
    }
    if (!hasDataDomain(activeDomains, DATA_DOMAINS.LOGISTICS_SALES)) {
      logisticsRefreshVersionRef.current += 1;
      setLogisticsTransactions([]);
      setDeletedTransactions((rows) => rows.filter((row) => row.source !== "logistik"));
    }
    if (!hasDataDomain(activeDomains, DATA_DOMAINS.WALLET)) {
      walletRefreshVersionRef.current += 1;
      setWalletTransactions([]);
      setDeletedTransactions((rows) => rows.filter((row) => row.source !== "saldo"));
    }
    if (!hasDataDomain(activeDomains, DATA_DOMAINS.CASH)) {
      cashRefreshVersionRef.current += 1;
      setCashEntries([]);
      setDeletedTransactions((rows) => rows.filter((row) => row.source !== "operasional"));
    }
    if (!hasDataDomain(activeDomains, DATA_DOMAINS.PRODUCT_ACTIVITY)) {
      setProductActivityLogs([]);
    }
    if (!hasDataDomain(activeDomains, DATA_DOMAINS.STOCK_OPNAME)) {
      setStockOpnameSessions([]);
    }
    if (!hasDataDomain(activeDomains, DATA_DOMAINS.RETURNS)) {
      setSupplierReturns([]);
      setCustomerReturns([]);
    }
    if (!hasDataDomain(activeDomains, DATA_DOMAINS.EMPLOYEES)) {
      setEmployeePayrolls([]);
    }
  }, [activeDomains]);

  useEffect(() => {
    if (!user) return undefined;
    if (minimalDataMode || !realtimeEnabled) {
      return undefined;
    }

    const realtimeQueue = createRealtimeRefreshQueue({
      runRefresh: runRealtimeRefresh,
      onError: (key, error) => {
        console.error(`Gagal refresh ${key}:`, error);
      },
    });
    const queueRefresh = realtimeQueue.queueRefresh;
    const refreshProducts = () => queueRefresh("produk", refreshProductData);
    const refreshAccessories = () => queueRefresh("transaksi", refreshAccessoryTransactionData);
    const refreshDigital = () => queueRefresh("transaksi_digital", refreshDigitalTransactionData);
    const refreshWallet = () => queueRefresh("transaksi_dompet", refreshWalletData);
    const refreshLogistics = () => queueRefresh("transaksi_logistik", refreshLogisticsTransactionData);
    const refreshCash = () => queueRefresh("kas", refreshCashData);
    const refreshInventory = () => queueRefresh("stok", refreshInventoryData);
    const refreshStockOpname = () => queueRefresh("stock_opname", refreshStockOpnameData);
    const refreshReturns = () => queueRefresh("retur", async () => {
      await refreshReturnData();
      await refreshProductData();
    });
    const refreshProductActivity = () =>
      queueRefresh("product_activity_logs", refreshProductActivityLogData);
    const refreshServiceProducts = () =>
      queueRefresh("service_products", refreshServiceProductState);
    const refreshShifts = () =>
      queueRefresh("shifts", refreshShiftData, {
        delayMs: LARGE_REFRESH_THROTTLE_MS,
        minIntervalMs: LARGE_REFRESH_THROTTLE_MS,
      });
    const refreshSettings = () => queueRefresh("app_settings", refreshAppSettings);

    const upsertById = (rows, row) => [row, ...rows.filter((item) => item.id !== row.id)];
    const removeById = (rows, id) => rows.filter((item) => item.id !== id);
    const applyProductRealtimePatch = (payload) => {
      if (payload.eventType === "DELETE") {
        const deletedId = payload.old?.id;
        setProducts((rows) => removeById(rows, deletedId));
        setDeletedProducts((rows) => removeById(rows, deletedId));
        return;
      }

      if (!payload.new) {
        refreshProducts();
        return;
      }

      const product = normalizeProduct(payload.new);
      const isDeletedProduct = product.status === productStatuses.deleted || product.deleted_at;

      setProducts((rows) =>
        isDeletedProduct ? removeById(rows, product.id) : upsertById(rows, product)
      );
      setDeletedProducts((rows) =>
        isDeletedProduct ? upsertById(rows, product) : removeById(rows, product.id)
      );
    };

    const subscribeChannel = (channelName, channel) =>
      subscribeRealtimeChannel({
        channelName,
        channel,
        recordEvent: recordOperationalEventSoon,
      });

    const scopeSuffix = String(activePath || "root").replace(/[^a-z0-9-]+/gi, "-");
    const channels = [];
    const addChannel = (channelName, channel) => {
      channels.push(subscribeChannel(channelName, channel));
    };

    if (
      hasDataDomain(activeDomains, DATA_DOMAINS.INVENTORY) ||
      hasDataDomain(activeDomains, DATA_DOMAINS.STOCK_OPNAME) ||
      hasDataDomain(activeDomains, DATA_DOMAINS.RETURNS) ||
      hasDataDomain(activeDomains, DATA_DOMAINS.PRODUCT_ACTIVITY) ||
      hasDataDomain(activeDomains, DATA_DOMAINS.SERVICE_PRODUCTS)
    ) {
      let inventoryChannel = supabase.channel(`inventory-sync:${scopeSuffix}`);

      if (hasDataDomain(activeDomains, DATA_DOMAINS.INVENTORY)) {
        inventoryChannel = inventoryChannel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "produk" },
            applyProductRealtimePatch
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "stok_mutasi" },
            refreshInventory
          );
      }
      if (hasDataDomain(activeDomains, DATA_DOMAINS.STOCK_OPNAME)) {
        inventoryChannel = inventoryChannel
          .on("postgres_changes", { event: "*", schema: "public", table: "stock_opname_sessions" }, refreshStockOpname)
          .on("postgres_changes", { event: "*", schema: "public", table: "stock_opname_items" }, refreshStockOpname);
      }
      if (hasDataDomain(activeDomains, DATA_DOMAINS.RETURNS)) {
        inventoryChannel = inventoryChannel
          .on("postgres_changes", { event: "*", schema: "public", table: "supplier_returns" }, refreshReturns)
          .on("postgres_changes", { event: "*", schema: "public", table: "supplier_return_items" }, refreshReturns)
          .on("postgres_changes", { event: "*", schema: "public", table: "customer_returns" }, refreshReturns)
          .on("postgres_changes", { event: "*", schema: "public", table: "customer_return_items" }, refreshReturns);
      }
      if (hasDataDomain(activeDomains, DATA_DOMAINS.PRODUCT_ACTIVITY)) {
        inventoryChannel = inventoryChannel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "product_activity_logs" },
          refreshProductActivity
        );
      }
      if (hasDataDomain(activeDomains, DATA_DOMAINS.SERVICE_PRODUCTS) && serviceProductRealtimeTable) {
        inventoryChannel = inventoryChannel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: serviceProductRealtimeTable },
          refreshServiceProducts
        );
      }
      addChannel("inventory-sync", inventoryChannel);
    }

    const hasSalesChannel = [
      DATA_DOMAINS.ACCESSORY_SALES,
      DATA_DOMAINS.DIGITAL_SALES,
      DATA_DOMAINS.LOGISTICS_SALES,
      DATA_DOMAINS.CASH,
    ].some((domain) => hasDataDomain(activeDomains, domain));

    if (hasSalesChannel) {
      let salesChannel = supabase.channel(`sales-sync:${scopeSuffix}`);

      if (hasDataDomain(activeDomains, DATA_DOMAINS.ACCESSORY_SALES)) {
        salesChannel = salesChannel
          .on("postgres_changes", { event: "*", schema: "public", table: "transaksi" }, refreshAccessories)
          .on("postgres_changes", { event: "*", schema: "public", table: "item_transaksi" }, refreshAccessories);
      }
      if (hasDataDomain(activeDomains, DATA_DOMAINS.DIGITAL_SALES)) {
        salesChannel = salesChannel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "transaksi_digital" },
          refreshDigital
        );
      }
      if (hasDataDomain(activeDomains, DATA_DOMAINS.LOGISTICS_SALES)) {
        salesChannel = salesChannel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "transaksi_logistik" },
          refreshLogistics
        );
      }
      if (hasDataDomain(activeDomains, DATA_DOMAINS.CASH)) {
        salesChannel = salesChannel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "kas" },
          refreshCash
        );
      }
      addChannel("sales-sync", salesChannel);
    }

    if (hasDataDomain(activeDomains, DATA_DOMAINS.WALLET)) {
      const walletChannel = supabase
        .channel(`wallet-sync:${scopeSuffix}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "transaksi_dompet" }, refreshWallet);
      addChannel("wallet-sync", walletChannel);
    }

    let shiftChannel = supabase
      .channel(`shift-sync:${scopeSuffix}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, refreshShifts)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings" },
        refreshSettings
      );

    if (hasDataDomain(activeDomains, DATA_DOMAINS.EMPLOYEES)) {
      shiftChannel = shiftChannel
        .on("postgres_changes", { event: "*", schema: "public", table: "users" }, refreshShifts)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "employee_payrolls" },
          () => queueRefresh("employee_payrolls", refreshEmployeePayrollData)
        );
    }
    addChannel("shift-sync", shiftChannel);

    return () => {
      realtimeQueue.dispose();
      realtimeRefreshGuardRef.current.reset();
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [
    refreshAccessoryTransactionData,
    refreshCashData,
    refreshDigitalTransactionData,
    refreshEmployeePayrollData,
    refreshInventoryData,
    refreshLogisticsTransactionData,
    refreshProductActivityLogData,
    refreshProductData,
    refreshReturnData,
    runRealtimeRefresh,
    refreshServiceProductState,
    refreshShiftData,
    refreshAppSettings,
    refreshStockOpnameData,
    minimalDataMode,
    refreshWalletData,
    realtimeEnabled,
    serviceProductRealtimeTable,
    activeDomains,
    activePath,
    user,
  ]);

// Request permission notification
  useEffect(() => {
    if (minimalDataMode) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [minimalDataMode]);

  // Limit notifikasi stok rendah saat route inventory melakukan refresh berulang.
  const lowStockNotifCooldownMs = 60_000;
  const lastLowStockNotifAtRef = useRef(0);

  useEffect(() => {
    if (minimalDataMode) return;
    if (!user) return;
    if (coreLoading) return;
    if (!hasCompletedInitialLoadRef.current) return;

    const now = Date.now();
    if (now - (lastLowStockNotifAtRef.current || 0) < lowStockNotifCooldownMs) return;

    // Side-effect only, tidak mengubah state.
    checkLowStockNotifications();
    lastLowStockNotifAtRef.current = now;
  }, [
    checkLowStockNotifications,
    coreLoading,
    minimalDataMode,
    user,
  ]);

  const productCatalog = useMemo(
    () => [...products, ...deletedProducts],
    [deletedProducts, products]
  );

  const categories = useMemo(
    () => [...new Set(products.map((item) => item.kategori).filter(Boolean))],
    [products]
  );

  const categoryGroups = useMemo(
    () => productCategoryGroups.map((group) => ({
      ...group,
      categories: group.categories.filter((name) => name && name.trim()),
    })),
    []
  );

  const walletBalances = useMemo(
    () => buildWalletCards(walletTransactions),
    [walletTransactions]
  );

  const globalPinSettingEnabled =
    appSettings.pin_required_enabled?.value?.enabled !== false;
  const securityControls = useMemo(
    () => normalizeSecurityControls(appSettings.security_controls?.value, globalPinSettingEnabled),
    [appSettings.security_controls?.value, globalPinSettingEnabled]
  );
  const pinRequiredEnabled =
    globalPinSettingEnabled && Object.values(securityControls).some((control) => control.enabled);

  const setPinRequiredEnabled = useCallback(
    async (enabled) => {
      if (user?.role !== "pemilik") {
        throw new Error("Hanya pemilik yang dapat mengubah pengaturan PIN.");
      }

      const { data, error } = await supabase.rpc("owner_set_pin_required_enabled", {
        p_enabled: Boolean(enabled),
      });

      if (error) {
        throw new Error(toClientMessage(error.message, "Gagal mengubah pengaturan PIN."));
      }

      setAppSettings((current) => ({
        ...current,
        pin_required_enabled: {
          key: "pin_required_enabled",
          value: data || { enabled: Boolean(enabled) },
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
      }));

      return data;
    },
    [user]
  );

  const setSecurityControls = useCallback(
    async (controls) => {
      if (user?.role !== "pemilik") {
        throw new Error("Hanya pemilik yang dapat mengubah kontrol keamanan.");
      }

      const nextControls = normalizeSecurityControls(controls, true);
      const { data, error } = await supabase.rpc("owner_set_security_controls", {
        p_controls: nextControls,
      });

      if (error) {
        throw new Error(toClientMessage(error.message, "Gagal mengubah kontrol keamanan."));
      }

      setAppSettings((current) => ({
        ...current,
        security_controls: {
          key: "security_controls",
          value: data || nextControls,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
      }));

      return data || nextControls;
    },
    [user]
  );

  const cashierUsers = useMemo(() => {
    const rows = staffUsers.filter((item) => item.role === "kasir");

    if (user?.role === "kasir" && !rows.some((item) => item.id === user.id)) {
      return [
        ...rows,
        {
          id: user.id,
          nama: user.nama,
          role: user.role,
          cashier_station: user.cashier_station || "",
          station_name: user.station_name || user.cashier_station || "",
        },
      ];
    }

    return rows;
  }, [staffUsers, user]);

  const shifts = useMemo(() => {
    const nameMap = new Map(staffUsers.map((item) => [item.id, item.nama]));
    const userMap = new Map(staffUsers.map((item) => [item.id, item]));

    return shiftRecords
      .map((shift) => {
        const staffUser = userMap.get(shift.cashier_id);
        const cashierStation = normalizeCashierStation(
          shift.cashier_station || staffUser?.cashier_station || staffUser?.station_name
        );
        const metrics = calculateShiftMetrics({
          shiftId: shift.id,
          accessoryTransactions,
          digitalTransactions,
          logisticsTransactions,
        });
        const totalTransactions =
          metrics.total_transactions > 0 ? metrics.total_transactions : shift.total_transactions;
        const totalItems = metrics.total_items > 0 ? metrics.total_items : shift.total_items;
        const totalCash = metrics.total_cash > 0 ? metrics.total_cash : shift.total_cash;
        const totalDigital = metrics.total_digital > 0 ? metrics.total_digital : shift.total_digital;
        const digitalBreakdown =
          metrics.total_digital > 0 || Object.keys(metrics.digital_breakdown || {}).length
            ? metrics.digital_breakdown
            : shift.digital_breakdown;
        const expectedCash = totalCash;
        const difference =
          shift.actual_cash === null || shift.actual_cash === undefined
            ? null
            : shift.actual_cash - expectedCash;

        return {
          ...shift,
          total_transactions: totalTransactions,
          total_items: totalItems,
          total_cash: totalCash,
          total_digital: totalDigital,
          digital_breakdown: digitalBreakdown || {},
          expected_cash: expectedCash,
          difference,
          employee_id: shift.employee_id || shift.cashier_id,
          employee_name: shift.employee_name || nameMap.get(shift.cashier_id) || formatCashierName(shift.cashier_id),
          cashier_station: cashierStation,
          station_name: shift.station_name || cashierStation,
          shift_type: normalizeShiftType(shift.shift_type),
          cashier_name: nameMap.get(shift.cashier_id) || formatCashierName(shift.cashier_id),
          approved_by_name: shift.approved_by ? nameMap.get(shift.approved_by) || null : null,
          closed_by_name: shift.closed_by ? nameMap.get(shift.closed_by) || null : null,
        };
      })
      .sort((left, right) => new Date(right.start_time) - new Date(left.start_time));
  }, [
    accessoryTransactions,
    digitalTransactions,
    logisticsTransactions,
    shiftRecords,
    staffUsers,
  ]);

  const activeShifts = useMemo(
    () =>
      shifts.filter(
        (shift) => shift.status === "active" && !isShiftExpiredByAutoClose(shift)
      ),
    [shifts]
  );

  useEffect(() => {
    if (!user) return;

    if (user.role === "kasir") {
      if (selectedCashierIdState !== user.id) {
        setSelectedCashierId(user.id);
      }
      return;
    }

    const hasSelectedCashier = cashierUsers.some((item) => item.id === selectedCashierIdState);
    if (hasSelectedCashier) {
      return;
    }

    const fallbackCashierId = activeShifts[0]?.cashier_id || cashierUsers[0]?.id || "";
    if (fallbackCashierId && fallbackCashierId !== selectedCashierIdState) {
      setSelectedCashierId(fallbackCashierId);
    }
  }, [activeShifts, cashierUsers, selectedCashierIdState, setSelectedCashierId, user]);

  const selectedCashier = useMemo(() => {
    if (user?.role === "kasir") {
      return {
        id: user.id,
        nama: user.nama,
        role: user.role,
      };
    }

    return cashierUsers.find((item) => item.id === selectedCashierIdState) || cashierUsers[0] || null;
  }, [cashierUsers, selectedCashierIdState, user]);

  const operatingCashierId = selectedCashier?.id || (user?.role === "kasir" ? user.id : "");

  const getActiveShiftForCashier = useCallback(
    (cashierId) => {
      const targetCashierId = cashierId || operatingCashierId;
      return targetCashierId ? findActiveShift(shifts, targetCashierId) : null;
    },
    [operatingCashierId, shifts]
  );

  const realShift = useMemo(
    () => getActiveShiftForCashier(operatingCashierId),
    [getActiveShiftForCashier, operatingCashierId]
  );
  const currentShift = useMemo(
    () => isDemo && demoShift ? demoShift : realShift,
    [isDemo, demoShift, realShift]
  );

  const resolveTransactionShiftContext = useCallback(() => {
    if (!user) {
      throw new Error("User belum login.");
    }

    const cashierId = user.role === "pemilik" ? operatingCashierId : user.id;
    if (!cashierId) {
      throw new Error("Pilih kasir yang sedang bertugas terlebih dahulu.");
    }

    const shift = getActiveShiftForCashier(cashierId);
    if (!shift) {
      throw new Error("Mulai shift dulu sebelum menyimpan transaksi.");
    }

    return { shift, cashierId };
  }, [getActiveShiftForCashier, operatingCashierId, user]);

  const startShift = useCallback(
    async ({ cashierId, cashierStation, shiftType } = {}) => {
      if (!user) {
        throw new Error("User belum login.");
      }

      const targetCashierId =
        user.role === "pemilik" ? cashierId || operatingCashierId || cashierUsers[0]?.id : user.id;
      const targetCashier = cashierUsers.find((cashier) => cashier.id === targetCashierId);
      const targetCashierStation = normalizeCashierStation(
        cashierStation || targetCashier?.cashier_station || targetCashier?.station_name
      );
      const targetShiftType = normalizeShiftType(shiftType);

      if (!targetCashierId) {
        throw new Error("Pilih kasir yang akan memulai shift.");
      }

      if (!targetCashierStation) {
        throw new Error("Pos kasir wajib dipilih sebelum shift dibuka.");
      }

      if (!canOpenShift(user.role)) {
        throw new Error("Kasir hanya bisa membuka shift setelah jam 07:00");
      }

      if (getActiveShiftForCashier(targetCashierId)) {
        throw new Error("Masih ada shift aktif untuk kasir ini.");
      }

      const activeStationShift = activeShifts.find(
        (shift) => normalizeCashierStation(shift.cashier_station) === targetCashierStation
      );
      if (activeStationShift) {
        throw new Error(`${targetCashierStation} masih digunakan oleh shift aktif.`);
      }

      const cashierName = targetCashier?.nama || formatCashierName(targetCashierId);

      const nextShift = normalizeShiftRecord({
        id: crypto.randomUUID(),
        cashier_id: targetCashierId,
        employee_id: targetCashierId,
        employee_name: cashierName,
        cashier_station: targetCashierStation,
        station_code: targetCashierStation.toLowerCase().replace(/\s+/g, "_"),
        station_name: targetCashierStation,
        shift_type: targetShiftType,
        start_time: new Date().toISOString(),
        end_time: null,
        opening_cash: 0,
        total_cash: 0,
        total_digital: 0,
        digital_breakdown: {},
        total_transactions: 0,
        total_items: 0,
        actual_cash: null,
        expected_cash: 0,
        difference: null,
        notes: "",
        approval_notes: "",
        status: "active",
        approved_by: null,
        approved_at: null,
        correction_difference: 0,
        correction_type: "",
        closed_by: null,
        created_at: new Date().toISOString(),
      });

      const { data } = await withRetry(async () => {
        const result = await supabase
          .from("shifts")
          .insert({
            cashier_id: nextShift.cashier_id,
            employee_id: nextShift.employee_id,
            employee_name: nextShift.employee_name,
            cashier_station: nextShift.cashier_station,
            station_code: nextShift.station_code,
            station_name: nextShift.station_name,
            shift_type: nextShift.shift_type,
            start_time: nextShift.start_time,
            opening_cash: 0,
            status: "active",
          })
          .select(SHIFT_SELECT)
          .single();

        if (result.error?.code === "42P01") {
          throw new Error("Shift belum siap dipakai. Minta pemilik toko mengecek pengaturan aplikasi.");
        }
        if (isMissingColumnError(result.error, ["cashier_station", "shift_type", "employee_id", "employee_name"])) {
          throw new Error("Schema multi-kasir belum aktif. Jalankan migration cashier station sebelum membuka shift.");
        }
        if (result.error?.code === "23505") {
          throw new Error(`${targetCashierStation} masih digunakan oleh shift aktif.`);
        }
        if (result.error) throw result.error;
        return result;
      });

      if (user.role === "pemilik") {
        setSelectedCashierId(targetCashierId);
      }

      const savedShift = normalizeShiftRecord(data || nextShift);
      let whatsapp_notification = null;
      try {
        whatsapp_notification = await postShiftWhatsappNotification("opening", {
          shiftId: savedShift.id,
          kasir: cashierName,
          station: targetCashierStation,
          shiftType: targetShiftType,
          timestamp: savedShift.start_time,
          requestedByRole: user.role,
          ownerOverride: user.role === "pemilik",
        });
      } catch (error) {
        whatsapp_notification = {
          ok: false,
          error: error.message || "Notifikasi WhatsApp opening gagal dikirim.",
        };
      }

      await loadData();
      return {
        ...savedShift,
        cashier_name: cashierName,
        whatsapp_notification,
      };
    },
    [
      activeShifts,
      cashierUsers,
      getActiveShiftForCashier,
      loadData,
      operatingCashierId,
      setSelectedCashierId,
      user,
    ]
  );

  const requireEmployeePermission = useCallback(
    async (permissionKey) => {
      if (!user) {
        throw new Error("User belum login.");
      }

      if (user.role === "pemilik") {
        return true;
      }

      const { data, error } = await supabase.rpc("current_user_has_employee_permission", {
        p_permission_key: permissionKey,
      });

      if (error) {
        throw new Error(toClientMessage(error.message, "Validasi akses karyawan gagal."));
      }

      if (!data) {
        throw new Error("Akses karyawan tidak diizinkan untuk aksi ini.");
      }

      return true;
    },
    [user]
  );

  const closeShift = useCallback(
    async ({ shiftId, cashierId, actual_cash, notes, pin }) => {
      if (!user) {
        throw new Error("User belum login.");
      }

      const targetShift =
        shifts.find((shift) => shift.id === shiftId) ||
        getActiveShiftForCashier(cashierId || operatingCashierId || user.id);

      if (!targetShift || targetShift.status !== "active") {
        throw new Error("Tidak ada shift aktif untuk ditutup.");
      }

      if (user.role === "kasir" && targetShift.cashier_id !== user.id) {
        throw new Error("Kasir hanya bisa menutup shift miliknya sendiri.");
      }

      if (!canCloseShift(user.role)) {
        throw new Error("Kasir hanya bisa closing setelah jam 20:00");
      }

      if (user.role !== "pemilik") {
        await requireEmployeePermission(EMPLOYEE_PERMISSIONS.SHIFT_CLOSE);
      }

      const actualCash = Number(actual_cash);
      if (!Number.isFinite(actualCash) || actualCash < 0) {
        throw new Error("Actual cash harus diisi dengan angka 0 atau lebih.");
      }

      if (user.role === "kasir" && pinRequiredEnabled) {
        await verifyPin(pin);
      }

      const data = await callAtomicRpc("close_shift_atomic", {
        p_shift_id: targetShift.id,
        p_actual_cash: actualCash,
        p_notes: String(notes || "").trim(),
        p_pin: pin || null,
      });

      const savedShift = normalizeShiftRecord(data || targetShift);
      const closingSummary = data?.closing_summary || {
        total_trx: savedShift.total_transactions,
        omzet: savedShift.total_cash + savedShift.total_digital,
        modal: 0,
        profit: 0,
        cash: savedShift.total_cash,
        qris: Number(savedShift.digital_breakdown?.qris || 0),
        transfer:
          Number(savedShift.digital_breakdown?.transfer || 0) +
          Number(savedShift.digital_breakdown?.transfer_bank || 0) +
          Number(savedShift.digital_breakdown?.bca || 0) +
          Number(savedShift.digital_breakdown?.bank_mas || 0),
        ewallet: Math.max(
          0,
          savedShift.total_digital -
            Number(savedShift.digital_breakdown?.qris || 0) -
            Number(savedShift.digital_breakdown?.transfer || 0) -
            Number(savedShift.digital_breakdown?.transfer_bank || 0) -
            Number(savedShift.digital_breakdown?.bca || 0) -
            Number(savedShift.digital_breakdown?.bank_mas || 0)
        ),
      };
      let whatsapp_notification = null;
      try {
        whatsapp_notification = await postShiftWhatsappNotification("closing", {
          shiftId: targetShift.id,
          kasir: targetShift.cashier_name || formatCashierName(targetShift.cashier_id),
          station: targetShift.cashier_station,
          shiftType: targetShift.shift_type,
          openedAt: targetShift.start_time,
          timestamp: savedShift.end_time,
          requestedByRole: user.role,
          ownerOverride: user.role === "pemilik",
          ...closingSummary,
        });
      } catch (error) {
        whatsapp_notification = {
          ok: false,
          error: error.message || "Notifikasi WhatsApp closing gagal dikirim.",
        };
      }

      await loadData();
      return {
        ...savedShift,
        whatsapp_notification,
      };
    },
    [
      getActiveShiftForCashier,
      loadData,
      operatingCashierId,
      pinRequiredEnabled,
      requireEmployeePermission,
      shifts,
      user,
      verifyPin,
    ]
  );

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) throw error;
    if (!session?.access_token) {
      throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");
    }

    return session.access_token;
  }, []);

  const createEmployee = useCallback(
    async (payload) => {
      if (user?.role !== "pemilik") {
        throw new Error("Hanya pemilik yang dapat membuat karyawan.");
      }

      const token = await getAccessToken();
      const response = await fetch("/api/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.ok === false) {
        throw new Error(result.error || "Gagal membuat karyawan.");
      }

      await Promise.all([refreshShiftData(), refreshEmployeePayrollData()]);
      return normalizeStaffUser(result.employee);
    },
    [getAccessToken, refreshEmployeePayrollData, refreshShiftData, user?.role]
  );

  const updateEmployeeProfile = useCallback(
    async (employeeId, payload) => {
      if (user?.role !== "pemilik") {
        throw new Error("Hanya pemilik yang dapat mengubah karyawan.");
      }

      let { data, error } = await supabase.rpc("owner_update_employee_profile", {
        p_user_id: employeeId,
        p_nama: payload.name || payload.nama,
        p_username: payload.username,
        p_phone: payload.phone || "",
        p_role: payload.role || "kasir",
        p_cashier_station: normalizeCashierStation(payload.cashierStation || payload.cashier_station),
        p_base_salary: Number(payload.baseSalary ?? payload.base_salary ?? 0),
        p_default_bonus: Number(payload.defaultBonus ?? payload.default_bonus ?? 0),
        p_default_deduction: Number(payload.defaultDeduction ?? payload.default_deduction ?? 0),
      });

      if (
        error &&
        getSupabaseErrorText(error).includes("p_cashier_station")
      ) {
        const fallback = await supabase.rpc("owner_update_employee_profile", {
          p_user_id: employeeId,
          p_nama: payload.name || payload.nama,
          p_username: payload.username,
          p_phone: payload.phone || "",
          p_role: payload.role || "kasir",
          p_base_salary: Number(payload.baseSalary ?? payload.base_salary ?? 0),
          p_default_bonus: Number(payload.defaultBonus ?? payload.default_bonus ?? 0),
          p_default_deduction: Number(payload.defaultDeduction ?? payload.default_deduction ?? 0),
        });
        data = fallback.data;
        error = fallback.error;
      }

      if (error) throw new Error(toClientMessage(error.message, "Gagal mengubah karyawan."));
      await Promise.all([refreshShiftData(), refreshEmployeePayrollData()]);
      return normalizeStaffUser(data);
    },
    [refreshEmployeePayrollData, refreshShiftData, user?.role]
  );

  const setEmployeeStatus = useCallback(
    async (employeeId, status, reason = "") => {
      if (user?.role !== "pemilik") {
        throw new Error("Hanya pemilik yang dapat mengubah status karyawan.");
      }

      const { data, error } = await supabase.rpc("owner_set_employee_status", {
        p_user_id: employeeId,
        p_status: status,
        p_reason: reason,
      });

      if (error) throw new Error(toClientMessage(error.message, "Gagal mengubah status karyawan."));
      await Promise.all([refreshShiftData(), refreshEmployeePayrollData()]);
      return normalizeStaffUser(data);
    },
    [refreshEmployeePayrollData, refreshShiftData, user?.role]
  );

  const resetEmployeePin = useCallback(
    async (employeeId, newPin) => {
      if (user?.role !== "pemilik") {
        throw new Error("Hanya pemilik yang dapat reset PIN karyawan.");
      }

      const { error } = await supabase.rpc("owner_reset_employee_pin", {
        p_user_id: employeeId,
        p_new_pin: newPin,
      });

      if (error) throw new Error(toClientMessage(error.message, "Gagal reset PIN karyawan."));
      await refreshShiftData();
      return true;
    },
    [refreshShiftData, user?.role]
  );

  const saveEmployeePayroll = useCallback(
    async (employeeId, payload) => {
      if (user?.role !== "pemilik") {
        throw new Error("Hanya pemilik yang dapat mengelola payroll.");
      }

      const { data, error } = await supabase.rpc("owner_save_employee_payroll", {
        p_employee_id: employeeId,
        p_period_month: payload.periodMonth || payload.period_month || todayDate,
        p_base_salary: Number(payload.baseSalary ?? payload.base_salary ?? 0),
        p_bonus: Number(payload.bonus || 0),
        p_deduction: Number(payload.deduction || 0),
        p_status: payload.status || "waiting",
        p_notes: payload.notes || "",
      });

      if (error) throw new Error(toClientMessage(error.message, "Gagal menyimpan payroll."));
      await refreshEmployeePayrollData();
      return normalizeEmployeePayroll(data);
    },
    [refreshEmployeePayrollData, user?.role]
  );

  const saveEmployeePermissions = useCallback(
    async (employeeId, permissions, reason = "") => {
      if (user?.role !== "pemilik") {
        throw new Error("Hanya pemilik yang dapat mengubah akses karyawan.");
      }

      const { data, error } = await supabase.rpc("owner_set_employee_permissions", {
        p_employee_id: employeeId,
        p_permissions: permissions || {},
        p_reason: reason || "",
      });

      if (error) throw new Error(toClientMessage(error.message, "Gagal menyimpan akses karyawan."));
      return data || true;
    },
    [user?.role]
  );

  const saveEmployeeNote = useCallback(
    async (employeeId, noteType, note) => {
      if (user?.role !== "pemilik") {
        throw new Error("Hanya pemilik yang dapat menulis catatan karyawan.");
      }

      const { data, error } = await supabase.rpc("owner_save_employee_note", {
        p_employee_id: employeeId,
        p_note_type: noteType || "note",
        p_note: note || "",
      });

      if (error) throw new Error(toClientMessage(error.message, "Gagal menyimpan catatan karyawan."));
      return data;
    },
    [user?.role]
  );

  const revokeEmployeeSession = useCallback(
    async (sessionId, reason = "") => {
      if (user?.role !== "pemilik") {
        throw new Error("Hanya pemilik yang dapat memutus sesi karyawan.");
      }

      const { data, error } = await supabase.rpc("owner_revoke_employee_session", {
        p_session_id: sessionId,
        p_reason: reason || "Diputus dari manajemen karyawan.",
      });

      if (error) throw new Error(toClientMessage(error.message, "Gagal memutus sesi karyawan."));
      return data;
    },
    [user?.role]
  );

  const createAuditLog = useCallback(
    async ({
      action,
      targetTable,
      targetId,
      beforeValue = {},
      afterValue = {},
      reason = "",
      deviceInfo = {},
      incidentCode = "",
    }) => {
      if (!user) return null;

      const payload = {
        actor_id: user.id,
        actor_role: user.role || "",
        action,
        target_table: targetTable,
        target_id: targetId || null,
        before_value: beforeValue || {},
        after_value: afterValue || {},
        reason: String(reason || ""),
        device_info: {
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          ...deviceInfo,
        },
        session_id: typeof window !== "undefined" ? window.sessionStorage?.getItem("pos_session_id") || "" : "",
        incident_code: incidentCode || "",
      };

      const { error } = await supabase.from("audit_logs").insert(payload);
      if (error && !isMissingRelationOrSchemaError(error, ["audit_logs"])) {
        console.warn("Audit log gagal disimpan:", error);
      }

      return payload;
    },
    [user]
  );

  const reviewShift = useCallback(
    async ({ shiftId, decision, notes }) => {
      if (user?.role !== "pemilik") {
        throw new Error("Hanya pemilik toko yang bisa memproses approval shift.");
      }

      const targetShift = shifts.find((shift) => shift.id === shiftId);
      if (!targetShift) {
        throw new Error("Shift tidak ditemukan.");
      }

      if (["approved", "approved_with_correction"].includes(targetShift.status)) {
        throw new Error("Shift ini sudah disetujui.");
      }

      if (!["pending", "flagged"].includes(targetShift.status)) {
        throw new Error("Shift ini belum siap diproses.");
      }

      const differenceAmount = Number(targetShift.difference || 0);
      const ownerNotes = String(notes || "").trim();
      const nextStatus =
        decision === "flagged"
          ? "flagged"
          : decision === "approved_with_correction"
            ? "approved_with_correction"
            : "approved";

      if (nextStatus === "approved" && differenceAmount !== 0) {
        throw new Error("Shift yang ada selisih harus ditandai dulu sebagai perlu dicek.");
      }

      if (nextStatus === "approved_with_correction") {
        if (differenceAmount === 0) {
          throw new Error("Setujui dengan koreksi hanya untuk shift yang memiliki selisih.");
        }

        if (!ownerNotes) {
          throw new Error("Catatan pemilik toko wajib diisi untuk setujui dengan koreksi.");
        }
      }

      const approvedAt = new Date().toISOString();
      const correctionType =
        nextStatus === "approved_with_correction"
          ? differenceAmount > 0
            ? "Kas Lebih"
            : "Kas Kurang"
          : "";
      const approvalPayload = {
        status: nextStatus,
        approved_by: user.id,
        approved_at: nextStatus === "flagged" ? null : approvedAt,
        approval_notes: ownerNotes,
        correction_difference:
          nextStatus === "approved_with_correction" ? differenceAmount : 0,
        correction_type: correctionType,
      };
      const financialLog =
        nextStatus === "approved_with_correction"
          ? normalizeFinancialLog({
              id: crypto.randomUUID(),
              kasir_id: targetShift.cashier_id,
              log_type: correctionType,
              direction: differenceAmount > 0 ? "in" : "out",
              amount: Math.abs(differenceAmount),
              payment_method: "cash",
              source_type: "shift_correction",
              source_id: targetShift.id,
              reference: `SHIFT-${targetShift.id}`,
              notes: ownerNotes,
              created_by: user.id,
              created_at: approvedAt,
            })
          : null;

      if (nextStatus === "approved_with_correction") {
        let savedShift;
        try {
          savedShift = await callAtomicRpc("approve_shift_with_correction_atomic", {
            p_shift_id: targetShift.id,
            p_notes: ownerNotes,
          });
        } catch (error) {
          if (isMissingShiftApprovalSchemaError(error)) {
            throw new Error(SHIFT_SCHEMA_HOTFIX_MESSAGE);
          }
          throw error;
        }
        await createAuditLog({
          action: "approve_shift_with_correction",
          targetTable: "shifts",
          targetId: targetShift.id,
          beforeValue: targetShift,
          afterValue: savedShift || approvalPayload,
          reason: ownerNotes,
        });
        await loadData();
        return normalizeShiftRecord(savedShift || { ...targetShift, ...approvalPayload });
      }

      const { data } = await withRetry(async () => {
        const result = await supabase
          .from("shifts")
          .update(approvalPayload)
          .eq("id", targetShift.id)
          .in("status", ["pending", "flagged"])
          .select(SHIFT_SELECT)
          .single();

        if (result.error?.code === "42P01") {
          throw new Error("Shift belum siap dipakai. Minta pemilik toko mengecek pengaturan aplikasi.");
        }
        if (isMissingShiftApprovalSchemaError(result.error)) {
          throw new Error(SHIFT_SCHEMA_HOTFIX_MESSAGE);
        }
        if (result.error) throw result.error;
        return result;
      });

      if (financialLog) {
        const { error } = await supabase.from("financial_logs").insert(financialLog);
        if (error && !isOptionalResetTableError(error)) {
          throw error;
        }
      }

      await createAuditLog({
        action: nextStatus === "flagged" ? "flag_shift_for_review" : "approve_shift",
        targetTable: "shifts",
        targetId: targetShift.id,
        beforeValue: targetShift,
        afterValue: data || approvalPayload,
        reason: ownerNotes,
      });
      await loadData();
      return normalizeShiftRecord(data || { ...targetShift, ...approvalPayload });
    },
    [
      createAuditLog,
      loadData,
      shifts,
      user,
    ]
  );

  const createAccessoryTransaction = useCallback(
    async ({ items, metodeBayar, uangDiterima, catatan, payments = [] }) => {
      const { shift, cashierId } = resolveTransactionShiftContext();
      const requestIntent = {
        shiftId: shift.id,
        cashierId,
        items,
        metodeBayar,
        uangDiterima,
        catatan: catatan || "",
        payments,
      };
      const transactionId = reserveMoneyRequestId("accessory_sale", requestIntent);
      const todayCount = accessoryTransactions.filter(
        (trx) => formatDateKey(trx.created_at) === formatDateKey(new Date())
      ).length;
      const totalBayar = items.reduce((sum, item) => sum + item.subtotal, 0);
      const normalizedPaymentMethod = normalizePaymentMethodId(metodeBayar);
      const normalizedPayments =
        Array.isArray(payments) && payments.length
          ? payments
              .map((payment) => ({
                method: normalizePaymentMethodId(payment.method),
                amount: Number(payment.amount || 0),
              }))
              .filter((payment) => payment.amount > 0)
          : [{ method: normalizedPaymentMethod, amount: totalBayar }];
      // Customer wallet payments are recorded as wallet inflows after the sale is saved.

      const finalUangDiterima =
        normalizedPaymentMethod === "cash" || normalizedPaymentMethod === "split"
          ? uangDiterima
          : totalBayar;
      const transaction = {
        id: transactionId,
        kasir_id: cashierId,
        shift_id: shift.id,
        no_transaksi: generateTransactionNumber("TRX", todayCount + 1),
        total_bayar: totalBayar,
        uang_diterima: finalUangDiterima,
        kembalian: normalizedPaymentMethod === "cash" ? finalUangDiterima - totalBayar : 0,
        metode_bayar: normalizedPaymentMethod,
        payments: normalizedPayments,
        catatan: catatan || "",
        created_at: new Date().toISOString(),
        items: items.map((item) => ({
          id: crypto.randomUUID(),
          transaksi_id: transactionId,
          produk_id: item.id,
          nama_produk: item.nama,
          category: item.kategori || item.category || "",
          provider: item.provider || "",
          qty: item.qty,
          harga_satuan: item.harga_jual,
          subtotal: item.subtotal,
          selling_price: item.subtotal,
          cost: Number(item.harga_beli || 0) * Number(item.qty || 0),
          profit: Number(item.subtotal || 0) - Number(item.harga_beli || 0) * Number(item.qty || 0),
        })),
      };

      let savedTransaction = null;
      try {
        savedTransaction = await callAtomicRpc("create_accessory_transaction_atomic", {
          p_transaction: {
            id: transaction.id,
            request_id: transactionId,
            kasir_id: transaction.kasir_id,
            shift_id: transaction.shift_id,
            no_transaksi: transaction.no_transaksi,
            total_bayar: transaction.total_bayar,
            uang_diterima: transaction.uang_diterima,
            kembalian: transaction.kembalian,
            metode_bayar: transaction.metode_bayar,
            payments: transaction.payments,
            catatan: transaction.catatan,
            created_at: transaction.created_at,
          },
          p_items: transaction.items,
        });
      } catch (error) {
        if (String(error?.code || "") === "P0001") {
          await loadData();
        }
        throw error;
      }

      await loadData();
      const savedResult = normalizeAccessoryTransaction(savedTransaction || transaction);
      completeMoneyRequest("accessory_sale", requestIntent, transactionId);
      return savedResult;
    },
    [
      accessoryTransactions,
      completeMoneyRequest,
      loadData,
      reserveMoneyRequestId,
      resolveTransactionShiftContext,
    ]
  );

  const createDigitalTransaction = useCallback(
    async (payload) => {
      const { shift, cashierId } = resolveTransactionShiftContext();
      const requestIntent = {
        shiftId: shift.id,
        cashierId,
        payload: {
          ...payload,
          transaction_items: Array.isArray(payload.transaction_items)
            ? payload.transaction_items.map(({ id: _ignoredLocalId, ...item }) => item)
            : payload.transaction_items,
        },
      };
      const requestId = reserveMoneyRequestId("digital_sale", requestIntent);
      const todayCount = digitalTransactions.filter(
        (trx) => formatDateKey(trx.created_at) === formatDateKey(new Date())
      ).length;
      const payloadCategory = normalizeServiceCategory(payload.category || payload.jenis);
      const platformSumber =
        payload.platform_sumber ||
        (pasarKuotaServiceCategorySet.has(payloadCategory) ? "pasar_kuota" : null);
      const transaction = normalizeDigitalTransaction({
        id: requestId,
        kasir_id: cashierId,
        shift_id: shift.id,
        no_transaksi: generateTransactionNumber("LYN", todayCount + 1),
        ...payload,
        platform_sumber: platformSumber,
        created_at: new Date().toISOString(),
      });
      const walletDeduction = getDigitalServiceWalletDeduction(transaction);

      if (walletDeduction) {
        const walletLabel =
          walletPlatformLabelMap[walletDeduction.platform] || walletDeduction.platform;

        if (!Number.isFinite(walletDeduction.amount) || walletDeduction.amount <= 0) {
          throw new Error(
            `Modal layanan wajib lebih besar dari 0 agar saldo ${walletLabel} dapat dipotong.`
          );
        }

        validateWalletBalance(walletDeduction.platform, walletDeduction.amount, walletTransactions, {
          insufficientMessage: `Saldo ${walletLabel} tidak mencukupi.`,
          zeroMessage: `Saldo ${walletLabel} 0. Isi saldo dulu sebelum transaksi layanan.`,
        });
      }

      const savedTransaction = await callAtomicRpc("create_digital_transaction_atomic", {
        p_transaction: { ...transaction, request_id: requestId },
      });
      await loadData();
      const savedResult = normalizeDigitalTransaction(savedTransaction || transaction);
      completeMoneyRequest("digital_sale", requestIntent, requestId);
      return savedResult;
    },
    [
      completeMoneyRequest,
      digitalTransactions,
      loadData,
      reserveMoneyRequestId,
      resolveTransactionShiftContext,
      walletTransactions,
    ]
  );

  const createWalletTransaction = useCallback(
    async (payload) => {
      if (user?.role !== "pemilik") {
        await requireEmployeePermission(EMPLOYEE_PERMISSIONS.FINANCE_CASH_WALLET);
      }

      const requestIntent = { actorId: user?.id || null, payload };
      const requestId = reserveMoneyRequestId("wallet_mutation", requestIntent);
      const transaction = normalizeWalletTransaction({
        id: requestId,
        kasir_id: user?.id || null,
        ...payload,
        created_at: new Date().toISOString(),
      });
      const nominal = Number(transaction.nominal || 0);
      const biayaAdmin = Number(transaction.biaya_admin || 0);

      if (!Number.isFinite(nominal) || nominal <= 0) {
        throw new Error("Nominal mutasi harus lebih besar dari 0.");
      }

      if (biayaAdmin < 0) {
        throw new Error("Biaya admin tidak boleh negatif.");
      }

      if (transaction.jenis === "masuk" && biayaAdmin > nominal) {
        throw new Error("Biaya admin tidak boleh lebih besar dari nominal masuk.");
      }

      if (transaction.jenis === "transfer_antar") {
        if (!transaction.platform_tujuan) {
          throw new Error("Pilih tujuan transfer wallet.");
        }
        if (transaction.platform === transaction.platform_tujuan) {
          throw new Error("Wallet asal dan tujuan tidak boleh sama.");
        }
      }

      if (transaction.jenis === "keluar" || transaction.jenis === "transfer_antar") {
        validateWalletBalance(transaction.platform, getWalletImpactAmount(transaction), walletTransactions);
      }

      const savedTransaction = await callAtomicRpc("create_wallet_transaction_atomic", {
        p_transaction: { ...transaction, request_id: requestId },
      });
      if (nominal >= 500000) {
        recordOperationalEventSoon({
          eventType: "wallet_adjustment_large",
          severity: "warning",
          source: "wallet",
          sourceId: savedTransaction?.id || transaction.id || null,
          details: {
            platform: transaction.platform,
            jenis: transaction.jenis,
            nominal,
            biaya_admin: biayaAdmin,
          },
        });
      }
      await loadData();
      const savedResult = normalizeWalletTransaction(savedTransaction || transaction);
      completeMoneyRequest("wallet_mutation", requestIntent, requestId);
      return savedResult;
    },
    [
      completeMoneyRequest,
      loadData,
      requireEmployeePermission,
      reserveMoneyRequestId,
      user?.id,
      user?.role,
      walletTransactions,
    ]
  );

  const createLogisticsTransaction = useCallback(
    async (payload) => {
      const { shift, cashierId } = resolveTransactionShiftContext();
      const requestIntent = { shiftId: shift.id, cashierId, payload };
      const requestId = reserveMoneyRequestId("logistics_sale", requestIntent);
      const todayCount = logisticsTransactions.filter(
        (trx) => formatDateKey(trx.created_at) === formatDateKey(new Date())
      ).length;
      const transaction = normalizeLogisticsTransaction({
        id: requestId,
        kasir_id: cashierId,
        shift_id: shift.id,
        no_transaksi: generateTransactionNumber("LOG", todayCount + 1),
        ...payload,
        created_at: new Date().toISOString(),
      });
      const transactionAmount = Number(transaction.price || transaction.harga_jual || 0);
      const paymentMethod = transaction.paymentMethod || transaction.payment_method;

      if (!transaction.receiver.trim()) {
        throw new Error("Nama penerima wajib diisi.");
      }

      if (!transaction.destination.trim()) {
        throw new Error("Tujuan wajib diisi.");
      }

      if (transaction.weight <= 0) {
        throw new Error("Berat paket harus lebih besar dari 0.");
      }

      if (transactionAmount <= 0) {
        throw new Error("Ongkir harus lebih besar dari 0.");
      }

      if (!paymentMethod) {
        throw new Error("Pilih metode pembayaran.");
      }

      const insertPayload = {
        id: transaction.id,
        request_id: requestId,
        kasir_id: transaction.kasir_id,
        shift_id: transaction.shift_id,
        no_transaksi: transaction.no_transaksi,
        ekspedisi: transaction.ekspedisi,
        harga_jual: transaction.harga_jual,
        modal: transaction.modal,
        no_resi: transaction.no_resi,
        catatan: transaction.catatan,
        created_at: transaction.created_at,
        type: transaction.type,
        sender_name: transaction.sender,
        receiver_name: transaction.receiver,
        destination: transaction.destination,
        package_type: transaction.packageType,
        weight: transaction.weight,
        price: transaction.price,
        payment_method: transaction.paymentMethod,
      };
      const savedTransaction = await callAtomicRpc("create_logistics_transaction_atomic", {
        p_transaction: insertPayload,
      });
      await loadData();
      const savedResult = normalizeLogisticsTransaction(savedTransaction || transaction);
      completeMoneyRequest("logistics_sale", requestIntent, requestId);
      return savedResult;
    },
    [
      completeMoneyRequest,
      loadData,
      logisticsTransactions,
      reserveMoneyRequestId,
      resolveTransactionShiftContext,
    ]
  );

  const createCashEntry = useCallback(
    async (payload) => {
      if (user?.role !== "pemilik") {
        await requireEmployeePermission(EMPLOYEE_PERMISSIONS.FINANCE_CASH_WALLET);
      }

      const requestIntent = { actorId: user?.id || null, payload };
      const requestId = reserveMoneyRequestId("cash_entry", requestIntent);
      const entry = normalizeCashEntry({
        id: requestId,
        kasir_id: user?.id || null,
        ...payload,
        tanggal: payload.tanggal || todayDate,
        created_at: new Date().toISOString(),
      });

      const savedEntry = await callAtomicRpc("create_cash_entry_atomic", {
        p_entry: { ...entry, request_id: requestId },
      });
      await loadData();
      const savedResult = normalizeCashEntry(savedEntry || entry);
      completeMoneyRequest("cash_entry", requestIntent, requestId);
      return savedResult;
    },
    [
      completeMoneyRequest,
      loadData,
      requireEmployeePermission,
      reserveMoneyRequestId,
      user?.id,
      user?.role,
    ]
  );

  const updateCashEntry = useCallback(
    async (id, payload) => {
      if (user?.role !== "pemilik") {
        throw new Error("Hanya pemilik toko yang dapat mengubah catatan kas.");
      }

      const nextEntry = normalizeCashEntry({ id, ...payload });

      const { error } = await supabase.from("kas").update(nextEntry).eq("id", id);
      if (error) throw error;
      await loadData();
    },
    [loadData, user?.role]
  );

  const deleteCashEntry = useCallback(
    async (id) => {
      if (user?.role !== "pemilik") {
        throw new Error("Hanya pemilik toko yang dapat menghapus catatan kas.");
      }

      const { error } = await supabase.from("kas").delete().eq("id", id);
      if (error) throw error;
      await loadData();
    },
    [loadData, user?.role]
  );

  const insertProductActivityLog = useCallback(async (activityLog) => {
    const { error } = await supabase.from("product_activity_logs").insert(activityLog);
    if (error) {
      console.warn("Product activity log skipped:", error.message || error);
    }
  }, []);

  const requireOwnerProductAccess = useCallback(() => {
    if (user?.role !== "pemilik") {
      throw new Error("Hanya pemilik toko yang dapat mengelola data produk.");
    }
  }, [user?.role]);

  const requireOwnerTransactionAccess = useCallback(() => {
    if (user?.role !== "pemilik") {
      throw new Error("Hanya pemilik toko yang dapat mengelola riwayat transaksi.");
    }
  }, [user?.role]);

  const requireOwnerStockOpnameAccess = useCallback(() => {
    if (user?.role !== "pemilik") {
      throw new Error("Stock Opname hanya bisa diakses pemilik toko.");
    }
  }, [user?.role]);

  const deleteTransactionHistory = useCallback(
    async ({ source, id, reason }) => {
      requireOwnerTransactionAccess();

      if (!source || !id) {
        throw new Error("Transaksi tidak valid.");
      }

      await callAtomicRpc("void_transaction_atomic", {
        p_source: source,
        p_id: id,
        p_reason: reason || "Void transaksi dari riwayat POS.",
      });

      await loadData();
    },
    [loadData, requireOwnerTransactionAccess]
  );

  const restoreTransactionHistory = useCallback(
    async ({ source, id }) => {
      requireOwnerTransactionAccess();

      if (!source || !id) {
        throw new Error("Transaksi tidak valid.");
      }

      throw new Error("Transaksi production yang sudah void tidak bisa direstore. Buat transaksi koreksi jika dibutuhkan.");
    },
    [requireOwnerTransactionAccess]
  );

  const permanentlyDeleteTransactionHistory = useCallback(
    async ({ source, id }) => {
      requireOwnerTransactionAccess();

      if (!source || !id) {
        throw new Error("Transaksi tidak valid.");
      }

      throw new Error("Hard delete transaksi production dimatikan. Gunakan void/reversal agar stok, wallet, dan audit tetap konsisten.");
    },
    [requireOwnerTransactionAccess]
  );

  const purgeExpiredDeletedTransactions = useCallback(async () => {
    requireOwnerTransactionAccess();

    recordOperationalEventSoon({
      eventType: "transaction_purge_blocked",
      severity: "warning",
      source: "transaction_history",
      details: { reason: "Hard delete production disabled" },
    });
    return 0;
  }, [requireOwnerTransactionAccess]);

  const createStockOpnameSession = useCallback(
    async ({ name, category } = {}) => {
      requireOwnerStockOpnameAccess();

      const selectedCategory = String(category || "semua").trim();
      const filteredProducts = products.filter((product) => {
        if (product.status === productStatuses.deleted || product.aktif === false) return false;
        return selectedCategory === "semua" ? true : product.kategori === selectedCategory;
      });

      if (!filteredProducts.length) {
        throw new Error("Tidak ada produk aktif untuk dibuatkan sesi opname.");
      }

      const createdAt = new Date().toISOString();
      const sessionId = crypto.randomUUID();
      const sessionName =
        String(name || "").trim() ||
        `Opname ${selectedCategory === "semua" ? "Semua Kategori" : selectedCategory}`;
      const sessionPayload = {
        id: sessionId,
        name: sessionName,
        category: selectedCategory === "semua" ? "Semua kategori" : selectedCategory,
        status: "draft",
        created_by: user?.id || null,
        total_products: filteredProducts.length,
        checked_products: 0,
        total_minus: 0,
        total_plus: 0,
        total_loss: 0,
        cutoff_at: createdAt,
        created_at: createdAt,
        updated_at: createdAt,
      };
      const itemPayload = filteredProducts.map((product) => ({
        id: crypto.randomUUID(),
        session_id: sessionId,
        product_id: product.id,
        product_name: product.nama,
        product_code: product.kode_produk || "",
        category: product.kategori,
        system_stock: product.stok,
        real_stock: null,
        difference: 0,
        note: "",
        cost: product.harga_beli || 0,
        created_at: createdAt,
        updated_at: createdAt,
      }));

      const sessionRes = await supabase
        .from("stock_opname_sessions")
        .insert(sessionPayload)
        .select(STOCK_OPNAME_SESSION_SELECT)
        .single();

      if (sessionRes.error) {
        throw createStockOpnameSchemaError(sessionRes.error, "Gagal membuat sesi Stock Opname.");
      }

      const itemRes = await supabase.from("stock_opname_items").insert(itemPayload);
      if (itemRes.error) {
        await supabase.from("stock_opname_sessions").delete().eq("id", sessionId);
        throw createStockOpnameSchemaError(itemRes.error, "Gagal menyiapkan item Stock Opname.");
      }

      await loadData();
      return normalizeStockOpnameSession(sessionRes.data || sessionPayload, itemPayload);
    },
    [loadData, products, requireOwnerStockOpnameAccess, user?.id]
  );

  const saveStockOpnameDraft = useCallback(
    async ({ sessionId, items }) => {
      requireOwnerStockOpnameAccess();

      const session = stockOpnameSessions.find((entry) => entry.id === sessionId);
      if (!session) {
        throw new Error("Sesi Stock Opname tidak ditemukan.");
      }
      if (session.status === "completed") {
        throw new Error("Sesi opname yang sudah selesai tidak bisa diubah.");
      }

      const itemById = new Map(session.items.map((item) => [item.id, item]));
      const now = new Date().toISOString();
      const rows = (items || []).map((entry) => {
        const existingItem = itemById.get(entry.id);
        if (!existingItem) {
          throw new Error("Item opname tidak valid.");
        }

        const rawRealStock = entry.real_stock ?? entry.realStock;
        const realStock =
          rawRealStock === "" || rawRealStock === null || rawRealStock === undefined
            ? null
            : Math.max(0, toSafeInteger(rawRealStock));
        const difference = realStock === null ? 0 : realStock - existingItem.system_stock;

        return {
          id: existingItem.id,
          session_id: sessionId,
          product_id: existingItem.product_id,
          product_name: existingItem.product_name,
          product_code: existingItem.product_code || "",
          category: existingItem.category,
          system_stock: existingItem.system_stock,
          real_stock: realStock,
          difference,
          note: String(entry.note ?? entry.catatan ?? "").trim(),
          cost: existingItem.cost || 0,
          applied_delta: existingItem.applied_delta,
          created_at: existingItem.created_at,
          updated_at: now,
        };
      });

      const summary = summarizeStockOpnameItems(rows);
      const itemRes = await supabase.from("stock_opname_items").upsert(rows);
      if (itemRes.error) {
        throw createStockOpnameSchemaError(itemRes.error, "Gagal menyimpan draft Stock Opname.");
      }

      const sessionRes = await supabase
        .from("stock_opname_sessions")
        .update({
          total_products: session.total_products,
          checked_products: summary.checked_products,
          total_minus: summary.total_minus,
          total_plus: summary.total_plus,
          total_loss: summary.total_loss,
          updated_at: now,
        })
        .eq("id", sessionId);

      if (sessionRes.error) {
        throw createStockOpnameSchemaError(sessionRes.error, "Gagal memperbarui ringkasan opname.");
      }

      await loadData();
      return summary;
    },
    [loadData, requireOwnerStockOpnameAccess, stockOpnameSessions]
  );

  const applyStockOpnameSession = useCallback(
    async (sessionId) => {
      requireOwnerStockOpnameAccess();

      const session = stockOpnameSessions.find((entry) => entry.id === sessionId);
      if (!session) {
        throw new Error("Sesi Stock Opname tidak ditemukan.");
      }
      if (session.status === "completed") {
        throw new Error("Sesi opname sudah diterapkan.");
      }
      if (!session.items.some((item) => item.real_stock !== null && item.real_stock !== undefined)) {
        throw new Error("Isi minimal satu stok real sebelum menerapkan penyesuaian.");
      }

      const data = await callAtomicRpc("apply_stock_opname_session_atomic", {
        p_session_id: sessionId,
      });

      await loadData();
      return normalizeStockOpnameSession(data || session, session.items);
    },
    [loadData, requireOwnerStockOpnameAccess, stockOpnameSessions]
  );

  const renameProductCategory = useCallback(
    async ({ oldCategory, newCategory }) => {
      requireOwnerProductAccess();

      const fromCategory = String(oldCategory || "").trim();
      const toCategory = String(newCategory || "").trim();

      if (!fromCategory) {
        throw new Error("Kategori lama tidak valid.");
      }
      if (!toCategory) {
        throw new Error("Nama kategori baru wajib diisi.");
      }
      if (fromCategory.toLowerCase() === toCategory.toLowerCase()) {
        throw new Error("Nama kategori baru masih sama.");
      }

      const affectedProductIds = products
        .filter((product) => product.kategori === fromCategory)
        .map((product) => product.id);

      if (!affectedProductIds.length) {
        await loadData();
        return 0;
      }

      const { error } = await supabase
        .from("produk")
        .update({ kategori: toCategory })
        .in("id", affectedProductIds);

      if (error) {
        throw createSupabaseError(error, "Gagal mengubah nama kategori produk.");
      }

      await loadData();
      return affectedProductIds.length;
    },
    [loadData, products, requireOwnerProductAccess]
  );

  const deleteProductCategory = useCallback(
    async ({ category, replacementCategory }) => {
      requireOwnerProductAccess();

      const fromCategory = String(category || "").trim();
      const toCategory = String(replacementCategory || "").trim();

      if (!fromCategory) {
        throw new Error("Kategori tidak valid.");
      }
      if (!toCategory) {
        throw new Error("Kategori pengganti wajib diisi agar produk tidak kehilangan kategori.");
      }
      if (fromCategory.toLowerCase() === toCategory.toLowerCase()) {
        throw new Error("Kategori pengganti harus berbeda dari kategori yang dihapus.");
      }

      const affectedProductIds = products
        .filter((product) => product.kategori === fromCategory)
        .map((product) => product.id);

      if (!affectedProductIds.length) {
        await loadData();
        return 0;
      }

      const { error } = await supabase
        .from("produk")
        .update({ kategori: toCategory })
        .in("id", affectedProductIds);

      if (error) {
        throw createSupabaseError(error, "Gagal menghapus kategori produk.");
      }

      await loadData();
      return affectedProductIds.length;
    },
    [loadData, products, requireOwnerProductAccess]
  );

  const saveProduct = useCallback(
    async (payload) => {
      requireOwnerProductAccess();

      const existingProduct = payload.id
        ? products.find((item) => item.id === payload.id)
        : null;
      const price = Number(payload.harga_jual);
      const cost = Number(payload.harga_beli);
      const stock = Number(payload.stok);
      const minimumStock = Number(payload.stok_minimum);

      if (!Number.isFinite(price) || price < 0) {
        throw new Error("Harga jual harus berupa angka 0 atau lebih.");
      }
      if (!Number.isFinite(cost) || cost < 0) {
        throw new Error("Harga modal harus berupa angka 0 atau lebih.");
      }
      if (!Number.isFinite(stock) || stock < 0) {
        throw new Error("Stok tidak boleh negatif.");
      }
      if (!Number.isFinite(minimumStock) || minimumStock < 0) {
        throw new Error("Stok minimum tidak boleh negatif.");
      }

      const productCode =
        normalizeProductCode(payload.kode_produk) ||
        existingProduct?.kode_produk ||
        createGeneratedProductCode(payload.nama);
      const nextStatus =
        payload.status ||
        (payload.aktif === false ? productStatuses.inactive : productStatuses.active);

      const product = normalizeProduct({
        ...payload,
        kode_produk: productCode,
        harga_beli: cost,
        harga_jual: price,
        stok: stock,
        stok_minimum: minimumStock,
        status: nextStatus,
        aktif: nextStatus === productStatuses.active,
        deleted_at: existingProduct?.deleted_at || null,
        deleted_by: existingProduct?.deleted_by || null,
      });

      const duplicateCode = productCatalog.find(
        (item) =>
          normalizeProductCode(item.kode_produk) === product.kode_produk &&
          item.id !== product.id
      );
      if (duplicateCode) {
        throw new Error(getProductCodeConflictMessage(product.kode_produk, duplicateCode));
      }

      const stockChanged = existingProduct && existingProduct.stok !== product.stok;
      const stockLog = stockChanged
        ? normalizeStockLog({
            id: crypto.randomUUID(),
            produk_id: product.id,
            tipe: "penyesuaian",
            jumlah: product.stok - existingProduct.stok,
            stok_sebelum: existingProduct.stok,
            stok_sesudah: product.stok,
            referensi: `EDIT-${product.kode_produk}`,
            catatan: `Edit stok produk ${product.nama}`,
            created_at: new Date().toISOString(),
          })
        : null;
      const activityLog = existingProduct
        ? createProductActivityLog({
            productId: product.id,
            action: "edit_product",
            actorId: user?.id,
            details: {
              before: {
                nama: existingProduct.nama,
                harga_beli: existingProduct.harga_beli,
                harga_jual: existingProduct.harga_jual,
                stok: existingProduct.stok,
              },
              after: {
                nama: product.nama,
                harga_beli: product.harga_beli,
                harga_jual: product.harga_jual,
                stok: product.stok,
              },
            },
            productSnapshot: product,
          })
        : null;

      let productSavedByRpc = false;
      try {
        const rpcResult = await callOptionalAtomicRpc("save_product_atomic", {
          p_product: product,
        });
        productSavedByRpc = !rpcResult.missing;
      } catch (error) {
        if (
          error?.code === "23505" &&
          String(error?.message || "").includes("produk_kode_produk_unique")
        ) {
          await throwDuplicateProductCodeError(product.kode_produk, product.id || null);
        }
        throw error;
      }

      if (!productSavedByRpc) {
        const runProductSave = async (options = {}) => {
          const productPayload = getProductDbPayload(product, options);
          const query = product.id
            ? supabase.from("produk").update(productPayload).eq("id", product.id)
            : supabase.from("produk").insert(productPayload);
          return await query;
        };

        let { error } = await runProductSave();
        if (isMissingColumnError(error, ["status", "deleted_at", "deleted_by"])) {
          ({ error } = await runProductSave({ legacy: true }));
        }
        if (isMissingColumnError(error, ["kode_produk"])) {
          ({ error } = await runProductSave({ legacy: true, includeCode: false }));
        }
        if (
          error?.code === "23505" &&
          String(error?.message || "").includes("produk_kode_produk_unique")
        ) {
          await throwDuplicateProductCodeError(product.kode_produk, product.id || null);
        }
        if (error) throw createSupabaseError(error, "Produk belum bisa disimpan.");
      }
      if (stockLog && !productSavedByRpc) {
        const { error: stockLogError } = await supabase.from("stok_mutasi").insert(stockLog);
        if (stockLogError) {
          console.warn("Stock mutation log skipped:", stockLogError.message || stockLogError);
        }
      }
      if (activityLog && !productSavedByRpc) {
        await insertProductActivityLog(activityLog);
      }
      await loadData();
    },
    [
      insertProductActivityLog,
      loadData,
      productCatalog,
      products,
      requireOwnerProductAccess,
      user?.id,
    ]
  );

  const importProducts = useCallback(
    async (payload) => {
      requireOwnerProductAccess();

      if (!payload?.length) {
        throw new Error("Belum ada produk valid untuk diimpor.");
      }

      const importedAt = new Date().toISOString();
      const existingByCode = new Map(
        productCatalog.map((product) => [normalizeProductCode(product.kode_produk), product])
      );

      const mergedProducts = payload.map((entry) => {
        const importedProduct = sanitizeImportedProduct(entry);
        if (!importedProduct.kode_produk) {
          throw new Error("Setiap produk impor wajib memiliki kode atau barcode.");
        }

        const existingProduct = existingByCode.get(importedProduct.kode_produk);
        const action = existingProduct ? "updated" : "created";
        const product = existingProduct
          ? {
            ...existingProduct,
            stok: importedProduct.stok,
            status: productStatuses.active,
            aktif: true,
            deleted_at: null,
            deleted_by: null,
          }
          : {
              ...importedProduct,
              id: null,
              created_at: importedAt,
              stok_minimum: Number.isFinite(Number(entry.stok_minimum))
                ? Math.max(0, Number(entry.stok_minimum))
                : 3,
              satuan: importedProduct.satuan || "pcs",
              aktif: typeof entry.aktif === "boolean" ? entry.aktif : importedProduct.aktif,
              status:
                typeof entry.aktif === "boolean" && !entry.aktif
                  ? productStatuses.inactive
                  : productStatuses.active,
              deleted_at: null,
              deleted_by: null,
            };

        return {
          product: normalizeProduct(product),
          action,
        };
      });

      const createdCount = mergedProducts.filter(
        (entry) => entry.action === "created"
      ).length;
      const updatedCount = mergedProducts.length - createdCount;
      const successRows = mergedProducts.map((entry) => ({
        kode: entry.product.kode_produk,
        nama: entry.product.nama,
        stok: entry.product.stok,
        action: entry.action,
      }));

      let importedByRpc = false;
      for (const { product } of mergedProducts) {
        const rpcResult = await callOptionalAtomicRpc("save_product_atomic", {
          p_product: product,
        });
        if (rpcResult.missing) {
          importedByRpc = false;
          break;
        }
        importedByRpc = true;
      }

      if (!importedByRpc) {
        for (let index = 0; index < mergedProducts.length; index += 200) {
          const chunk = mergedProducts.slice(index, index + 200).map(({ product }) => {
            const row = {
              kode_produk: product.kode_produk,
              nama: product.nama,
              kategori: product.kategori,
              stok: product.stok,
              stok_minimum: product.stok_minimum,
              harga_beli: product.harga_beli,
              harga_jual: product.harga_jual,
              satuan: product.satuan,
              aktif: product.aktif,
              status: product.status,
              deleted_at: product.deleted_at,
              deleted_by: product.deleted_by,
              created_at: product.created_at,
            };

            if (product.id) {
              row.id = product.id;
            }

            return row;
          });

          const { error } = await supabase.from("produk").upsert(chunk);
          if (
            error?.code === "23505" &&
            String(error?.message || "").includes("produk_kode_produk_unique")
          ) {
            throw new Error(
              "Salah satu kode produk di file import sudah dipakai oleh produk aktif, nonaktif, atau yang ada di History Produk."
            );
          }
          if (error) throw error;
        }
      }
      await loadData();

      return {
        total: mergedProducts.length,
        created: createdCount,
        updated: updatedCount,
        successRows,
      };
    },
    [loadData, productCatalog, requireOwnerProductAccess]
  );

  const requireOwnerServiceAccess = useCallback(() => {
    if (user?.role !== "pemilik") {
      throw new Error("Hanya pemilik toko yang dapat mengelola layanan digital.");
    }
  }, [user?.role]);

  const createServiceProduct = useCallback(
    async (payload) => {
      requireOwnerServiceAccess();

      const product = sanitizeServiceProductPayload(payload);
      const duplicate = serviceProducts.find(
        (item) => getServiceProductKey(item) === getServiceProductKey(product)
      );
      if (duplicate) {
        throw new Error("Layanan dengan kategori, provider, dan nama yang sama sudah ada.");
      }

      const rpcResult = await callOptionalAtomicRpc("save_service_product_atomic", {
        p_product: product,
      });

      if (!rpcResult.missing) {
        await loadData();
        return normalizeServiceProduct(rpcResult.data || product);
      }

      const saveDirect = async (legacy = false) =>
        await runServiceProductWriteQuery((query, tableName) =>
          query
            .insert(getServiceProductDbPayload(product, tableName, { legacy }))
            .select(
              tableName === "services_products"
                ? SERVICES_PRODUCTS_SOURCE_SELECT
                : SERVICE_PRODUCT_SELECT
            )
            .single()
        );

      let { data, error } = await saveDirect();
      if (isMissingColumnError(error, ["service_type", "default_price"])) {
        ({ data, error } = await saveDirect(true));
      }
      if (error) throw createSupabaseError(error, "Layanan belum bisa disimpan.");
      await loadData();
      return normalizeServiceProduct(data || product);
    },
    [loadData, requireOwnerServiceAccess, serviceProducts]
  );

  const updateServiceProduct = useCallback(
    async (id, payload) => {
      requireOwnerServiceAccess();

      let currentProducts = serviceProducts;
      let existingProduct = findServiceProductByIdOrKey(currentProducts, id);
      if (!existingProduct) {
        currentProducts = await refreshServiceProductState();
        existingProduct = findServiceProductByIdOrKey(currentProducts, id);
      }
      if (!existingProduct) {
        throw new Error(SERVICE_PRODUCT_STALE_MESSAGE);
      }

      const product = sanitizeServiceProductPayload(payload, existingProduct);
      let duplicate = currentProducts.find(
        (item) =>
          item.id !== existingProduct.id && getServiceProductKey(item) === getServiceProductKey(product)
      );
      if (duplicate) {
        throw new Error("Layanan dengan kategori, provider, dan nama yang sama sudah ada.");
      }

      const saveByRpc = async (serviceId) =>
        await callOptionalAtomicRpc("save_service_product_atomic", {
          p_product: {
            ...product,
            id: serviceId,
          },
        });

      let rpcResult;
      let resolvedId = existingProduct.id;

      try {
        rpcResult = await saveByRpc(resolvedId);
      } catch (error) {
        if (!isServiceProductNotFoundError(error)) {
          throw error;
        }

        currentProducts = await refreshServiceProductState();
        const freshProduct = findServiceProductByIdOrKey(currentProducts, id, existingProduct);
        if (!freshProduct) {
          throw new Error(SERVICE_PRODUCT_STALE_MESSAGE);
        }

        duplicate = currentProducts.find(
          (item) =>
            item.id !== freshProduct.id && getServiceProductKey(item) === getServiceProductKey(product)
        );
        if (duplicate) {
          throw new Error("Layanan dengan kategori, provider, dan nama yang sama sudah ada.");
        }

        resolvedId = freshProduct.id;
        rpcResult = await saveByRpc(resolvedId);
      }

      if (!rpcResult.missing) {
        await loadData();
        return normalizeServiceProduct(rpcResult.data || { ...product, id: resolvedId });
      }

      const saveDirect = async (legacy = false) =>
        await runServiceProductWriteQuery((query, tableName) =>
          query
            .update(getServiceProductDbPayload(product, tableName, { legacy }))
            .eq("id", resolvedId)
            .select(
              tableName === "services_products"
                ? SERVICES_PRODUCTS_SOURCE_SELECT
                : SERVICE_PRODUCT_SELECT
            )
            .single()
        );

      let { data, error } = await saveDirect();
      if (isMissingColumnError(error, ["service_type", "default_price"])) {
        ({ data, error } = await saveDirect(true));
      }
      if (error) throw createSupabaseError(error, "Layanan belum bisa diperbarui.");
      await loadData();
      return normalizeServiceProduct(data || { ...product, id: resolvedId });
    },
    [loadData, refreshServiceProductState, requireOwnerServiceAccess, serviceProducts]
  );

  const deleteServiceProduct = useCallback(
    async (id) => {
      requireOwnerServiceAccess();

      let currentProducts = serviceProducts;
      let existingProduct = findServiceProductByIdOrKey(currentProducts, id);
      if (!existingProduct) {
        currentProducts = await refreshServiceProductState();
        existingProduct = findServiceProductByIdOrKey(currentProducts, id);
      }
      if (!existingProduct) {
        throw new Error(SERVICE_PRODUCT_STALE_MESSAGE);
      }

      let resolvedId = existingProduct.id;
      let rpcResult;

      try {
        rpcResult = await callOptionalAtomicRpc("disable_service_product_atomic", {
          p_id: resolvedId,
        });
      } catch (error) {
        if (!isServiceProductNotFoundError(error)) {
          throw error;
        }

        currentProducts = await refreshServiceProductState();
        const freshProduct = findServiceProductByIdOrKey(currentProducts, id, existingProduct);
        if (!freshProduct) {
          throw new Error(SERVICE_PRODUCT_STALE_MESSAGE);
        }

        resolvedId = freshProduct.id;
        rpcResult = await callOptionalAtomicRpc("disable_service_product_atomic", {
          p_id: resolvedId,
        });
      }

      if (rpcResult.missing) {
        const { error } = await runServiceProductWriteQuery((query, tableName) =>
          query
            .update(tableName === "service_products" ? { status: "inactive" } : { active: false })
            .eq("id", resolvedId)
        );
        if (error) throw createSupabaseError(error, "Layanan belum bisa dinonaktifkan.");
      }
      await loadData();
    },
    [loadData, refreshServiceProductState, requireOwnerServiceAccess, serviceProducts]
  );

  const permanentlyDeleteServiceProduct = useCallback(
    async (id) => {
      requireOwnerServiceAccess();

      let currentProducts = serviceProducts;
      let existingProduct = findServiceProductByIdOrKey(currentProducts, id);
      if (!existingProduct) {
        currentProducts = await refreshServiceProductState();
        existingProduct = findServiceProductByIdOrKey(currentProducts, id);
      }
      if (!existingProduct) {
        throw new Error(SERVICE_PRODUCT_STALE_MESSAGE);
      }

      let resolvedId = existingProduct.id;
      let rpcResult;

      const deleteByRpc = async (serviceId) =>
        await callOptionalAtomicRpc("delete_service_product_atomic", {
          p_id: serviceId,
        });

      try {
        rpcResult = await deleteByRpc(resolvedId);
      } catch (error) {
        if (!isServiceProductNotFoundError(error)) {
          throw error;
        }

        currentProducts = await refreshServiceProductState();
        const freshProduct = findServiceProductByIdOrKey(currentProducts, id, existingProduct);
        if (!freshProduct) {
          throw new Error(SERVICE_PRODUCT_STALE_MESSAGE);
        }

        resolvedId = freshProduct.id;
        rpcResult = await deleteByRpc(resolvedId);
      }

      if (rpcResult.missing) {
        const { error } = await runServiceProductWriteQuery((query) =>
          query.delete().eq("id", resolvedId)
        );
        if (error) {
          const errorText = getSupabaseErrorText(error);
          if (String(error?.code || "") === "42501" || errorText.includes("permission denied")) {
            throw new Error(SERVICE_PRODUCT_DELETE_MIGRATION_MESSAGE);
          }
          throw createSupabaseError(error, "Layanan belum bisa dihapus.");
        }
      }
      await loadData();
    },
    [loadData, refreshServiceProductState, requireOwnerServiceAccess, serviceProducts]
  );

  const importServiceProducts = useCallback(
    async (payload) => {
      requireOwnerServiceAccess();

      if (!payload?.length) {
        throw new Error("Belum ada layanan valid untuk diimpor.");
      }

      const importedAt = new Date().toISOString();
      const existingByKey = new Map(
        serviceProducts.map((product) => [getServiceProductKey(product), product])
      );
      const mergedByKey = new Map(existingByKey);
      const importedByKey = new Map();
      const successRowsByKey = new Map();

      payload.forEach((entry) => {
        const importedProduct = sanitizeServiceProductPayload(entry);
        const key = getServiceProductKey(importedProduct);
        const existingProduct = mergedByKey.get(key);
        const action = existingByKey.has(key) ? "updated" : "created";
        const product = normalizeServiceProduct({
          ...existingProduct,
          ...importedProduct,
          id: existingProduct?.id || null,
          created_at: existingProduct?.created_at || importedAt,
        });

        mergedByKey.set(key, product);
        importedByKey.set(key, product);
        successRowsByKey.set(key, {
          name: product.name,
          provider: product.provider,
          category: product.category,
          service_type: product.service_type,
          action,
        });
      });

      const importedProducts = Array.from(importedByKey.values());
      const successRows = Array.from(successRowsByKey.values());
      const created = successRows.filter((row) => row.action === "created").length;
      const updated = successRows.length - created;
      const mergedProducts = importedProducts.map(normalizeServiceProduct);

      let importedByRpc = false;
      for (const product of mergedProducts) {
        const rpcResult = await callOptionalAtomicRpc("save_service_product_atomic", {
          p_product: product,
        });
        if (rpcResult.missing) {
          importedByRpc = false;
          break;
        }
        importedByRpc = true;
      }

      if (!importedByRpc) {
        for (let index = 0; index < mergedProducts.length; index += 200) {
          const productChunk = mergedProducts.slice(index, index + 200);
          const upsertDirect = async (legacy = false) =>
            await runServiceProductWriteQuery((query, tableName) => {
              const chunk = productChunk.map((product) => {
                const row = {
                  ...getServiceProductDbPayload(product, tableName, { legacy }),
                  created_at: product.created_at,
                };

                if (product.id) {
                  row.id = product.id;
                }

                return row;
              });

              return query.upsert(chunk, {
                onConflict: legacy ? "category,provider,name" : "category,provider,service_type,name",
              });
            });

          let { error } = await upsertDirect();
          if (isMissingColumnError(error, ["service_type", "default_price"])) {
            ({ error } = await upsertDirect(true));
          }
          if (error) throw createSupabaseError(error, "Import layanan belum berhasil.");
        }
      }
      await loadData();
      return {
        total: successRows.length,
        created,
        updated,
        successRows,
      };
    },
    [loadData, requireOwnerServiceAccess, serviceProducts]
  );

  const updateProductStatus = useCallback(
    async (id, aktif) => {
      requireOwnerProductAccess();

      const product = products.find((item) => item.id === id);
      if (!product) {
        throw new Error("Produk tidak ditemukan.");
      }

      const nextStatus = aktif ? productStatuses.active : productStatuses.inactive;
      const nextProduct = normalizeProduct({
        ...product,
        aktif,
        status: nextStatus,
        deleted_at: null,
        deleted_by: null,
      });
      const activityLog = createProductActivityLog({
        productId: product.id,
        action: "toggle_product_status",
        actorId: user?.id,
        details: {
          before_status: product.status,
          after_status: nextStatus,
        },
        productSnapshot: nextProduct,
      });

      const rpcResult = await callOptionalAtomicRpc("save_product_atomic", {
        p_product: nextProduct,
      });

      if (rpcResult.missing) {
        const { error } = await supabase
          .from("produk")
          .update({
            aktif,
            status: nextStatus,
            deleted_at: null,
            deleted_by: null,
          })
          .eq("id", id);
        if (error) throw createSupabaseError(error, "Status produk belum bisa diubah.");
        await insertProductActivityLog(activityLog);
      }
      await loadData();
    },
    [
      insertProductActivityLog,
      loadData,
      products,
      requireOwnerProductAccess,
      user?.id,
    ]
  );

  const deleteProduct = useCallback(
    async (id) => {
      requireOwnerProductAccess();

      const product = products.find((item) => item.id === id);
      if (!product) {
        throw new Error("Produk tidak ditemukan.");
      }

      const deletedAt = new Date().toISOString();
      const deletedProduct = normalizeProduct({
        ...product,
        aktif: false,
        status: productStatuses.deleted,
        deleted_at: deletedAt,
        deleted_by: user?.id || null,
      });
      const activityLog = createProductActivityLog({
        productId: product.id,
        action: "delete_product",
        actorId: user?.id,
        details: {
          deleted_at: deletedAt,
          deleted_by: user?.id || null,
        },
        productSnapshot: deletedProduct,
      });

      const rpcResult = await callOptionalAtomicRpc("save_product_atomic", {
        p_product: deletedProduct,
      });

      if (rpcResult.missing) {
        const { error } = await supabase
          .from("produk")
          .update({
            aktif: false,
            status: productStatuses.deleted,
            deleted_at: deletedAt,
            deleted_by: user?.id || null,
          })
          .eq("id", id);
        if (error) throw createSupabaseError(error, "Produk belum bisa dipulihkan.");
        await insertProductActivityLog(activityLog);
      }
      await loadData();
    },
    [
      insertProductActivityLog,
      loadData,
      products,
      requireOwnerProductAccess,
      user?.id,
    ]
  );

  const restoreProduct = useCallback(
    async (id) => {
      requireOwnerProductAccess();

      const product = deletedProducts.find((item) => item.id === id);
      if (!product) {
        throw new Error("Produk terhapus tidak ditemukan.");
      }

      const restoredProduct = normalizeProduct({
        ...product,
        aktif: true,
        status: productStatuses.active,
        deleted_at: null,
        deleted_by: null,
      });
      const activityLog = createProductActivityLog({
        productId: product.id,
        action: "restore_product",
        actorId: user?.id,
        details: {
          restored_at: new Date().toISOString(),
        },
        productSnapshot: restoredProduct,
      });

      const rpcResult = await callOptionalAtomicRpc("save_product_atomic", {
        p_product: restoredProduct,
      });

      if (rpcResult.missing) {
        const { error } = await supabase
          .from("produk")
          .update({
            aktif: true,
            status: productStatuses.active,
            deleted_at: null,
            deleted_by: null,
          })
          .eq("id", id);
        if (error) throw createSupabaseError(error, "Produk belum bisa dihapus permanen.");
        await insertProductActivityLog(activityLog);
      }
      await loadData();
    },
    [
      deletedProducts,
      insertProductActivityLog,
      loadData,
      requireOwnerProductAccess,
      user?.id,
    ]
  );

  const permanentlyDeleteProduct = useCallback(
    async (id) => {
      requireOwnerProductAccess();

      const product = deletedProducts.find((item) => item.id === id);
      if (!product) {
        throw new Error("Produk terhapus tidak ditemukan.");
      }

      const activityLog = createProductActivityLog({
        productId: product.id,
        action: "permanent_delete_product",
        actorId: user?.id,
        details: {
          deleted_at: product.deleted_at,
          permanently_deleted_at: new Date().toISOString(),
        },
        productSnapshot: product,
      });

      const rpcResult = await callOptionalAtomicRpc("permanently_delete_product_atomic", {
        p_id: id,
      });

      if (rpcResult.missing) {
        await insertProductActivityLog(activityLog);
        const { error } = await supabase.from("produk").delete().eq("id", id);
        if (error) throw error;
      }
      await loadData();
    },
    [
      deletedProducts,
      insertProductActivityLog,
      loadData,
      requireOwnerProductAccess,
      user?.id,
    ]
  );

  const purgeExpiredDeletedProducts = useCallback(async () => {
    requireOwnerProductAccess();

    const { data, error } = await supabase.rpc("purge_expired_deleted_products");
    if (error) throw createSupabaseError(error, "Gagal membersihkan history produk.");
    await loadData();
    return Number(data || 0);
  }, [loadData, requireOwnerProductAccess]);

  const saveStockMutation = useCallback(
    async ({ productId, tipe, jumlah, catatan, referensi }) => {
      const product = products.find((item) => item.id === productId);
      if (!product) throw new Error("Produk tidak ditemukan.");
      if (product.status === productStatuses.deleted) {
        throw new Error("Produk yang sudah dihapus tidak bisa dimutasi stoknya.");
      }
      if (user?.role !== "pemilik" && tipe !== "masuk") {
        throw new Error("Kasir hanya boleh menambah stok produk.");
      }
      if (user?.role !== "pemilik") {
        await requireEmployeePermission(EMPLOYEE_PERMISSIONS.PRODUCT_STOCK_EDIT);
      }

      const rawJumlah = Number(jumlah);
      if (!Number.isFinite(rawJumlah) || rawJumlah === 0) {
        throw new Error("Jumlah mutasi harus diisi dan tidak boleh 0.");
      }

      const delta =
        tipe === "masuk" ? Math.abs(rawJumlah) : tipe === "keluar" ? -Math.abs(rawJumlah) : rawJumlah;
      const nextStock = product.stok + delta;
      if (nextStock < 0) {
        throw new Error("Stok tidak cukup untuk mutasi ini.");
      }

      const mutation = normalizeStockLog({
        id: crypto.randomUUID(),
        produk_id: productId,
        tipe,
        jumlah: delta,
        stok_sebelum: product.stok,
        stok_sesudah: nextStock,
        referensi: referensi || "",
        catatan: catatan || "",
        created_at: new Date().toISOString(),
      });
      let savedMutation = null;
      try {
        savedMutation = await callAtomicRpc("save_stock_mutation_atomic", {
          p_mutation: mutation,
        });
      } catch (error) {
        if (String(error?.code || "") === "P0001") {
          await loadData();
        }
        throw error;
      }
      await loadData();
      return normalizeStockLog(savedMutation || mutation);
    },
    [
      loadData,
      products,
      requireEmployeePermission,
      user?.role,
    ]
  );

  const addStock = useCallback(
    async (productId, jumlah) =>
      saveStockMutation({
        productId,
        tipe: "masuk",
        jumlah,
        catatan: "Stok masuk",
      }),
    [saveStockMutation]
  );

  const createSupplierReturn = useCallback(
    async ({ supplierName, reason, condition, notes, items }) => {
      requireOwnerProductAccess();

      const normalizedSupplierName = String(supplierName || "").trim();
      if (!normalizedSupplierName) {
        throw new Error("Supplier wajib diisi.");
      }

      const returnItems = (Array.isArray(items) ? items : [])
        .map((item) => {
          const product = products.find((entry) => entry.id === item.productId);
          if (!product) {
            throw new Error("Produk retur tidak ditemukan.");
          }

          const quantity = Math.max(0, toSafeInteger(item.quantity || 0));
          if (quantity <= 0) {
            throw new Error(`Qty retur ${product.nama} wajib lebih besar dari 0.`);
          }
          if (product.stok < quantity) {
            throw new Error(`Stok ${product.nama} tidak cukup untuk retur supplier.`);
          }

          const unitCost = Math.max(0, toSafeInteger(item.unitCost ?? product.harga_beli));
          return {
            product_id: product.id,
            product_name: product.nama,
            product_code: product.kode_produk || "",
            category: product.kategori || "",
            quantity,
            unit_cost: unitCost,
            condition: item.condition || condition || "",
            notes: item.notes || "",
          };
        })
        .filter((item) => item.quantity > 0);

      if (!returnItems.length) {
        throw new Error("Minimal satu produk wajib diretur.");
      }

      const requestIntent = {
        supplierName: normalizedSupplierName,
        reason,
        condition,
        notes,
        items: returnItems,
      };
      const requestId = reserveMoneyRequestId("supplier_return", requestIntent);
      const todayCount = supplierReturns.filter(
        (row) => formatDateKey(row.created_at) === formatDateKey(new Date())
      ).length;
      const returnPayload = {
        id: requestId,
        request_id: requestId,
        no_retur: generateTransactionNumber("RTS", todayCount + 1),
        supplier_name: normalizedSupplierName,
        reason: String(reason || "lainnya").trim() || "lainnya",
        condition: String(condition || "").trim(),
        notes: String(notes || "").trim(),
        created_at: new Date().toISOString(),
      };

      let savedReturn = null;
      try {
        const rpcResult = await callOptionalAtomicRpc("create_supplier_return_atomic", {
          p_return: returnPayload,
          p_items: returnItems,
        });
        if (rpcResult.missing) {
          throw new Error(SUPPLIER_RETURN_MIGRATION_MESSAGE);
        }
        savedReturn = rpcResult.data;
      } catch (error) {
        if (String(error?.code || "") === "P0001") {
          await loadData();
        }
        throw error;
      }

      await loadData();
      const savedResult = normalizeSupplierReturn(savedReturn || returnPayload, []);
      completeMoneyRequest("supplier_return", requestIntent, requestId);
      return savedResult;
    },
    [
      completeMoneyRequest,
      loadData,
      products,
      requireOwnerProductAccess,
      reserveMoneyRequestId,
      supplierReturns,
    ]
  );

  const updateSupplierReturnStatus = useCallback(
    async ({ id, status, settlementAmount = 0, settlementMethod = "", settlementNotes = "", restock }) => {
      requireOwnerProductAccess();

      if (!id) {
        throw new Error("Retur supplier tidak valid.");
      }

      const payload = {
        settlement_amount: Math.max(0, toSafeInteger(settlementAmount || 0)),
        settlement_method: String(settlementMethod || "").trim(),
        settlement_notes: String(settlementNotes || "").trim(),
      };

      if (restock !== undefined) {
        payload.restock = Boolean(restock);
      }

      let savedReturn = null;
      try {
        const rpcResult = await callOptionalAtomicRpc("update_supplier_return_status_atomic", {
          p_id: id,
          p_status: status,
          p_payload: payload,
        });
        if (rpcResult.missing) {
          throw new Error(SUPPLIER_RETURN_MIGRATION_MESSAGE);
        }
        savedReturn = rpcResult.data;
      } catch (error) {
        if (String(error?.code || "") === "P0001") {
          await loadData();
        }
        throw error;
      }

      await loadData();
      return normalizeSupplierReturn(savedReturn || { id, status }, []);
    },
    [loadData, requireOwnerProductAccess]
  );

  const createCustomerReturn = useCallback(
    async ({ transactionId, customerName, reason, condition, notes, refundMethod, restock = true, items }) => {
      requireOwnerProductAccess();

      const transaction = accessoryTransactions.find((row) => row.id === transactionId);
      if (!transaction) {
        throw new Error("Transaksi asal tidak ditemukan.");
      }

      const returnItems = (Array.isArray(items) ? items : [])
        .map((item) => {
          const transactionItem = (transaction.items || []).find(
            (entry) => entry.id === item.transactionItemId
          );
          if (!transactionItem) {
            throw new Error("Item transaksi retur tidak ditemukan.");
          }

          const quantity = Math.max(0, toSafeInteger(item.quantity || 0));
          if (quantity <= 0) {
            throw new Error(`Qty retur ${transactionItem.nama_produk} wajib lebih besar dari 0.`);
          }

          const alreadyReturned = customerReturns.reduce((sum, row) => {
            return (
              sum +
              (row.items || [])
                .filter((returnItem) => returnItem.transaction_item_id === transactionItem.id)
                .reduce((itemSum, returnItem) => itemSum + Number(returnItem.quantity || 0), 0)
            );
          }, 0);

          if (quantity + alreadyReturned > Number(transactionItem.qty || 0)) {
            throw new Error(`Qty retur ${transactionItem.nama_produk} melebihi qty transaksi.`);
          }

          return {
            transaction_item_id: transactionItem.id,
            product_id: transactionItem.produk_id,
            product_name: transactionItem.nama_produk,
            quantity,
            unit_price: Math.max(0, toSafeInteger(item.unitPrice ?? transactionItem.harga_satuan)),
            condition: item.condition || condition || "",
            notes: item.notes || "",
          };
        })
        .filter((item) => item.quantity > 0);

      if (!returnItems.length) {
        throw new Error("Minimal satu item wajib diretur.");
      }

      const requestIntent = {
        transactionId: transaction.id,
        customerName,
        reason,
        condition,
        notes,
        refundMethod,
        restock: Boolean(restock),
        items: returnItems,
      };
      const requestId = reserveMoneyRequestId("customer_return", requestIntent);
      const todayCount = customerReturns.filter(
        (row) => formatDateKey(row.created_at) === formatDateKey(new Date())
      ).length;
      const returnPayload = {
        id: requestId,
        request_id: requestId,
        no_retur: generateTransactionNumber("RTK", todayCount + 1),
        transaction_id: transaction.id,
        transaction_no: transaction.no_transaksi,
        customer_name: String(customerName || "").trim(),
        reason: String(reason || "lainnya").trim() || "lainnya",
        condition: String(condition || "").trim(),
        notes: String(notes || "").trim(),
        refund_method: String(refundMethod || transaction.metode_bayar || "").trim(),
        restock: Boolean(restock),
        created_at: new Date().toISOString(),
      };

      let savedReturn = null;
      try {
        const rpcResult = await callOptionalAtomicRpc("create_customer_return_atomic", {
          p_return: returnPayload,
          p_items: returnItems,
        });
        if (rpcResult.missing) {
          throw new Error(SUPPLIER_RETURN_MIGRATION_MESSAGE);
        }
        savedReturn = rpcResult.data;
      } catch (error) {
        if (String(error?.code || "") === "P0001") {
          await loadData();
        }
        throw error;
      }

      await loadData();
      const savedResult = normalizeCustomerReturn(savedReturn || returnPayload, []);
      completeMoneyRequest("customer_return", requestIntent, requestId);
      return savedResult;
    },
    [
      accessoryTransactions,
      completeMoneyRequest,
      customerReturns,
      loadData,
      requireOwnerProductAccess,
      reserveMoneyRequestId,
    ]
  );

  const createWarrantyClaim = useCallback(
    async ({
      transactionId,
      customerName,
      reason,
      condition,
      notes,
      claimOutcome = "exchange",
      refundMethod,
      replacementProductId,
      replacementQuantity,
      items,
    }) => {
      requireOwnerProductAccess();

      const normalizedOutcome = ["exchange", "refund", "rejected"].includes(claimOutcome)
        ? claimOutcome
        : "exchange";
      const transaction = accessoryTransactions.find((row) => row.id === transactionId);
      if (!transaction) {
        throw new Error("Transaksi asal tidak ditemukan.");
      }

      const replacementProduct =
        normalizedOutcome === "exchange"
          ? products.find((product) => product.id === replacementProductId)
          : null;
      const replacementQty = Math.max(0, toSafeInteger(replacementQuantity || 0));

      if (normalizedOutcome === "exchange") {
        if (!replacementProduct) {
          throw new Error("Produk pengganti wajib dipilih.");
        }
        if (replacementProduct.status === productStatuses.deleted || replacementProduct.aktif === false) {
          throw new Error("Produk pengganti tidak aktif.");
        }
        if (replacementQty <= 0) {
          throw new Error("Qty produk pengganti wajib lebih besar dari 0.");
        }
        if (Number(replacementProduct.stok || 0) < replacementQty) {
          throw new Error(`Stok ${replacementProduct.nama} tidak cukup untuk klaim garansi.`);
        }
      }

      if (normalizedOutcome === "rejected" && !String(notes || "").trim()) {
        throw new Error("Catatan wajib diisi saat klaim ditolak.");
      }

      const claimItems = (Array.isArray(items) ? items : [])
        .map((item) => {
          const transactionItem = (transaction.items || []).find(
            (entry) => entry.id === item.transactionItemId
          );
          if (!transactionItem) {
            throw new Error("Item transaksi garansi tidak ditemukan.");
          }

          const quantity = Math.max(0, toSafeInteger(item.quantity || 0));
          if (quantity <= 0) {
            throw new Error(`Qty klaim ${transactionItem.nama_produk} wajib lebih besar dari 0.`);
          }

          if (normalizedOutcome !== "rejected") {
            const alreadyClaimed = customerReturns.reduce((sum, row) => {
              if (row.refund_method === "warranty_rejected") return sum;
              return (
                sum +
                (row.items || [])
                  .filter((returnItem) => returnItem.transaction_item_id === transactionItem.id)
                  .reduce((itemSum, returnItem) => itemSum + Number(returnItem.quantity || 0), 0)
              );
            }, 0);

            if (quantity + alreadyClaimed > Number(transactionItem.qty || 0)) {
              throw new Error(`Qty klaim ${transactionItem.nama_produk} melebihi qty transaksi.`);
            }
          }

          return {
            transaction_item_id: transactionItem.id,
            product_id: transactionItem.produk_id,
            product_name: transactionItem.nama_produk,
            quantity,
            unit_price: Math.max(0, toSafeInteger(item.unitPrice ?? transactionItem.harga_satuan)),
            condition: item.condition || condition || "",
            notes: item.notes || "",
          };
        })
        .filter((item) => item.quantity > 0);

      if (!claimItems.length) {
        throw new Error("Minimal satu item wajib diklaim.");
      }

      const outcomeLabel =
        normalizedOutcome === "exchange"
          ? "Tukar Barang"
          : normalizedOutcome === "refund"
            ? "Refund"
            : "Ditolak";
      const refundMethodValue =
        normalizedOutcome === "refund"
          ? String(refundMethod || transaction.metode_bayar || "cash").trim()
          : normalizedOutcome === "exchange"
            ? "warranty_exchange"
            : "warranty_rejected";
      const replacementSummary = replacementProduct
        ? `Pengganti: ${replacementProduct.nama} x ${replacementQty}`
        : "";
      const finalNotes = [
        `Hasil klaim: ${outcomeLabel}`,
        replacementSummary,
        String(notes || "").trim(),
      ]
        .filter(Boolean)
        .join(" | ");
      const requestIntent = {
        transactionId: transaction.id,
        customerName,
        reason,
        condition,
        notes: finalNotes,
        claimOutcome: normalizedOutcome,
        refundMethod: refundMethodValue,
        replacementProductId: replacementProduct?.id || "",
        replacementQuantity: replacementQty,
        items: claimItems,
      };
      const requestId = reserveMoneyRequestId("warranty_claim", requestIntent);
      const todayCount = customerReturns.filter(
        (row) =>
          formatDateKey(row.created_at) === formatDateKey(new Date()) &&
          String(row.no_retur || "").startsWith("GRS")
      ).length;
      const claimPayload = {
        id: requestId,
        request_id: requestId,
        no_retur: generateTransactionNumber("GRS", todayCount + 1),
        transaction_id: transaction.id,
        transaction_no: transaction.no_transaksi,
        customer_name: String(customerName || "").trim(),
        reason: String(reason || "lainnya").trim() || "lainnya",
        condition: String(condition || "").trim(),
        notes: finalNotes,
        refund_method: refundMethodValue,
        restock: false,
        warranty_outcome: normalizedOutcome,
        replacement_product_id: replacementProduct?.id || null,
        replacement_product_name: replacementProduct?.nama || "",
        replacement_quantity: replacementQty,
        created_at: new Date().toISOString(),
      };

      let savedClaim = null;
      try {
        const rpcResult = await callOptionalAtomicRpc("create_warranty_claim_atomic", {
          p_claim: claimPayload,
          p_items: claimItems,
        });
        if (rpcResult.missing) {
          throw new Error(WARRANTY_CLAIM_MIGRATION_MESSAGE);
        }
        savedClaim = rpcResult.data;
      } catch (error) {
        if (String(error?.code || "") === "P0001") {
          await loadData();
        }
        throw error;
      }

      await loadData();
      const savedResult = normalizeCustomerReturn(
        savedClaim || claimPayload,
        savedClaim?.items || []
      );
      completeMoneyRequest("warranty_claim", requestIntent, requestId);
      return savedResult;
    },
    [
      accessoryTransactions,
      completeMoneyRequest,
      customerReturns,
      loadData,
      products,
      requireOwnerProductAccess,
      reserveMoneyRequestId,
    ]
  );

  const getDashboardSummary = useCallback(
    ({ startDate, endDate }) => {
      const filteredAccessoryTransactions = accessoryTransactions.filter((transaction) =>
        isDateInRange(transaction.created_at, startDate, endDate)
      );
      const filteredDigitalTransactions = digitalTransactions.filter((transaction) =>
        isDateInRange(transaction.created_at, startDate, endDate)
      );

      const filteredLogisticsTransactions = logisticsTransactions.filter((transaction) =>
        isDateInRange(transaction.created_at, startDate, endDate)
      );
      const filteredWalletTransactions = walletTransactions.filter((transaction) =>
        isDateInRange(transaction.created_at, startDate, endDate)
      );
      const filteredCashEntries = cashEntries.filter((entry) =>
        isDateInRange(entry.tanggal, startDate, endDate)
      );
      const filteredSupplierReturns = supplierReturns.filter((row) =>
        isDateInRange(row.created_at, startDate, endDate)
      );
      const filteredCustomerReturns = customerReturns.filter((row) =>
        isDateInRange(row.created_at, startDate, endDate)
      );

      const accessoryMetrics = filteredAccessoryTransactions.reduce(
        (acc, transaction) => {
          const modal = getAccessoryTransactionCost(transaction, productCatalog);
          acc.omzet += transaction.total_bayar;
          acc.modal += modal;
          acc.keuntungan += transaction.total_bayar - modal;
          acc.transaksi += 1;
          acc.produkTerjual += (transaction.items || []).reduce((sum, item) => sum + item.qty, 0);
          return acc;
        },
        { omzet: 0, modal: 0, keuntungan: 0, transaksi: 0, produkTerjual: 0 }
      );

      const digitalMetrics = filteredDigitalTransactions.reduce(
        (acc, transaction) => {
          acc.omzet += transaction.harga_jual;
          acc.modal += transaction.modal;
          acc.keuntungan += transaction.keuntungan ?? transaction.harga_jual - transaction.modal;
          acc.transaksi += 1;
          return acc;
        },
        { omzet: 0, modal: 0, keuntungan: 0, transaksi: 0 }
      );

      const logisticsMetrics = filteredLogisticsTransactions.reduce(
        (acc, transaction) => {
          acc.omzet += transaction.harga_jual;
          acc.modal += transaction.modal;
          acc.keuntungan += transaction.keuntungan ?? transaction.harga_jual - transaction.modal;
          acc.transaksi += 1;
          return acc;
        },
        { omzet: 0, modal: 0, keuntungan: 0, transaksi: 0 }
      );

      const totalOmzet =
        accessoryMetrics.omzet + digitalMetrics.omzet + logisticsMetrics.omzet;
      const keuntunganKotor =
        accessoryMetrics.keuntungan + digitalMetrics.keuntungan + logisticsMetrics.keuntungan;
      const totalPengeluaranKas = filteredCashEntries
        .filter((entry) => entry.jenis === "pengeluaran")
        .reduce((sum, entry) => sum + entry.nominal, 0);
      const supplierReturnSummary = filteredSupplierReturns.reduce(
        (acc, row) => {
          acc.total += 1;
          acc.pending += row.status === "pending" ? 1 : 0;
          acc.quantity += Number(row.total_quantity || 0);
          acc.estimatedValue += Number(row.total_estimated_value || 0);
          acc.settlementAmount += Number(row.settlement_amount || 0);
          return acc;
        },
        { total: 0, pending: 0, quantity: 0, estimatedValue: 0, settlementAmount: 0 }
      );
      const customerReturnSummary = filteredCustomerReturns.reduce(
        (acc, row) => {
          acc.total += 1;
          acc.quantity += Number(row.total_quantity || 0);
          acc.refundAmount += Number(row.total_refund_amount || 0);
          acc.restock += row.restock !== false ? 1 : 0;
          return acc;
        },
        { total: 0, quantity: 0, refundAmount: 0, restock: 0 }
      );

      const breakdown = [
        { key: "aksesoris", label: "Aksesoris", ...accessoryMetrics },
        { key: "digital", label: "Layanan", ...digitalMetrics },
        { key: "logistik", label: "Logistik", ...logisticsMetrics },
      ].map((item) => ({
        ...item,
        kontribusi: totalOmzet ? Math.round((item.omzet / totalOmzet) * 100) : 0,
      }));

      const topProductMap = {};
      const topCategoryMap = {};
      const productById = new Map(productCatalog.map((product) => [product.id, product]));

      filteredAccessoryTransactions.forEach((transaction) => {
        (transaction.items || []).forEach((item) => {
          const product = productById.get(item.produk_id);
          const productName = item.nama_produk || product?.nama || "Produk";
          const category = item.category || item.kategori || product?.kategori || "Aksesoris Lainnya";
          const qty = Number(item.qty || 0);
          const omzet = Number(item.subtotal || item.harga_satuan * qty || 0);

          topProductMap[productName] ??= {
            nama: productName,
            category,
            qty: 0,
            omzet: 0,
          };
          topProductMap[productName].qty += qty;
          topProductMap[productName].omzet += omzet;

          topCategoryMap[category] ??= {
            nama: category,
            qty: 0,
            omzet: 0,
          };
          topCategoryMap[category].qty += qty;
          topCategoryMap[category].omzet += omzet;
        });
      });

      const topProducts = Object.values(topProductMap)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);
      const topCategories = Object.values(topCategoryMap)
        .map((item) => ({
          ...item,
          kontribusi: accessoryMetrics.produkTerjual
            ? Math.round((item.qty / accessoryMetrics.produkTerjual) * 100)
            : 0,
        }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      return {
        omzet: totalOmzet,
        keuntunganKotor,
        totalPengeluaranKas,
        labaBersih: keuntunganKotor - totalPengeluaranKas,
        totalTransaksi:
          filteredAccessoryTransactions.length +
          filteredDigitalTransactions.length +
          filteredLogisticsTransactions.length +
          filteredWalletTransactions.length +
          filteredCashEntries.length,
        produkTerjual: accessoryMetrics.produkTerjual,
        breakdown,
        walletPlatformSummary: summarizeWalletPlatforms(filteredWalletTransactions),
        logisticsSummary: summarizeLogisticsByCourier(filteredLogisticsTransactions),
        returnSummary: {
          supplier: supplierReturnSummary,
          customer: customerReturnSummary,
        },
        cashDailySummary: buildCashDailySummary(cashEntries, startDate, endDate),
        trendSeries: buildTrendSeries({
          startDate,
          endDate,
          accessoryTransactions: filteredAccessoryTransactions,
          digitalTransactions: filteredDigitalTransactions,
          logisticsTransactions: filteredLogisticsTransactions,
          cashEntries: filteredCashEntries,
          products: productCatalog,
        }),
        topProducts,
        topCategories,
        accessoryTransactions: filteredAccessoryTransactions,
        digitalTransactions: filteredDigitalTransactions,
        logisticsTransactions: filteredLogisticsTransactions,
        walletTransactions: filteredWalletTransactions,
        cashEntries: filteredCashEntries,
        supplierReturns: filteredSupplierReturns,
        customerReturns: filteredCustomerReturns,
      };
    },
    [
      accessoryTransactions,
      cashEntries,
      customerReturns,
      digitalTransactions,
      logisticsTransactions,
      productCatalog,
      supplierReturns,
      walletTransactions,
    ]
  );

  const value = useMemo(
    () => ({
      loading,
      coreLoading,
      coreError,
      products,
      deletedProducts,
      deletedTransactions,
      allProducts: productCatalog,
      serviceProducts,
      categories,
      categoryGroups,
      accessoryTransactions,
      digitalTransactions,
      shifts,
      activeShifts,
      currentShift,
      staffUsers,
      employeePayrolls,
      pinRequiredEnabled,
      securityControls,
      cashierUsers,
      selectedCashier,
      selectedCashierId: operatingCashierId,
      setSelectedCashierId,
      walletTransactions,
      walletBalances,
      logisticsTransactions,
      cashEntries,
      appSettings,
      stockLogs,
      stockMutations: stockLogs,
      stockOpnameSessions,
      supplierReturns,
      customerReturns,
      productActivityLogs,
      loadData,
      refreshProducts: refreshProductData,
      refreshStock: refreshInventoryData,
      refreshTransactions: refreshTransactionData,
      refreshWallet: refreshWalletData,
      refreshShift: refreshShiftData,
      refreshReturns: refreshReturnData,
      refreshStockOpname: refreshStockOpnameData,
      refreshServiceProducts: refreshServiceProductState,
      setPinRequiredEnabled,
      setSecurityControls,
      startShift,
      closeShift,
      createEmployee,
      updateEmployeeProfile,
      setEmployeeStatus,
      resetEmployeePin,
      saveEmployeePayroll,
      saveEmployeePermissions,
      saveEmployeeNote,
      revokeEmployeeSession,
      reviewShift,
      getActiveShiftForCashier,
      createAccessoryTransaction,
      createDigitalTransaction,
      createLogisticsTransaction,
      createWalletTransaction,
      createCashEntry,
      updateCashEntry,
      deleteCashEntry,
      createServiceProduct,
      updateServiceProduct,
      deleteServiceProduct,
      permanentlyDeleteServiceProduct,
      importServiceProducts,
      saveProduct,
      importProducts,
      updateProductStatus,
      deleteProduct,
      renameProductCategory,
      deleteProductCategory,
      restoreProduct,
      permanentlyDeleteProduct,
      purgeExpiredDeletedProducts,
      deleteTransactionHistory,
      restoreTransactionHistory,
      permanentlyDeleteTransactionHistory,
      purgeExpiredDeletedTransactions,
      createStockOpnameSession,
      saveStockOpnameDraft,
      applyStockOpnameSession,
      createSupplierReturn,
      updateSupplierReturnStatus,
      createCustomerReturn,
      createWarrantyClaim,
      addStock,
      saveStockMutation,
      createAuditLog,
      getDashboardSummary,
    }),
    [
      accessoryTransactions,
      addStock,
      applyStockOpnameSession,
      cashEntries,
      appSettings,
      categories,
      categoryGroups,
      closeShift,
      coreError,
      coreLoading,
      createEmployee,
      createStockOpnameSession,
      createCustomerReturn,
      createWarrantyClaim,
      createSupplierReturn,
      currentShift,
      createAccessoryTransaction,
      createCashEntry,
      createDigitalTransaction,
      createLogisticsTransaction,
      createServiceProduct,
      createAuditLog,
      createWalletTransaction,
      activeShifts,
      cashierUsers,
      deleteCashEntry,
      deleteProduct,
      deleteProductCategory,
      deleteTransactionHistory,
      deletedProducts,
      deletedTransactions,
      digitalTransactions,
      employeePayrolls,
      getActiveShiftForCashier,
      getDashboardSummary,
      importServiceProducts,
      importProducts,
      logisticsTransactions,
      loadData,
      loading,
      products,
      pinRequiredEnabled,
      securityControls,
      productActivityLogs,
      productCatalog,
      serviceProducts,
      permanentlyDeleteServiceProduct,
      permanentlyDeleteProduct,
      permanentlyDeleteTransactionHistory,
      purgeExpiredDeletedProducts,
      purgeExpiredDeletedTransactions,
      refreshInventoryData,
      refreshProductData,
      refreshReturnData,
      refreshServiceProductState,
      refreshShiftData,
      refreshStockOpnameData,
      refreshTransactionData,
      refreshWalletData,
      renameProductCategory,
      reviewShift,
      restoreProduct,
      restoreTransactionHistory,
      revokeEmployeeSession,
      selectedCashier,
      operatingCashierId,
      deleteServiceProduct,
      saveProduct,
      saveEmployeePayroll,
      saveEmployeePermissions,
      saveEmployeeNote,
      saveStockMutation,
      saveStockOpnameDraft,
      setSelectedCashierId,
      setEmployeeStatus,
      setPinRequiredEnabled,
      setSecurityControls,
      shifts,
      staffUsers,
      resetEmployeePin,
      startShift,
      stockLogs,
      stockOpnameSessions,
      supplierReturns,
      customerReturns,
      updateSupplierReturnStatus,
      updateCashEntry,
      updateEmployeeProfile,
      updateServiceProduct,
      updateProductStatus,
      walletTransactions,
      walletBalances,
    ]
  );

  const productValue = useMemo(
    () => ({
      loading,
      coreLoading,
      coreError,
      products,
      deletedProducts,
      allProducts: productCatalog,
      serviceProducts,
      categories,
      categoryGroups,
      stockLogs,
      stockMutations: stockLogs,
      stockOpnameSessions,
      productActivityLogs,
      loadData,
      refreshProducts: refreshProductData,
      refreshStock: refreshInventoryData,
      refreshStockOpname: refreshStockOpnameData,
      refreshServiceProducts: refreshServiceProductState,
      saveProduct,
      importProducts,
      updateProductStatus,
      deleteProduct,
      renameProductCategory,
      deleteProductCategory,
      restoreProduct,
      permanentlyDeleteProduct,
      purgeExpiredDeletedProducts,
      addStock,
      saveStockMutation,
      createStockOpnameSession,
      saveStockOpnameDraft,
      applyStockOpnameSession,
      createServiceProduct,
      updateServiceProduct,
      deleteServiceProduct,
      permanentlyDeleteServiceProduct,
      importServiceProducts,
    }),
    [
      addStock,
      applyStockOpnameSession,
      categories,
      categoryGroups,
      coreError,
      coreLoading,
      createServiceProduct,
      createStockOpnameSession,
      deleteProduct,
      deleteProductCategory,
      deleteServiceProduct,
      deletedProducts,
      importProducts,
      importServiceProducts,
      loadData,
      loading,
      permanentlyDeleteProduct,
      permanentlyDeleteServiceProduct,
      productActivityLogs,
      productCatalog,
      products,
      purgeExpiredDeletedProducts,
      refreshInventoryData,
      refreshProductData,
      refreshServiceProductState,
      refreshStockOpnameData,
      renameProductCategory,
      restoreProduct,
      saveProduct,
      saveStockMutation,
      saveStockOpnameDraft,
      serviceProducts,
      stockLogs,
      stockOpnameSessions,
      updateProductStatus,
      updateServiceProduct,
    ]
  );

  const transactionValue = useMemo(
    () => ({
      loading,
      coreLoading,
      coreError,
      accessoryTransactions,
      digitalTransactions,
      deletedTransactions,
      logisticsTransactions,
      cashEntries,
      supplierReturns,
      customerReturns,
      loadData,
      refreshTransactions: refreshTransactionData,
      refreshReturns: refreshReturnData,
      createAccessoryTransaction,
      createDigitalTransaction,
      createLogisticsTransaction,
      createCashEntry,
      updateCashEntry,
      deleteCashEntry,
      deleteTransactionHistory,
      restoreTransactionHistory,
      permanentlyDeleteTransactionHistory,
      purgeExpiredDeletedTransactions,
      createSupplierReturn,
      updateSupplierReturnStatus,
      createCustomerReturn,
      createWarrantyClaim,
    }),
    [
      accessoryTransactions,
      cashEntries,
      coreError,
      coreLoading,
      createAccessoryTransaction,
      createCashEntry,
      createCustomerReturn,
      createWarrantyClaim,
      createDigitalTransaction,
      createLogisticsTransaction,
      createSupplierReturn,
      customerReturns,
      deleteCashEntry,
      deleteTransactionHistory,
      deletedTransactions,
      digitalTransactions,
      loadData,
      loading,
      logisticsTransactions,
      permanentlyDeleteTransactionHistory,
      purgeExpiredDeletedTransactions,
      refreshReturnData,
      refreshTransactionData,
      restoreTransactionHistory,
      supplierReturns,
      updateCashEntry,
      updateSupplierReturnStatus,
    ]
  );

  const walletValue = useMemo(
    () => ({
      loading,
      coreLoading,
      coreError,
      walletTransactions,
      walletBalances,
      createWalletTransaction,
      refreshWallet: refreshWalletData,
      loadData,
    }),
    [
      coreError,
      coreLoading,
      createWalletTransaction,
      loadData,
      loading,
      refreshWalletData,
      walletBalances,
      walletTransactions,
    ]
  );

  const shiftValue = useMemo(
    () => ({
      loading,
      coreLoading,
      coreError,
      shifts,
      activeShifts,
      currentShift,
      staffUsers,
      cashierUsers,
      selectedCashier,
      selectedCashierId: operatingCashierId,
      setSelectedCashierId,
      pinRequiredEnabled,
      startShift,
      closeShift,
      reviewShift,
      getActiveShiftForCashier,
      refreshShift: refreshShiftData,
      loadData,
    }),
    [
      activeShifts,
      cashierUsers,
      closeShift,
      coreError,
      coreLoading,
      currentShift,
      getActiveShiftForCashier,
      loadData,
      loading,
      operatingCashierId,
      pinRequiredEnabled,
      refreshShiftData,
      reviewShift,
      selectedCashier,
      setSelectedCashierId,
      shifts,
      staffUsers,
      startShift,
    ]
  );

  const reportValue = useMemo(
    () => ({
      loading,
      coreLoading,
      coreError,
      products,
      allProducts: productCatalog,
      accessoryTransactions,
      digitalTransactions,
      logisticsTransactions,
      walletTransactions,
      walletBalances,
      cashEntries,
      shifts,
      supplierReturns,
      customerReturns,
      getDashboardSummary,
      refreshTransactions: refreshTransactionData,
      loadData,
    }),
    [
      accessoryTransactions,
      cashEntries,
      coreError,
      coreLoading,
      customerReturns,
      digitalTransactions,
      getDashboardSummary,
      loadData,
      loading,
      logisticsTransactions,
      productCatalog,
      products,
      refreshTransactionData,
      shifts,
      supplierReturns,
      walletBalances,
      walletTransactions,
    ]
  );

  const employeeValue = useMemo(
    () => ({
      coreLoading,
      coreError,
      staffUsers,
      activeShifts,
      shifts,
      accessoryTransactions,
      digitalTransactions,
      logisticsTransactions,
      customerReturns,
      employeePayrolls,
      pinRequiredEnabled,
      securityControls,
      createEmployee,
      updateEmployeeProfile,
      setEmployeeStatus,
      resetEmployeePin,
      saveEmployeePayroll,
      saveEmployeePermissions,
      saveEmployeeNote,
      revokeEmployeeSession,
      refreshShift: refreshShiftData,
      setSecurityControls,
    }),
    [
      accessoryTransactions,
      activeShifts,
      coreError,
      coreLoading,
      createEmployee,
      customerReturns,
      digitalTransactions,
      employeePayrolls,
      logisticsTransactions,
      pinRequiredEnabled,
      refreshShiftData,
      resetEmployeePin,
      revokeEmployeeSession,
      saveEmployeeNote,
      saveEmployeePayroll,
      saveEmployeePermissions,
      securityControls,
      setEmployeeStatus,
      setSecurityControls,
      shifts,
      staffUsers,
      updateEmployeeProfile,
    ]
  );

  const securityValue = useMemo(
    () => ({
      pinRequiredEnabled,
      securityControls,
      setPinRequiredEnabled,
      setSecurityControls,
    }),
    [pinRequiredEnabled, securityControls, setPinRequiredEnabled, setSecurityControls]
  );

  return (
    <DataContext.Provider value={value}>
      <SecurityDataContext.Provider value={securityValue}>
        <ShiftDataContext.Provider value={shiftValue}>
          <EmployeeDataContext.Provider value={employeeValue}>
            <ProductDataContext.Provider value={productValue}>
              <TransactionDataContext.Provider value={transactionValue}>
                <WalletDataContext.Provider value={walletValue}>
                  <ReportDataContext.Provider value={reportValue}>
                    {children}
                  </ReportDataContext.Provider>
                </WalletDataContext.Provider>
              </TransactionDataContext.Provider>
            </ProductDataContext.Provider>
          </EmployeeDataContext.Provider>
        </ShiftDataContext.Provider>
      </SecurityDataContext.Provider>
    </DataContext.Provider>
  );
}
