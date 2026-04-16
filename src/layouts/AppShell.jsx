import { NavLink, Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { getRouteMeta, navigationSections } from "../config/navigation";
import { useAuth } from "../contexts/AuthContext";

export default function AppShell() {
  const { user } = useAuth();
  const location = useLocation();

  const meta = getRouteMeta(location.pathname);
  const sections = navigationSections[user.role] || [];
  const mobileItems = sections.flatMap((section) => section.items);
  const todayLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="brand-shell min-h-screen bg-[var(--brand-bg)] lg:grid lg:grid-cols-[290px_minmax(0,1fr)]">
      <Sidebar />

      <div className="min-w-0">
        <header className="z-30 border-b border-[var(--brand-border)] bg-white px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--brand-gold)]/80">
                {todayLabel}
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
                {meta.title}
              </h2>
              <p className="mt-1 text-sm text-slate-600">{meta.description}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="hidden rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-right md:block">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Sistem aktif
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">Light POS Workspace</p>
              </div>

              <div className="rounded-2xl border border-[var(--brand-gold)]/15 bg-[var(--brand-gold)]/10 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--brand-gold)]/80">
                  User aktif
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{user.nama}</p>
              </div>
            </div>
          </div>

          <nav className="brand-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {mobileItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "bg-[var(--brand-gold)] text-slate-950"
                      : "border border-slate-200/80 bg-slate-50 text-slate-600"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
