import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import LoadingState from "./components/LoadingState";
import { getDefaultRoute } from "./core/navigation/navigation";
import { getRuntimeFlags, isFeatureEnabled } from "./core/runtime/runtimeFlags";
import { AppModeProvider } from "./contexts/AppModeContext";
import { AuthProvider } from "./contexts/AuthProvider";
import { NotificationProvider } from "./contexts/NotificationContext";
import { useAuth } from "./contexts/useAuth";
import AppShell from "./layouts/AppShell";
import ConnectionStatusBanner from "./components/ConnectionStatusBanner";
import ErrorBoundary from "./components/ErrorBoundary";
import MigrationBanner from "./components/MigrationBanner";
import Login from "./pages/Login";

const DataProvider = lazy(() =>
  import("./contexts/DataProvider").then((module) => ({ default: module.DataProvider }))
);
const EmployeePresenceProvider = lazy(() =>
  import("./contexts/EmployeePresenceProvider").then((module) => ({
    default: module.EmployeePresenceProvider,
  }))
);
const PAGE_LOAD_TIMEOUT_MS = 20000;

function lazyPage(importer, label) {
  return lazy(() => {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(`Memuat ${label} terlalu lama. Kemungkinan chunk fitur berat atau gagal dimuat.`));
      }, PAGE_LOAD_TIMEOUT_MS);
    });

    return Promise.race([importer(), timeout]).finally(() => {
      window.clearTimeout(timeoutId);
    });
  });
}

const CalculatorPage = lazyPage(() => import("./pages/CalculatorPage"), "Kalkulator");
const AuditLogPage = lazyPage(() => import("./pages/AuditLogPage"), "Audit Log");
const CashPage = lazyPage(() => import("./pages/CashPage"), "Operasional");
const CashierPage = lazyPage(() => import("./pages/CashierPage"), "Kasir");
const Dashboard = lazyPage(() => import("./pages/Dashboard"), "Dashboard");
const DigitalPage = lazyPage(() => import("./pages/DigitalPage"), "Keuangan Digital");
const FinanceReportPage = lazyPage(() => import("./pages/FinanceReportPage"), "Laporan Keuangan");
const HelpPage = lazyPage(() => import("./pages/HelpPage"), "Bantuan");
const HistoryPage = lazyPage(() => import("./pages/HistoryPage"), "Riwayat Transaksi");
const EmployeeManagementPage = lazyPage(() => import("./pages/EmployeeManagementPage"), "Karyawan");
const ProductHistoryPage = lazyPage(() => import("./pages/ProductHistoryPage"), "History Produk");
const ProductsPage = lazyPage(() => import("./pages/ProductsPage"), "Stok Barang");
const SalesReportPage = lazyPage(() => import("./pages/SalesReportPage"), "Laporan Penjualan");
const ServiceProductsPage = lazyPage(() => import("./pages/ServiceProductsPage"), "Layanan Produk");
const ShiftPage = lazyPage(() => import("./pages/ShiftPage"), "Shift");
const StockOpnamePage = lazyPage(() => import("./pages/StockOpnamePage"), "Stock Opname");
const SupplierReturnsPage = lazyPage(() => import("./pages/SupplierReturnsPage"), "Retur Supplier");
const WalletPage = lazyPage(() => import("./pages/WalletPage"), "Saldo");

const ISOLATION_STORAGE_KEY = "pos_debug_isolation_mode";
const DEFAULT_ISOLATION_MODE = "full";
const ISOLATION_MODES = new Set(["auth-only", "data-static", "data-realtime", "full"]);

function getIsolationMode() {
  if (typeof window === "undefined") return "full";

  const params = new URLSearchParams(window.location.search);
  const requestedMode = params.get("isolate");

  if (requestedMode === "off" || requestedMode === "full") {
    window.localStorage?.removeItem(ISOLATION_STORAGE_KEY);
    return "full";
  }

  if (ISOLATION_MODES.has(requestedMode)) {
    return requestedMode;
  }

  return DEFAULT_ISOLATION_MODE;
}

function MinimalAuthenticatedScreen({ mode, onLogout, user }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--brand-bg)] px-4">
      <div className="brand-panel max-w-md px-8 py-8 text-center">
        <p className="brand-kicker text-[var(--brand-gold)]/90">Debug Isolation</p>
        <h1 className="mt-3 font-display text-2xl font-bold text-slate-950">
          Auth stabil, data layer dimatikan
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Mode: {mode}. User: {user?.email || user?.id || "-"} ({user?.role || "-"}).
        </p>
        <button type="button" className="brand-button-primary mt-6 w-full" onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}

function MinimalDashboardPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--brand-bg)] px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="brand-panel p-8">
          <p className="brand-kicker text-[var(--brand-gold)]/90">Safe Mode</p>
          <h1 className="mt-3 font-display text-3xl font-bold text-slate-950">
            Halo, {user?.name || user?.email || "pengguna"} login berhasil
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            Dashboard shell stabil. Realtime, presence, preload besar, laporan, dan fitur berat
            dimatikan sementara. Aktifkan fitur satu per satu dengan flag isolasi.
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureDisabledPage({ title, message, flagName }) {
  return (
    <div className="min-h-screen bg-[var(--brand-bg)] px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="brand-panel p-8">
          <p className="brand-kicker text-[var(--brand-gold)]/90">Feature Isolation</p>
          <h1 className="mt-3 font-display text-2xl font-bold text-slate-950">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">{message}</p>
          {flagName ? (
            <p className="mt-4 inline-flex rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs font-semibold text-slate-700">
              ?{flagName}=true
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PageBoundary({ label, variant, children }) {
  return (
    <Suspense
      fallback={
        <LoadingState
          text={`Memuat ${label}...`}
          fullScreen={!variant}
          size={120}
          variant={variant || "default"}
        />
      }
    >
      {children}
    </Suspense>
  );
}

function pageElement(Page, label, variant) {
  return (
    <PageBoundary label={label} variant={variant}>
      <Page />
    </PageBoundary>
  );
}

function featureFlagName(featureName) {
  return `enable${featureName.charAt(0).toUpperCase()}${featureName.slice(1)}`;
}

function featureElement(runtimeFlags, featureName, label, element) {
  if (isFeatureEnabled(runtimeFlags, featureName)) {
    return element;
  }

  return (
    <FeatureDisabledPage
      title={`${label} sementara dimatikan`}
      message={`Fitur ${label} sedang disembunyikan oleh runtime flag untuk isolasi atau rollout bertahap.`}
      flagName={featureFlagName(featureName)}
    />
  );
}

function AuthIssuePanel({ title, message, onRetry, onLogout }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--brand-bg)] px-4">
      <div className="brand-panel max-w-sm px-8 py-8 text-center">
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        <div className="mt-5 grid gap-3">
          <button type="button" className="brand-button-primary w-full" onClick={onRetry}>
            Coba Lagi
          </button>
          <button
            type="button"
            className="w-full text-center text-xs font-semibold text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline"
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

function AuthenticatedDataGate() {
  const {
    user,
    authState,
    profileError,
    retryProfileVerification,
    logout,
  } = useAuth();
  const location = useLocation();
  const isolationMode = getIsolationMode();
  const runtimeFlags = getRuntimeFlags();

  if (authState === "checking_session" && !user) {
    return <LoadingState text="Memuat sesi..." fullScreen />;
  }

  if (authState === "verifying_profile" && !user) {
    return <LoadingState text="Memverifikasi profil pengguna..." fullScreen />;
  }

  if (authState === "profile_error") {
    return (
      <AuthIssuePanel
        title="Gagal memverifikasi profil pengguna"
        message={profileError || "Profil pengguna tidak bisa diverifikasi."}
        onRetry={() => {
          void retryProfileVerification().catch((error) => {
            console.error("Retry profile verification failed:", error);
          });
        }}
        onLogout={() => {
          void logout();
        }}
      />
    );
  }

  if (!user) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  if (isolationMode === "auth-only") {
    return (
      <MinimalAuthenticatedScreen
        mode={isolationMode}
        user={user}
        onLogout={() => {
          void logout();
        }}
      />
    );
  }

  const realtimeEnabled =
    isFeatureEnabled(runtimeFlags, "realtime") && isolationMode !== "data-static";
  const presenceEnabled =
    isFeatureEnabled(runtimeFlags, "presence") &&
    isolationMode === "full" &&
    realtimeEnabled;

  return (
    <Suspense fallback={<LoadingState text="Menyiapkan data toko..." fullScreen size={120} />}>
      <DataProvider
        activePath={location.pathname}
        minimalDataMode={runtimeFlags.safeMode || runtimeFlags.minimalDataProvider}
        realtimeEnabled={realtimeEnabled}
      >
        {presenceEnabled ? (
          <EmployeePresenceProvider>
            <Outlet />
          </EmployeePresenceProvider>
        ) : (
          <Outlet />
        )}
      </DataProvider>
    </Suspense>
  );
}

function App() {
  const runtimeFlags = getRuntimeFlags();

  return (
    <BrowserRouter>
      <AppModeProvider>
        <NotificationProvider>
          <AuthProvider>
            <ErrorBoundary>
              <MigrationBanner />
              <ConnectionStatusBanner />
              <Routes>
                <Route path="/" element={<Login />} />

                <Route element={<AuthenticatedDataGate />}>
                  <Route
                    element={
                      <ProtectedRoute allowedRoles={["kasir", "pemilik"]}>
                        <AppShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route
                      path="/shift"
                      element={featureElement(
                        runtimeFlags,
                        "shift",
                        "Shift",
                        pageElement(ShiftPage, "Shift")
                      )}
                    />
                    <Route
                      path="/kasir"
                      element={featureElement(
                        runtimeFlags,
                        "cashier",
                        "Kasir POS",
                        pageElement(CashierPage, "Kasir", "cashier")
                      )}
                    />
                    <Route
                      path="/riwayat-transaksi"
                      element={featureElement(
                        runtimeFlags,
                        "history",
                        "Riwayat Transaksi",
                        pageElement(HistoryPage, "Riwayat Transaksi")
                      )}
                    />
                    <Route path="/kalkulator" element={pageElement(CalculatorPage, "Kalkulator")} />
                    <Route path="/bantuan" element={pageElement(HelpPage, "Bantuan")} />
                    <Route
                      path="/saldo"
                      element={featureElement(
                        runtimeFlags,
                        "wallet",
                        "Saldo",
                        pageElement(WalletPage, "Saldo")
                      )}
                    />
                    <Route
                      path="/stok-barang"
                      element={
                        featureElement(
                          runtimeFlags,
                          "products",
                          "Stok Barang",
                          runtimeFlags.minimalProducts ? (
                          <FeatureDisabledPage
                            title="Stok barang mode ringan"
                            message="Fitur stok barang dimatikan sementara lewat flag minimalProducts untuk isolasi memory leak."
                          />
                        ) : (
                          pageElement(ProductsPage, "Stok Barang")
                          )
                        )
                      }
                    />
                    <Route
                      path="/operasional"
                      element={featureElement(
                        runtimeFlags,
                        "cash",
                        "Operasional",
                        pageElement(CashPage, "Operasional")
                      )}
                    />
                  </Route>

                  <Route
                    element={
                      <ProtectedRoute allowedRoles={["kasir", "pemilik"]}>
                        <AppShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route
                      path="/keuangan"
                      element={featureElement(
                        runtimeFlags,
                        "digital",
                        "Keuangan Digital",
                        pageElement(DigitalPage, "Keuangan Digital")
                      )}
                    />
                  </Route>

                  <Route
                    element={
                      <ProtectedRoute allowedRoles={["pemilik"]}>
                        <AppShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route
                      path="/dashboard"
                      element={
                        runtimeFlags.safeMode || runtimeFlags.minimalDashboard
                          ? <MinimalDashboardPage />
                          : pageElement(Dashboard, "Dashboard", "dashboard")
                      }
                    />
                    <Route
                      path="/karyawan"
                      element={featureElement(
                        runtimeFlags,
                        "employees",
                        "Karyawan",
                        pageElement(EmployeeManagementPage, "Karyawan")
                      )}
                    />
                    <Route
                      path="/laporan-keuangan"
                      element={
                        !isFeatureEnabled(runtimeFlags, "reports") ? (
                          <FeatureDisabledPage
                            title="Laporan sementara dimatikan"
                            message="Fitur laporan dimatikan lewat flag disableReports untuk isolasi halaman berat."
                            flagName="enableReports"
                          />
                        ) : (
                          pageElement(FinanceReportPage, "Laporan Keuangan")
                        )
                      }
                    />
                    <Route
                      path="/laporan-penjualan"
                      element={
                        !isFeatureEnabled(runtimeFlags, "reports") ? (
                          <FeatureDisabledPage
                            title="Laporan sementara dimatikan"
                            message="Fitur laporan dimatikan lewat flag disableReports untuk isolasi halaman berat."
                            flagName="enableReports"
                          />
                        ) : (
                          pageElement(SalesReportPage, "Laporan Penjualan")
                        )
                      }
                    />
                    <Route
                      path="/history-produk"
                      element={featureElement(
                        runtimeFlags,
                        "products",
                        "History Produk",
                        pageElement(ProductHistoryPage, "History Produk")
                      )}
                    />
                    <Route
                      path="/audit-log"
                      element={featureElement(
                        runtimeFlags,
                        "audit",
                        "Audit Log",
                        pageElement(AuditLogPage, "Audit Log")
                      )}
                    />
                    <Route
                      path="/layanan-produk"
                      element={featureElement(
                        runtimeFlags,
                        "serviceProducts",
                        "Layanan Produk",
                        pageElement(ServiceProductsPage, "Layanan Produk")
                      )}
                    />
                    <Route
                      path="/stock-opname"
                      element={featureElement(
                        runtimeFlags,
                        "stockOpname",
                        "Stock Opname",
                        pageElement(StockOpnamePage, "Stock Opname")
                      )}
                    />
                    <Route
                      path="/retur-supplier"
                      element={featureElement(
                        runtimeFlags,
                        "returns",
                        "Retur Supplier",
                        pageElement(SupplierReturnsPage, "Retur Supplier")
                      )}
                    />
                  </Route>

                  <Route path="/layanan" element={<Navigate to="/keuangan" replace />} />
                  <Route path="/kasir/digital" element={<Navigate to="/keuangan" replace />} />
                  <Route path="/dompet" element={<Navigate to="/saldo" replace />} />
                  <Route path="/pos" element={<Navigate to="/kasir" replace />} />
                  <Route path="/produk" element={<Navigate to="/stok-barang" replace />} />
                  <Route path="/kas" element={<Navigate to="/operasional" replace />} />
                  <Route path="/hutang" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/pelanggan" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/retur" element={<Navigate to="/retur-supplier" replace />} />
                  <Route path="/riwayat" element={<Navigate to="/riwayat-transaksi" replace />} />
                </Route>

                <Route path="*" element={<Navigate to={getDefaultRoute("kasir")} replace />} />
              </Routes>
            </ErrorBoundary>
          </AuthProvider>
        </NotificationProvider>
      </AppModeProvider>
    </BrowserRouter>
  );
}

export default App;

