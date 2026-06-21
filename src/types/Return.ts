export interface SupplierReturnItem {
  id?: string;
  supplier_return_id?: string;
  product_id?: string | null;
  product_name?: string;
  product_code?: string;
  category?: string;
  quantity?: number;
  unit_cost?: number;
  subtotal_cost?: number;
  condition?: string;
  notes?: string;
  [key: string]: any;
}

export interface CustomerReturnItem {
  id?: string;
  customer_return_id?: string;
  transaction_item_id?: string | null;
  product_id?: string | null;
  product_name?: string;
  product_code?: string;
  category?: string;
  quantity?: number;
  unit_price?: number;
  subtotal_refund?: number;
  restock?: boolean;
  condition?: string;
  notes?: string;
  [key: string]: any;
}

export interface SupplierReturn {
  id?: string;
  no_retur?: string;
  supplier_id?: string | null;
  supplier_name?: string;
  status?: string;
  reason?: string;
  condition?: string;
  notes?: string;
  total_quantity?: number;
  total_estimated_value?: number;
  settlement_amount?: number;
  settlement_method?: string;
  settlement_notes?: string;
  completed_at?: string | null;
  items?: SupplierReturnItem[];
  [key: string]: any;
}

export interface CustomerReturn {
  id?: string;
  no_retur?: string;
  transaction_id?: string | null;
  transaction_no?: string;
  customer_name?: string;
  status?: string;
  reason?: string;
  condition?: string;
  notes?: string;
  total_quantity?: number;
  total_refund_amount?: number;
  refund_method?: string;
  restock?: boolean;
  items?: CustomerReturnItem[];
  [key: string]: any;
}
