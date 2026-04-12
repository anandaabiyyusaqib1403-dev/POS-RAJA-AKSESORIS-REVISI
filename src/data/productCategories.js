export const productCategoryGroups = [
  {
    title: "Layanan Digital",
    slug: "digital",
    categories: ["Pulsa", "Paket Data", "Voucher Fisik", "Token Listrik"],
  },
  {
    title: "Aksesori HP (Fast Moving)",
    slug: "aksesoris-hp",
    categories: ["Charger", "Tempered Glass", "Casing", "Power Bank", "Earphone"],
  },
  {
    title: "Aksesori Pendukung",
    slug: "aksesoris-pendukung",
    categories: ["Holder HP", "Tongsis", "Memory Card", "Flashdisk OTG", "Waterproof Case"],
  },
  {
    title: "Layanan Transaksi",
    slug: "layanan-tambahan",
    categories: ["Top-up E-Wallet", "Pembayaran Tagihan", "Transfer / Tarik Tunai"],
  },
];

export const allProductCategories = [
  ...new Set(productCategoryGroups.flatMap((group) => group.categories)),
];
