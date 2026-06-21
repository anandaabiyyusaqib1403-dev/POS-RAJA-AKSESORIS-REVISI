import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import {
  buildNavigationSections,
  getDefaultRoute,
  normalizePathname,
} from "../core/navigation/navigation";
import { getRuntimeFlags, isFeatureEnabled } from "../core/runtime/runtimeFlags";
import AppIcon from "./app/AppIcon";
import BrandMark from "./BrandMark";

function getPathname(to) {
  return normalizePathname(to);
}

function getHash(to) {
  const hash = String(to || "").split("#")[1];
  return hash ? `#${hash}` : "";
}

function SidebarLink({ item, collapsed, onNavigate }) {
  const location = useLocation();
  const itemPathname = getPathname(item.to);
  const currentPathname = normalizePathname(location.pathname);
  const isParentActive = currentPathname === itemPathname;
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;

  return (
    <div>
      <NavLink
        to={item.to}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          `group relative block rounded-lg transition ${
            isActive || isParentActive
              ? "bg-[var(--surface-selected)] text-slate-950"
              : "text-slate-600 hover:bg-[var(--surface-hover)] hover:text-slate-950"
          }`
        }
      >
        {({ isActive }) => {
          const active = isActive || isParentActive;

          return (
            <div className={`flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-3"} py-2.5 text-sm font-semibold`}>
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
                  active
                    ? "border-[rgba(212,175,55,0.22)] bg-[var(--brand-gold)] text-slate-950 shadow-[0_8px_18px_rgba(212,175,55,0.18)]"
                    : "border-slate-200 bg-white text-slate-500 group-hover:border-[rgba(212,175,55,0.2)] group-hover:text-slate-950"
                }`}
              >
                <AppIcon name={item.icon} className="h-4.5 w-4.5" />
              </span>
              {!collapsed ? (
                <>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {hasChildren ? (
                    <AppIcon
                      name="chevron"
                      className={`h-4 w-4 transition ${isParentActive ? "rotate-90 text-slate-900" : "text-slate-300 group-hover:text-slate-500"}`}
                    />
                  ) : null}
                </>
              ) : null}
              {active ? <span className="absolute left-0 top-2 h-8 w-1 rounded-r-full bg-[var(--brand-gold)]" /> : null}
            </div>
          );
        }}
      </NavLink>

      {hasChildren && isParentActive && !collapsed ? (
        <div className="ml-12 mt-1 space-y-1 border-l border-slate-200 pl-3">
          {item.children.map((child) => {
            const isChildActive =
              currentPathname === getPathname(child.to) &&
              location.hash === getHash(child.to);

            return (
              <NavLink
                key={child.to}
                to={child.to}
                onClick={onNavigate}
                className={`block rounded-md px-3 py-2 text-xs font-semibold transition ${
                  isChildActive
                    ? "bg-[var(--surface-selected)] text-slate-950"
                    : "text-slate-500 hover:bg-[var(--surface-hover)] hover:text-slate-900"
                }`}
              >
                {child.label}
              </NavLink>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function Sidebar({
  collapsed = false,
  mode = "desktop",
  onNavigate,
  onToggle,
}) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const runtimeFlags = getRuntimeFlags();
  const sections = buildNavigationSections(user.role, runtimeFlags, user.permissions);
  const quickActions = [
    { to: "/kasir", label: "POS", icon: "pos", feature: "cashier" },
    { to: "/keuangan", label: "Digital", icon: "wallet", feature: "digital" },
    { to: "/stok-barang#tambah-kelola", label: "Stok", icon: "box", feature: "products" },
  ].filter((action) => isFeatureEnabled(runtimeFlags, action.feature));
  const isMobile = mode === "mobile";

  return (
    <aside
      className={[
        "brand-sidebar brand-scrollbar h-full min-h-screen overflow-y-auto px-3 py-4 transition-[width] duration-200",
        isMobile ? "block w-[min(86vw,340px)]" : "hidden lg:sticky lg:top-0 lg:block lg:h-[100dvh] lg:min-h-0 lg:self-start",
        !isMobile && (collapsed ? "lg:w-[92px]" : "lg:w-[290px]"),
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex min-h-full flex-col">
        <div className={`flex items-center ${collapsed && !isMobile ? "justify-center" : "justify-between"} gap-3 rounded-lg border border-[var(--border-muted)] bg-white p-3 shadow-[var(--shadow-soft)]`}>
          <button
            type="button"
            onClick={() => {
              navigate(getDefaultRoute(user.role));
              onNavigate?.();
            }}
            className="flex min-w-0 items-center gap-3 text-left"
            aria-label="Ke dashboard utama"
          >
            <span className="rounded-lg border border-[var(--brand-gold)]/20 bg-[var(--brand-gold)]/10 p-2">
              <BrandMark size="md" className="h-9 w-9" />
            </span>
            {(!collapsed || isMobile) ? (
              <span className="min-w-0">
                <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--brand-gold-strong)]">
                  Raja Aksesoris
                </span>
                <span className="mt-1 block truncate text-sm font-extrabold tracking-tight text-slate-950">
                  Command Center
                </span>
              </span>
            ) : null}
          </button>

          {!isMobile && onToggle ? (
            <button
              type="button"
              aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
              onClick={onToggle}
              className="brand-icon-button brand-icon-button-sm brand-icon-button-muted"
            >
              <AppIcon name={collapsed ? "expand" : "collapse"} className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {(!collapsed || isMobile) ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {quickActions.map((action) => (
              <NavLink
                key={action.to}
                to={action.to}
                onClick={onNavigate}
                className="flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-lg border border-[var(--border-muted)] bg-[var(--surface-secondary)] text-xs font-bold text-slate-600 transition hover:-translate-y-px hover:border-[rgba(212,175,55,0.3)] hover:bg-[var(--surface-hover)] hover:text-slate-950"
              >
                <AppIcon name={action.icon} className="h-4 w-4" />
                {action.label}
              </NavLink>
            ))}
          </div>
        ) : null}

        <nav className="mt-5 flex-1 space-y-5" aria-label="Navigasi utama">
          {sections.map((section) => (
            <div key={section.title}>
              {(!collapsed || isMobile) ? (
                <p className="px-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  {section.title}
                </p>
              ) : null}
              <div className="mt-2 space-y-1">
                {section.items.map((item) => (
                  <SidebarLink
                    key={item.to}
                    item={item}
                    collapsed={collapsed && !isMobile}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-5 space-y-3 border-t border-[var(--border-muted)] pt-4">
          {(!collapsed || isMobile) ? (
            <div className="rounded-lg border border-[var(--border-muted)] bg-[var(--surface-secondary)] p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Login sebagai
              </p>
              <p className="mt-2 truncate text-sm font-bold text-slate-950">{user.nama}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="brand-badge">
                  {user.role === "pemilik" ? "Owner" : "Kasir"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigate(getDefaultRoute(user.role));
                    onNavigate?.();
                  }}
                  className="text-xs font-semibold text-slate-700 transition hover:text-slate-950"
                >
                  Home
                </button>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate("/");
              onNavigate?.();
            }}
            className={`brand-button-secondary w-full ${collapsed && !isMobile ? "px-0" : "gap-2"}`}
            aria-label="Logout"
          >
            <AppIcon name="logout" className="h-4 w-4" />
            {(!collapsed || isMobile) ? "Logout" : null}
          </button>
        </div>
      </div>
    </aside>
  );
}
