-- 20241002_shift_system.sql
-- POS Raja Aksesoris: Opening & Closing Shift Management

create extension if not exists pgcrypto;

-- Enums
do $$
begin
  create type public.shift_status as enum ('active', 'pending_close', 'closed', 'approved', 'flagged');
exception
  when duplicate_object then null;
end $$;

-- Shifts table
CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id UUID NOT NULL REFERENCES public.users(id),
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  opening_cash INTEGER DEFAULT 0 CHECK (opening_cash >= 0),
  total_transactions INTEGER DEFAULT 0 CHECK (total_transactions >= 0),
  total_cash INTEGER DEFAULT 0 CHECK (total_cash >= 0),
  total_digital INTEGER DEFAULT 0 CHECK (total_digital >= 0),
  total_items INTEGER DEFAULT 0 CHECK (total_items >= 0),
  expected_cash INTEGER GENERATED ALWAYS AS (total_cash) STORED,
  actual_cash INTEGER CHECK (actual_cash >= 0),
  difference INTEGER GENERATED ALWAYS AS (
    COALESCE(actual_cash, 0) - total_cash
  ) STORED,
  notes TEXT,
  status public.shift_status NOT NULL DEFAULT 'active',
  approved_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_shift_per_cashier ON public.shifts(cashier_id)
WHERE status = 'active'::public.shift_status;
CREATE INDEX IF NOT EXISTS idx_shift_cashier_time ON public.shifts(cashier_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_shift_status ON public.shifts(status);

-- RLS Policies
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- Cashier can manage own shifts
DROP POLICY IF EXISTS "cashier_manage_own_shifts" ON public.shifts;
CREATE POLICY "cashier_manage_own_shifts" ON public.shifts
FOR ALL TO authenticated
USING (cashier_id = auth.uid())
WITH CHECK (cashier_id = auth.uid());

-- Owner can manage all shifts
DROP POLICY IF EXISTS "owner_manage_all_shifts" ON public.shifts;
CREATE POLICY "owner_manage_all_shifts" ON public.shifts
FOR ALL TO authenticated
USING (public.current_user_role() = 'pemilik')
WITH CHECK (public.current_user_role() = 'pemilik');

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_shifts_updated_at ON public.shifts;
CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON public.shifts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View: Current shift per cashier
CREATE OR REPLACE VIEW public.current_shifts
WITH (security_invoker = true)
AS
SELECT cashier_id, id, start_time, status 
FROM public.shifts 
WHERE status = 'active'::public.shift_status;

-- Function: Get current shift ID for cashier
CREATE OR REPLACE FUNCTION public.get_current_shift_id(cashier_uuid UUID)
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT id FROM public.current_shifts WHERE cashier_id = cashier_uuid);
END;
$$ LANGUAGE plpgsql STABLE;

-- Ensure only one active shift per cashier (constraint)
CREATE OR REPLACE FUNCTION public.check_single_active_shift()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.shifts 
    WHERE cashier_id = NEW.cashier_id 
    AND status = 'active'::public.shift_status
    AND id != NEW.id
  ) THEN
    RAISE EXCEPTION 'Cashier sudah memiliki shift aktif. Tutup shift lama terlebih dahulu.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_single_active_shift ON public.shifts;
CREATE TRIGGER trg_single_active_shift
BEFORE INSERT OR UPDATE OF status ON public.shifts
FOR EACH ROW WHEN (NEW.status = 'active'::public.shift_status)
EXECUTE FUNCTION public.check_single_active_shift();

-- Link transactions to current shift (view)
DROP VIEW IF EXISTS public.shift_reports;
DROP VIEW IF EXISTS public.shift_transactions;
CREATE OR REPLACE VIEW public.shift_transactions
WITH (security_invoker = true)
AS
SELECT 
  s.id as shift_id,
  s.cashier_id,
  s.start_time,
  s.status as shift_status,
  t.id,
  t.kasir_id,
  t.no_transaksi,
  t.total_bayar,
  t.uang_diterima,
  t.kembalian,
  t.metode_bayar,
  t.catatan,
  t.created_at
FROM public.shifts s
JOIN public.transaksi t ON t.created_at >= s.start_time AND t.created_at < COALESCE(s.end_time, now())
WHERE s.status = 'active'::public.shift_status;

-- Shift report view
DROP VIEW IF EXISTS public.shift_reports;
CREATE OR REPLACE VIEW public.shift_reports
WITH (security_invoker = true)
AS
SELECT 
  s.*,
  COUNT(t.id)::INTEGER as system_transactions,
  SUM(CASE WHEN t.metode_bayar = 'cash' OR t.metode_bayar = 'tunai' THEN t.total_bayar ELSE 0 END)::INTEGER as system_cash_total,
  SUM(CASE WHEN t.metode_bayar != 'cash' AND t.metode_bayar != 'tunai' THEN t.total_bayar ELSE 0 END)::INTEGER as system_digital,
  SUM(
    COALESCE(it.qty, 0)
  )::INTEGER as system_items
FROM public.shifts s
LEFT JOIN public.shift_transactions t ON t.shift_id = s.id
LEFT JOIN public.item_transaksi it ON it.transaksi_id = t.id
GROUP BY s.id
ORDER BY s.start_time DESC;

COMMENT ON TABLE public.shifts IS 'Shift management untuk kasir dengan opening cash 0 otomatis, time restrictions, dan owner approval';
