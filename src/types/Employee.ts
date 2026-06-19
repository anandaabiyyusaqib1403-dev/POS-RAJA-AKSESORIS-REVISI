export interface StaffUser {
  id?: string;
  nama: string;
  email?: string;
  username?: string;
  phone?: string;
  role: string;
  cashier_station?: string;
  station_code?: string;
  station_name?: string;
  status?: string;
  pin_hash?: string | null;
  base_salary?: number;
  default_bonus?: number;
  default_deduction?: number;
  last_login?: string | null;
  last_device?: string;
  archived_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
}

export interface EmployeePayroll {
  id?: string;
  employee_id?: string;
  period_month?: string;
  base_salary?: number;
  bonus?: number;
  deduction?: number;
  status?: string;
  notes?: string;
  paid_at?: string | null;
  paid_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
}

export interface AppSetting {
  key: string;
  value: Record<string, any>;
  updated_by?: string | null;
  updated_at?: string | null;
}
