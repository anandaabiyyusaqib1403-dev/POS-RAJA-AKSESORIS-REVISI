import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getDefaultRoute, navigationSections } from "../config/navigation";
import AppIcon from "./app/AppIcon";
import Panel from "./app/Panel";
import BrandMark from "./BrandMark";

function SidebarLink({ item }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
          isActive
            ? "bg-[var(--brand-gold)] text-slate-950 shadow-[0_4px_12px_rgba(212,175,55,0.2)]"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
        }`
      }
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${(() => {
        // This will be handled by the parent className
        return '';
      })()}`}>
        <AppIcon name={item.icon} className="h-4.5 w-4.5" />
      </span>
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const sections = navigationSections[user.role] || [];

  return (
    <aside className="brand-sidebar brand-scrollbar hidden h-screen min-h-screen overflow-y-auto px-5 py-6 lg:block lg:sticky lg:top-0 lg:w-[290px]">
      <div className="flex h-full flex-col">
        <Panel variant="strong" className="p-4">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl border border-[var(--brand-gold)]/20 bg-[var(--brand-gold)]/10 p-2">
              <BrandMark size="md" className="h-12 w-12" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--brand-gold)]/80">
                Raja Aksesoris
              </p>
              <h1 className="mt-2 font-display text-lg font-bold tracking-tight text-slate-950">
                Raja Aksesoris
              </h1>
              <p className="mt-1 text-xs text-slate-600">Counter operasional modern</p>
            </div>
          </div>
        </Panel>

        <div className="mt-6 flex-1 space-y-6">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                {section.title}
              </p>
              <div className="mt-3 space-y-2">
                {section.items.map((item) => (
                  <SidebarLink key={item.to} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          <Panel className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Login sebagai
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-950">{user.nama}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="rounded-full bg-[var(--brand-gold)]/14 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--brand-gold)]">
                {user.role === "pemilik" ? "Owner" : "Kasir"}
              </span>
              <button
                type="button"
                onClick={() => navigate(getDefaultRoute(user.role))}
                className="text-xs font-semibold text-slate-700 transition hover:text-slate-950"
              >
                Home
              </button>
            </div>
          </Panel>

          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate("/");
            }}
            className="brand-button-secondary w-full gap-2"
          >
            <AppIcon name="logout" className="h-4 w-4" />
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
