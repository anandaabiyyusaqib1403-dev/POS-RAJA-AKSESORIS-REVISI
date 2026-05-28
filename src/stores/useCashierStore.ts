import { create } from "zustand";

type CartItem = Record<string, any> & {
  id: string;
  qty: number;
  subtotal?: number;
};

type CashierStore = {
  cart: CartItem[];
  paymentMethod: string;
  note: string;
  setCart: (cart: CartItem[]) => void;
  clearCart: () => void;
  setPaymentMethod: (paymentMethod: string) => void;
  setNote: (note: string) => void;
};

export const useCashierStore = create<CashierStore>((set) => ({
  cart: [],
  paymentMethod: "cash",
  note: "",
  setCart: (cart) => set({ cart }),
  clearCart: () => set({ cart: [], note: "" }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setNote: (note) => set({ note }),
}));
