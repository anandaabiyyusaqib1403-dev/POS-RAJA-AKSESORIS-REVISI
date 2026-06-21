import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const Laporan = () => {
  const { transactions, products } = useData();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filteredTransactions = transactions.filter(t => {
    const date = new Date(t.date);
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    return (!start || date >= start) && (!end || date <= end);
  });

  const totalPenjualan = filteredTransactions.reduce((sum, t) => sum + t.total, 0);
  const totalModal = filteredTransactions.reduce((sum, t) => sum + t.profit + t.total - t.profit, 0); // Wait, profit is total - cost, so cost = total - profit
  const totalProfit = filteredTransactions.reduce((sum, t) => sum + t.profit, 0);

  const exportToExcel = () => {
    const data = filteredTransactions.flatMap(t =>
      t.items.map(item => ({
        Tanggal: new Date(t.date).toLocaleDateString(),
        Produk: item.name,
        Kategori: item.category,
        'Harga Modal': item.costPrice,
        'Harga Jual': item.sellPrice,
        Profit: item.sellPrice - item.costPrice,
        'Metode Pembayaran': t.paymentMethod,
      }))
    );
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(blob, 'laporan.xlsx');
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Laporan</h1>
      <div className="mb-6 flex gap-4">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="p-2 border rounded"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="p-2 border rounded"
        />
        <button onClick={exportToExcel} className="bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700">
          Export Excel
        </button>
      </div>
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded shadow">
          <h3>Total Penjualan</h3>
          <p className="text-2xl font-bold">Rp {totalPenjualan.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <h3>Total Modal</h3>
          <p className="text-2xl font-bold">Rp {totalModal.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <h3>Total Profit</h3>
          <p className="text-2xl font-bold">Rp {totalProfit.toLocaleString()}</p>
        </div>
      </div>
      <div className="bg-white p-6 rounded shadow">
        <h3 className="text-lg font-semibold mb-4">Daftar Transaksi</h3>
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left">Tanggal</th>
              <th>Total</th>
              <th>Profit</th>
              <th>Metode</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map(t => (
              <tr key={t.id}>
                <td>{new Date(t.date).toLocaleDateString()}</td>
                <td>Rp {t.total.toLocaleString()}</td>
                <td>Rp {t.profit.toLocaleString()}</td>
                <td>{t.paymentMethod}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Laporan;