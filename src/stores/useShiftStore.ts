import { create } from "zustand";

type ShiftStore = {
  selectedCashierId: string;
  optimisticActiveShiftId: string | null;
  setSelectedCashierId: (selectedCashierId: string) => void;
  setOptimisticActiveShiftId: (shiftId: string | null) => void;
};

export const useShiftStore = create<ShiftStore>((set) => ({
  selectedCashierId: "",
  optimisticActiveShiftId: null,
  setSelectedCashierId: (selectedCashierId) => set({ selectedCashierId }),
  setOptimisticActiveShiftId: (optimisticActiveShiftId) => set({ optimisticActiveShiftId }),
}));
