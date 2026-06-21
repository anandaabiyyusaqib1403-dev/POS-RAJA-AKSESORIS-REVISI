import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import AppIcon from "../components/app/AppIcon";
import {
  buildNavigationSections,
  getRouteMeta,
  normalizePathname,
} from "../core/navigation/navigation";
import { getRuntimeFlags } from "../core/runtime/runtimeFlags";
import { useAuth } from "../contexts/useAuth";

function getPathname(to) {
  return normalizePathname(to);
}

function getHash(to) {
  const hash = String(to || "").split("#")[1];
  return hash ? `#${hash}` : "";
}

const mobilePrimaryRoutes = {
  pemilik: ["/dashboard", "/kasir", "/stok-barang", "/karyawan", "/laporan-keuangan"],
  kasir: ["/kasir", "/keuangan", "/shift", "/stok-barang", "/riwayat-transaksi"],
};

export default function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const meta = getRouteMeta(location.pathname);
  const sections = buildNavigationSections(user.role, getRuntimeFlags(), user.permissions);
  const currentPathname = normalizePathname(location.pathname);
  const mobileItems = sections.flatMap((section) =>
    section.items.flatMap((item) => [item, ...(item.children || [])])
  );
  const primaryRoutes = mobilePrimaryRoutes[user.role] || [];
  const mobilePrimaryItems = primaryRoutes
    .map((route) => mobileItems.find((item) => getPathname(item.to) === route))
    .filter(Boolean);
  const mobileSecondaryItems = mobileItems.filter(
    (item) => !primaryRoutes.includes(getPathname(item.to))
  );
  const todayLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div
      data-role={user.role}
      className={`brand-shell min-h-screen bg-[var(--brand-bg)] lg:grid ${
        sidebarCollapsed ? "lg:grid-cols-[92px_minmax(0,1fr)]" : "lg:grid-cols-[290px_minmax(0,1fr)]"
      }`}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
      />

      <div className="min-w-0 overflow-x-clip">
        <header className="sticky top-0 z-30 border-b border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <button
                type="button"
                className="brand-icon-button brand-icon-button-md brand-icon-button-muted shrink-0 lg:hidden"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Buka menu"
              >
                <AppIcon name="menu" className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">{todayLabel}</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                  {meta.title}
                </h2>
                <p className="mt-1 text-sm text-slate-600">{meta.description}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-slate-500">User aktif:</span>
                <span className="font-semibold text-slate-950">{user.nama}</span>
              </div>
            </div>
          </div>

          <nav className="mt-4 flex items-start gap-2 lg:hidden">
            <div className="brand-scroll-region brand-scrollbar flex flex-1 gap-2 overflow-x-auto pb-1">
              {mobilePrimaryItems.map((item) => {
                const itemHash = getHash(item.to);
                const isActive =
                  currentPathname === getPathname(item.to) &&
                  (itemHash ? location.hash === itemHash : true);

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? "bg-[var(--brand-gold)]/14 text-slate-950"
                        : "border border-slate-200/80 bg-slate-50 text-slate-600"
                    }`}
                  >
                    {item.label}
                  </NavLink>
                );
              })}
            </div>

            {mobileSecondaryItems.length ? (
              <details className="relative shrink-0">
                <summary className="list-none rounded-md border border-slate-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                  Menu
                </summary>
                <div className="brand-scroll-region brand-scrollbar absolute right-0 z-40 mt-2 max-h-[60vh] w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                  {mobileSecondaryItems.map((item) => {
                    const itemHash = getHash(item.to);
                    const isActive =
                      currentPathname === getPathname(item.to) &&
                      (itemHash ? location.hash === itemHash : true);

                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={`block rounded-md px-3 py-2 text-sm font-semibold ${
                          isActive
                            ? "bg-[var(--brand-gold)]/14 text-slate-950"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                        }`}
                      >
                        {item.label}
                      </NavLink>
                    );
                  })}
                </div>
              </details>
            ) : null}
          </nav>
        </header>

        <main className="mx-auto min-w-0 max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      {mobileSidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button
            type="button"
            aria-label="Tutup menu"
            className="absolute inset-0 bg-slate-950/35"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0">
            <Sidebar mode="mobile" onNavigate={() => setMobileSidebarOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

