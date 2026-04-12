import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';

const Riwayat = () => {
  const { transactions } = useData();
  const [search, setSearch] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const filteredTransactions = transactions.filter(t =>
    t.phoneNumber?.includes(search) || t.items.some(item => item.name.includes(search))
  );

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Riwayat Transaksi</h1>
      <input
        type="text"
        placeholder="Cari berdasarkan nomor HP atau produk"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-6 p-2 border rounded w-full"
      />
      <div className="flex">
        <div className="w-1/2 pr-4">
          <div className="bg-white p-6 rounded shadow">
            <h3 className="text-lg font-semibold mb-4">Daftar Transaksi</h3>
            <ul>
              {filteredTransactions.map(t => (
                <li
                  key={t.id}
                  onClick={() => setSelectedTransaction(t)}
                  className="p-2 border-b cursor-pointer hover:bg-gray-100"
                >
                  {new Date(t.date).toLocaleDateString()} - Rp {t.total.toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="w-1/2">
          {selectedTransaction && (
            <div className="bg-white p-6 rounded shadow">
              <h3 className="text-lg font-semibold mb-4">Detail Transaksi</h3>
              <p><strong>Tanggal:</strong> {new Date(selectedTransaction.date).toLocaleString()}</p>
              <p><strong>Total:</strong> Rp {selectedTransaction.total.toLocaleString()}</p>
              <p><strong>Profit:</strong> Rp {selectedTransaction.profit.toLocaleString()}</p>
              <p><strong>Metode:</strong> {selectedTransaction.paymentMethod}</p>
              <p><strong>Nomor HP:</strong> {selectedTransaction.phoneNumber}</p>
              <p><strong>Catatan:</strong> {selectedTransaction.notes}</p>
              <h4 className="mt-4 font-semibold">Items:</h4>
              <ul>
                {selectedTransaction.items.map((item, idx) => (
                  <li key={idx}>{item.name} x{item.qty} - Rp {(item.sellPrice * item.qty).toLocaleString()}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Riwayat;