export type ShiftStatus = "active" | "pending" | "approved" | "approved_with_correction" | "flagged";

export interface Shift {
  id?: string;
  cashier_id?: string | null;
  employee_id?: string | null;
  employee_name?: string;
  cashier_station?: string;
  station_code?: string;
  station_name?: string;
  shift_type?: string;
  start_time?: string;
  end_time?: string | null;
  opening_cash?: number;
  total_cash?: number;
  total_digital?: number;
  digital_breakdown?: Record<string, number>;
  total_transactions?: number;
  total_items?: number;
  actual_cash?: number | null;
  expected_cash?: number;
  difference?: number | null;
  notes?: string;
  approval_notes?: string;
  status?: ShiftStatus;
  approved_by?: string | null;
  approved_at?: string | null;
  correction_difference?: number;
  correction_type?: string;
  closed_by?: string | null;
  created_at?: string;
  [key: string]: any;
}
