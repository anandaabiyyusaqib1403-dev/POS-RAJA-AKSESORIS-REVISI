import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import BrandMark from "../components/BrandMark";

const menus = {
  kasir: [
    { to: "/kasir", label: "Kasir" },
    { to: "/layanan", label: "Input Layanan" },
    { to: "/logistik", label: "Input Logistik" },
    { to: "/dompet", label: "Dompet Internal" },
    { to: "/kas", label: "Kas" },
  ],
  pemilik: [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/kasir", label: "Kasir" },
    { to: "/layanan", label: "Layanan" },
    { to: "/logistik", label: "Logistik" },
    { to: "/dompet", label: "Dompet Internal" },
    { to: "/kas", label: "Kas" },
    { to: "/produk", label: "Produk" },
  ],
};

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <BrandMark size="md" className="h-12 w-12 shrink-0 sm:h-14 sm:w-14" />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                  Raja Aksesoris
                </p>
                <h1 className="text-lg font-black text-[#1e3a5f] sm:text-xl">POS Counter HP</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="max-w-[220px] rounded-2xl bg-slate-100 px-4 py-2 text-right">
                <p className="truncate text-sm font-semibold text-slate-900">{user.nama}</p>
                <p className="text-xs uppercase tracking-wide text-slate-500">{user.role}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Logout
              </button>
            </div>
          </div>

          <div className="overflow-x-auto pb-1">
            <nav className="flex min-w-max flex-nowrap gap-2">
              {(menus[user.role] || []).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? "bg-[#1e3a5f] text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
