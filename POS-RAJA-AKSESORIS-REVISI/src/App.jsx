import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { DataProvider } from "./contexts/DataContext";
import AppShell from "./layouts/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CashierPage from "./pages/CashierPage";
import DigitalPage from "./pages/DigitalPage";
import ProductsPage from "./pages/ProductsPage";
import WalletPage from "./pages/WalletPage";
import LogisticsPage from "./pages/LogisticsPage";
import CashPage from "./pages/CashPage";

function App() {
  return (
    <BrowserRouter>
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
              <Route path="/kasir/digital" element={<Navigate to="/layanan" replace />} />
              <Route path="/layanan" element={<DigitalPage />} />
              <Route path="/dompet" element={<WalletPage />} />
              <Route path="/logistik" element={<LogisticsPage />} />
              <Route path="/kas" element={<CashPage />} />
            </Route>
            <Route
              element={
                <ProtectedRoute allowedRoles={["pemilik"]}>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/produk" element={<ProductsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
