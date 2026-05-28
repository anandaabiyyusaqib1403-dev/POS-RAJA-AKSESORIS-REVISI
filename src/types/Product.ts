export type ProductStatus = "active" | "inactive" | "deleted";

export interface Product {
  id?: string | null;
  kode_produk: string;
  nama: string;
  kategori: string;
  stok: number;
  stok_minimum: number;
  harga_beli: number;
  harga_jual: number;
  satuan: string;
  aktif: boolean;
  status: ProductStatus;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export type ProductRow = Partial<Product> & Record<string, any>;

export interface ProductActivityLog {
  id?: string;
  product_id?: string | null;
  action: string;
  actor_id?: string | null;
  details?: Record<string, any>;
  product_snapshot?: ProductRow | null;
  created_at?: string;
  [key: string]: unknown;
}
