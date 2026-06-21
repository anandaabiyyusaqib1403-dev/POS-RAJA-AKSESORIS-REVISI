export interface TransactionItem {
  id?: string;
  transaksi_id?: string;
  produk_id?: string | null;
  product_id?: string | null;
  nama_produk?: string;
  qty?: number;
  harga_satuan?: number;
  subtotal?: number;
  category?: string;
  provider?: string;
  selling_price?: number;
  cost?: number;
  profit?: number;
  [key: string]: any;
}

export interface AccessoryTransaction {
  id?: string;
  no_transaksi?: string;
  kasir_id?: string | null;
  metode_bayar?: string;
  payments?: Array<{ method: string; amount: number }>;
  total_bayar?: number;
  uang_diterima?: number;
  kembalian?: number;
  shift_id?: string | null;
  status?: string;
  items?: TransactionItem[];
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at?: string;
  [key: string]: any;
}

export interface DigitalTransaction {
  id?: string;
  no_transaksi?: string;
  kasir_id?: string | null;
  jenis?: string;
  category?: string;
  nominal?: number;
  admin_fee?: number;
  total?: number;
  harga_jual?: number;
  modal?: number;
  keuntungan?: number;
  platform_sumber?: string | null;
  payment_method?: string;
  shift_id?: string | null;
  transaction_items?: TransactionItem[];
  transaction_details?: Record<string, any>;
  status?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at?: string;
  [key: string]: any;
}

export interface LogisticsTransaction {
  id?: string;
  type?: string;
  courier?: string;
  ekspedisi?: string;
  sender?: string;
  receiver?: string;
  destination?: string;
  packageType?: string;
  weight?: number;
  price?: number;
  harga_jual?: number;
  modal?: number;
  keuntungan?: number;
  paymentMethod?: string | null;
  payment_method?: string | null;
  shift_id?: string | null;
  status?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at?: string;
  [key: string]: any;
}

export interface CashEntry {
  id?: string;
  jenis?: string;
  kategori?: string;
  nominal?: number;
  keterangan?: string;
  tanggal?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at?: string;
  [key: string]: any;
}

export interface DeletedTransactionRecord {
  id: string;
  source: string;
  transaction_id?: string;
  raw: Record<string, any>;
  deleted_at?: string | null;
  deleted_by?: string | null;
}
