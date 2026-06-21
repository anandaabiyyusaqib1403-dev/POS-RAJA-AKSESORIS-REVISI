// src/components/ui/Table.jsx
import React from 'react';

const Table = ({ children, className = '' }) => (
  <div className="overflow-x-auto">
    <table className={`min-w-full divide-y divide-neutral-200 ${className}`}>
      {children}
    </table>
  </div>
);

const TableHeader = ({ children }) => (
  <thead className="bg-neutral-50">
    {children}
  </thead>
);

const TableBody = ({ children }) => (
  <tbody className="bg-white divide-y divide-neutral-200">
    {children}
  </tbody>
);

const TableRow = ({ children, className = '' }) => (
  <tr className={`hover:bg-neutral-50 ${className}`}>
    {children}
  </tr>
);

const TableHead = ({ children, className = '' }) => (
  <th className={`px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider ${className}`}>
    {children}
  </th>
);

const TableCell = ({ children, className = '' }) => (
  <td className={`px-6 py-4 whitespace-nowrap text-sm text-neutral-900 ${className}`}>
    {children}
  </td>
);

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };