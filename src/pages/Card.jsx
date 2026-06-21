import React from 'react';

export const Card = ({ children, title, className = "" }) => (
  <div className={`bg-slate-900 border border-slate-800 rounded-lg shadow-sm overflow-hidden ${className}`}>
    {title && (
      <div className="px-6 py-4 border-b border-slate-800">
        <h3 className="text-lg font-bold text-slate-100">{title}</h3>
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
);