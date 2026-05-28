import { create } from "zustand";

type WalletStore = {
  selectedPlatform: string;
  pendingTransferDraft: Record<string, any> | null;
  setSelectedPlatform: (selectedPlatform: string) => void;
  setPendingTransferDraft: (pendingTransferDraft: Record<string, any> | null) => void;
};

export const useWalletStore = create<WalletStore>((set) => ({
  selectedPlatform: "cash",
  pendingTransferDraft: null,
  setSelectedPlatform: (selectedPlatform) => set({ selectedPlatform }),
  setPendingTransferDraft: (pendingTransferDraft) => set({ pendingTransferDraft }),
}));
