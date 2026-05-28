import { productCategoryGroups } from "../../../data/productCategories";

const accessoryCategoryOrder = productCategoryGroups
  .filter((group) => !["digital"].includes(group.slug))
  .flatMap((group) => group.categories);

export function getProductDisplayName(product) {
  return String(product?.nama || "").trim() || "Produk";
}

export function getProductBrand(product) {
  const explicitBrand = String(product?.brand || product?.provider || "").trim();
  if (explicitBrand) return explicitBrand;

  const name = getProductDisplayName(product);
  const firstToken = name.split(/\s+/)[0] || "";
  if (firstToken.length >= 3) {
    return firstToken.toUpperCase();
  }

  return String(product?.kategori || "Produk").trim();
}

export function getStockDisplay(product) {
  const stock = Number(product?.stok || 0);
  const minimum = Number(product?.stok_minimum || 0);

  if (stock <= 0) {
    return {
      label: "Stok habis",
      className: "brand-badge-danger",
    };
  }

  if (stock <= minimum) {
    return {
      label: `Stok ${stock}`,
      className: "brand-badge-warning",
    };
  }

  return {
    label: `Stok ${stock}`,
    className: "brand-badge-neutral",
  };
}

export function getCartUnavailableMessage(reason) {
  if (reason === "out_of_stock") return "Stok Habis";
  if (reason === "deleted") return "Produk tidak tersedia";
  return "";
}

export function buildCashierCategoryOptions(activeProducts) {
  const grouped = [...new Set(activeProducts.map((product) => product.kategori).filter(Boolean))];

  const ordered = grouped.sort((left, right) => {
    const leftIndex = accessoryCategoryOrder.indexOf(left);
    const rightIndex = accessoryCategoryOrder.indexOf(right);

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });

  return [
    {
      value: "semua",
      label: "Semua",
      count: activeProducts.length,
    },
    ...ordered.map((category) => ({
      value: category,
      label: category,
      count: activeProducts.filter((product) => product.kategori === category).length,
    })),
  ];
}
