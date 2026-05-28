export type UserRole = "pemilik" | "kasir";
export type TransactionSource = "aksesoris" | "digital" | "logistik" | "saldo" | "operasional";
export type CashFlowDirection = "masuk" | "keluar" | "internal";

export interface Product {
  id: string;
  kode_produk?: string;
  nama: string;
  kategori?: string;
  harga_beli: number;
  harga_jual: number;
  stok: number;
  stok_minimum?: number;
  satuan?: string;
  aktif?: boolean;
  status?: "active" | "inactive" | "deleted" | string;
  supplier?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TransactionItem {
  id?: string;
  produk_id?: string;
  nama_produk?: string;
  qty: number;
  harga_satuan?: number;
  subtotal?: number;
  cost?: number;
  profit?: number;
}

export interface Transaction {
  id: string;
  no_transaksi?: string;
  source?: TransactionSource;
  kasir_id?: string;
  cashier_id?: string;
  shift_id?: string;
  items?: TransactionItem[];
  total_bayar?: number;
  harga_jual?: number;
  modal?: number;
  keuntungan?: number;
  metode_bayar?: string;
  created_at: string;
  catatan?: string;
}

export interface Employee {
  id: string;
  nama: string;
  email?: string;
  role: UserRole;
  status?: string;
  pin_hash?: string;
  created_at?: string;
}

export interface Shift {
  id: string;
  cashier_id: string;
  cashier_name?: string;
  status: "open" | "closed" | "pending" | "flagged" | "approved" | "approved_with_correction" | string;
  start_time: string;
  end_time?: string | null;
  difference?: number;
  digital_breakdown?: Record<string, number>;
}

export interface Wallet {
  id: string;
  name?: string;
  platform?: string;
  balance: number;
  updated_at?: string;
}

export interface AuditLog {
  id: string;
  actor_id?: string;
  actor_name?: string;
  action: string;
  source?: string;
  source_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface Cashflow {
  id: string;
  jenis: "pemasukan" | "pengeluaran";
  kategori?: string;
  nominal: number;
  tanggal: string;
  keterangan?: string;
  created_at?: string;
}

export interface ReturnRecord {
  id: string;
  no_retur?: string;
  status: string;
  supplier_name?: string;
  customer_name?: string;
  total_quantity?: number;
  total_estimated_value?: number;
  total_refund_amount?: number;
  created_at: string;
  items?: Record<string, unknown>[];
}

export interface ReportSummary {
  total_transactions: number;
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  total_qty: number;
  margin: number;
}
