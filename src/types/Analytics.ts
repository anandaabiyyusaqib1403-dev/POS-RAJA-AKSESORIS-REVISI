export interface DateRangeInput {
  startDate: string | Date;
  endDate: string | Date;
}

export interface TrendPoint {
  key: string;
  label: string;
  omzet: number;
  laba_bersih: number;
  pengeluaran: number;
}
