export const productCategoryGroups = [
  {
    title: "Layanan Digital",
    slug: "digital",
    categories: ["Pulsa", "Paket Data", "Voucher Fisik", "Token Listrik"],
  },
  {
    title: "Aksesori HP (Fast Moving)",
    slug: "aksesoris-hp",
    categories: ["Charger", "Tempered Glass", "Casing", "Power Bank", "Earphone", "Kabel"],
  },
  {
    title: "Aksesori Pendukung",
    slug: "aksesoris-pendukung",
    categories: [
      
    ],
  },
];

export const allProductCategories = [
  ...new Set(productCategoryGroups.flatMap((group) => group.categories)),
];
