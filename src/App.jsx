import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { getDefaultRoute } from "./config/navigation";
import { AuthProvider } from "./contexts/AuthContext";
import { DataProvider } from "./contexts/DataContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import AppShell from "./layouts/AppShell";
import CalculatorPage from "./pages/CalculatorPage";
import CashPage from "./pages/CashPage";
import CashierPage from "./pages/CashierPage";
import PelangganPage from "./pages/PelangganPage";
import Dashboard from "./pages/Dashboard";
import DebtsPage from "./pages/DebtsPage";
import DigitalPage from "./pages/DigitalPage";
import FinanceReportPage from "./pages/FinanceReportPage";
import HelpPage from "./pages/HelpPage";
import HistoryPage from "./pages/HistoryPage";
import LogisticsPage from "./pages/LogisticsPage";
import Login from "./pages/Login";
import ProductsPage from "./pages/ProductsPage";
import SalesReportPage from "./pages/SalesReportPage";
import WalletPage from "./pages/WalletPage";

function App() {
  return (
    <BrowserRouter>
      <NotificationProvider>
        <AuthProvider>
          <DataProvider>
            <Routes>
              <Route path="/" element={<Login />} />

              <Route
                element={
                  <ProtectedRoute allowedRoles={["kasir", "pemilik"]}>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route path="/kasir" element={<CashierPage />} />
                <Route path="/riwayat-transaksi" element={<HistoryPage />} />
                <Route path="/kalkulator" element={<CalculatorPage />} />
                <Route path="/bantuan" element={<HelpPage />} />
              </Route>

              <Route
                element={
                  <ProtectedRoute allowedRoles={["pemilik"]}>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/keuangan" element={<DigitalPage />} />
                <Route path="/pelanggan" element={<PelangganPage />} />
                <Route path="/saldo" element={<WalletPage />} />
                <Route path="/stok-barang" element={<ProductsPage />} />
                <Route path="/operasional" element={<CashPage />} />
                <Route path="/hutang" element={<DebtsPage />} />
                <Route path="/laporan-keuangan" element={<FinanceReportPage />} />
                <Route path="/laporan-penjualan" element={<SalesReportPage />} />
                <Route path="/logistik" element={<LogisticsPage />} />
              </Route>

              <Route path="/layanan" element={<Navigate to="/keuangan" replace />} />
              <Route path="/dompet" element={<Navigate to="/saldo" replace />} />
              <Route path="/produk" element={<Navigate to="/stok-barang" replace />} />
              <Route path="/kas" element={<Navigate to="/operasional" replace />} />
              <Route path="/riwayat" element={<Navigate to="/riwayat-transaksi" replace />} />

              <Route path="*" element={<Navigate to={getDefaultRoute("kasir")} replace />} />
            </Routes>
          </DataProvider>
        </AuthProvider>
      </NotificationProvider>
    </BrowserRouter>
  );
}

export default App;
