export const serviceCategories = [
  { value: "pulsa", label: "Pulsa", mode: "product", shortLabel: "Pulsa" },
  { value: "kuota", label: "Kuota", mode: "product", shortLabel: "Kuota" },
  { value: "token_listrik", label: "PLN", mode: "product", shortLabel: "PLN" },
  { value: "voucher_game", label: "Game", mode: "product", shortLabel: "Game" },
  { value: "transfer_ewallet", label: "E-Wallet", mode: "service", shortLabel: "E-Wallet" },
  { value: "transfer_bank", label: "Transfer", mode: "service", shortLabel: "Transfer" },
  { value: "tagihan", label: "Tagihan", mode: "product", shortLabel: "Tagihan" },
  { value: "tv", label: "TV", mode: "product", shortLabel: "TV" },
  { value: "internet", label: "Internet", mode: "product", shortLabel: "Internet" },
  { value: "multifinance", label: "Multifinance", mode: "product", shortLabel: "Multifinance" },
];

export const productServiceCategoryIds = serviceCategories
  .filter((category) => category.mode === "product")
  .map((category) => category.value);

// Dynamic only - no hardcoded fallback
export const defaultServiceProducts = [];
