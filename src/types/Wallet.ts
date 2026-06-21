export type WalletTransactionType = "masuk" | "keluar" | "tarik_tunai" | "transfer_antar" | string;

export interface WalletTransaction {
  id?: string;
  platform: string;
  jenis: WalletTransactionType;
  platform_tujuan?: string | null;
  nominal: number;
  biaya_admin: number;
  keterangan?: string;
  source_type?: string;
  source_id?: string | null;
  source_ref?: string;
  balance_before?: number | null;
  balance_after?: number | null;
  reversal_of?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at?: string;
  [key: string]: any;
}

export interface WalletCard {
  id: string;
  name: string;
  type: string;
  balance: number;
}

export interface WalletPlatformSummary {
  platform: string;
  masuk: number;
  keluar: number;
  biaya_admin: number;
  saldo_bersih: number;
}
