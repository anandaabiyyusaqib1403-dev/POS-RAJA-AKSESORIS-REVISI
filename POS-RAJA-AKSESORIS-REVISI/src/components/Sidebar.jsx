// src/components/Sidebar.jsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Sidebar = ({ userRole = 'owner' }) => {
  const location = useLocation();
  
  const ownerMenu = [
    { name: 'Dashboard', path: '/dashboard', icon: '📊' },
    { name: 'POS', path: '/pos', icon: '🛒' },
    { name: 'Produk', path: '/produk', icon: '📦' },
    { name: 'Laporan', path: '/laporan', icon: '📈' },
    { name: 'Riwayat', path: '/riwayat', icon: '📋' },
    { name: 'Customer', path: '/customer', icon: '👥' },
    { name: 'Setting', path: '/setting', icon: '⚙️' },
  ];
  
  const kasirMenu = [
    { name: 'POS', path: '/pos', icon: '🛒' },
    { name: 'Riwayat', path: '/riwayat', icon: '📋' },
  ];
  
  const menu = userRole === 'kasir' ? kasirMenu : ownerMenu;
  
  return (
    <div className="w-64 bg-white shadow-soft h-full">
      <div className="p-6">
        <h2 className="text-xl font-bold text-neutral-900">Raja Aksesoris</h2>
      </div>
      <nav className="px-4">
        <ul className="space-y-2">
          {menu.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={`flex items-center px-4 py-3 rounded-2xl transition-colors ${
                  location.pathname === item.path
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <span className="mr-3">{item.icon}</span>
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;