import React from "react";
import { Outlet, NavLink } from "react-router-dom";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: "📊" },
  { to: "/pos", label: "Kasir (POS)", icon: "🛒" },
  { to: "/produk", label: "Produk", icon: "📦" },
  { to: "/laporan", label: "Laporan", icon: "📋" },
];

export default function MainLayout() {
  return (
    <div className="flex min-h-screen bg-black text-slate-300">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 sticky top-0 h-screen hidden md:flex flex-col">
        <div className="p-8">
          <h1 className="text-[#D4AF37] font-black text-xl tracking-tighter uppercase">Raja Aksesoris</h1>
          <p className="text-[10px] text-slate-500 tracking-[0.2em] mt-1">POS SYSTEM PREMIUM</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive 
                    ? "bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 shadow-[0_0_15px_rgba(212,175,55,0.1)]" 
                    : "hover:bg-slate-900 text-slate-400"
                }`
              }
            >
              <span>{item.icon}</span>
              <span className="font-semibold text-sm">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-6 border-t border-slate-800">
          <button className="w-full text-left text-sm text-red-400 hover:text-red-300 transition">Logout</button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 h-screen overflow-y-auto overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}