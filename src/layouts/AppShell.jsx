import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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

const pageMeta = {
  "/dashboard": {
    eyebrow: "Control Center",
    title: "Dashboard bisnis toko",
    description:
      "Pantau omzet, margin, cashflow, dan laporan operasional tanpa perlu pindah-pindah halaman.",
  },
  "/kasir": {
    eyebrow: "Point Of Sale",
    title: "Kasir aksesoris yang lebih fokus",
    description:
      "Alur scan produk, cek stok, atur keranjang, dan selesaikan pembayaran dibuat lebih ringkas dan gampang dibaca.",
  },
  "/layanan": {
    eyebrow: "Service Desk",
    title: "Input layanan digital",
    description:
      "Catat transaksi pulsa, kuota, voucher, token, dan pembayaran lain dengan struktur yang tetap cepat dipakai kasir.",
  },
  "/logistik": {
    eyebrow: "Shipment Counter",
    title: "Input transaksi logistik",
    description:
      "Pantau pengiriman, margin ekspedisi, dan nomor resi dari satu area kerja yang lebih rapi.",
  },
  "/dompet": {
    eyebrow: "Internal Wallet",
    title: "Kontrol saldo dompet internal",
    description:
      "Lihat arus dana antar platform dengan layout yang lebih bersih untuk pencatatan harian.",
  },
  "/kas": {
    eyebrow: "Cash Control",
    title: "Rekap kas harian toko",
    description:
      "Masuk, keluar, saldo awal, dan catatan kas tetap mudah dipantau tanpa bikin layar terasa penuh.",
  },
  "/produk": {
    eyebrow: "Catalog Manager",
    title: "Manajemen produk toko",
    description:
      "Kelola data produk, kategori, dan stok dengan struktur visual yang lebih konsisten dengan modul lain.",
  },
  default: {
    eyebrow: "Raja Aksesoris",
    title: "Sistem operasional toko",
    description:
      "Satu workspace untuk kasir, layanan digital, dompet internal, logistik, dan laporan toko.",
  },
};

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const activeMeta = pageMeta[location.pathname] || pageMeta.default;
  const activeMenus = menus[user.role] || [];
  const todayLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen pb-8">
      <header className="sticky top-0 z-30 px-4 pt-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="app-panel-dark overflow-hidden px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="rounded-[24px] border border-white/15 bg-white/10 p-2.5 backdrop-blur">
                    <BrandMark size="md" className="h-12 w-12 shrink-0 sm:h-14 sm:w-14" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-sky-100/70">
                      Raja Aksesoris
                    </p>
                    <h1 className="mt-2 font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
                      POS Counter HP
                    </h1>
                    <p className="mt-1 text-sm text-sky-50/80">
                      Workspace operasional untuk kasir dan owner.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <div className="rounded-[24px] border border-white/15 bg-white/10 px-4 py-3 text-right backdrop-blur">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-100/70">
                      {user.role === "pemilik" ? "Owner Access" : "Cashier Access"}
                    </p>
                    <p className="mt-1 max-w-[220px] truncate text-sm font-semibold text-white">
                      {user.nama}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/18"
                  >
                    Logout
                  </button>
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-sky-100/70">
                      {activeMeta.eyebrow}
                    </p>
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-sky-50/90">
                      {todayLabel}
                    </span>
                  </div>
                  <h2 className="mt-3 max-w-3xl font-display text-2xl font-bold tracking-tight text-white sm:text-[2rem]">
                    {activeMeta.title}
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-sky-50/82 sm:text-[15px]">
                    {activeMeta.description}
                  </p>
                </div>

                <nav className="app-scrollbar -mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 xl:justify-end">
                  {activeMenus.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                          isActive
                            ? "bg-white text-[#173a60] shadow-lg shadow-slate-950/10"
                            : "bg-white/10 text-white/88 hover:bg-white/16"
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
