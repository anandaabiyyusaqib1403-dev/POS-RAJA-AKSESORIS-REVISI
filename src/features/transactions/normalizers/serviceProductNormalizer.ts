import { serviceCategories } from "../../../data/serviceProducts";
import {
  normalizeServiceCategory,
  toSafeInteger,
} from "../../../core/normalizers/shared";

export function getServiceProductKey(product: Record<string, any>) {
  return [
    normalizeServiceCategory(product.category),
    String(product.provider || "").trim().toLowerCase(),
    String(product.service_type || product.serviceType || "").trim().toLowerCase(),
    String(product.name || "").trim().toLowerCase(),
  ].join("|");
}

export function findServiceProductByIdOrKey(
  products: Record<string, any>[],
  id: string,
  referenceProduct: Record<string, any> | null = null
) {
  const items = Array.isArray(products) ? products : [];
  const byId = items.find((item) => item.id === id);
  if (byId) return byId;
  if (!referenceProduct) return null;

  const referenceKey = getServiceProductKey(referenceProduct);
  return items.find((item) => getServiceProductKey(item) === referenceKey) || null;
}

export function normalizeServiceProduct(product: Record<string, any>) {
  const category = normalizeServiceCategory(product.category);
  const provider = String(product.provider || product.type || "").trim();
  const serviceType = String(
    product.service_type ||
      product.serviceType ||
      product.jenis_layanan ||
      product.jenis ||
      ""
  ).trim();
  const active =
    typeof product.active === "boolean"
      ? product.active
      : String(product.status || "active").toLowerCase() !== "inactive";

  return {
    ...product,
    id: product.id || null,
    name: String(product.name || "").trim(),
    category,
    provider,
    type: provider,
    service_type: serviceType,
    serviceType,
    cost: Math.max(0, toSafeInteger(product.cost || 0)),
    default_price:
      product.default_price === null || product.default_price === undefined || product.default_price === ""
        ? null
        : Math.max(0, toSafeInteger(product.default_price || 0)),
    active,
    status: active ? "active" : "inactive",
    created_at: product.created_at || new Date().toISOString(),
  };
}

export function sanitizeServiceProductPayload(
  payload: Record<string, any>,
  existingProduct: Record<string, any> | null = null
) {
  const product = normalizeServiceProduct({
    ...existingProduct,
    ...payload,
    active:
      typeof payload.active === "boolean"
        ? payload.active
        : payload.status
          ? String(payload.status).toLowerCase() !== "inactive"
          : existingProduct?.active ?? true,
  });

  const validCategories = new Set(serviceCategories.map((category) => category.value));
  if (!validCategories.has(product.category)) {
    throw new Error("Kategori layanan tidak valid.");
  }

  if (!product.name || product.name.length < 2) {
    throw new Error("Nama layanan minimal 2 huruf.");
  }

  if (!product.provider) {
    throw new Error("Provider wajib diisi.");
  }

  if (product.category === "kuota" && !product.service_type) {
    throw new Error("Jenis layanan wajib diisi untuk kategori Kuota.");
  }

  if (!Number.isFinite(product.cost) || product.cost <= 0) {
    throw new Error("Modal harus berupa angka lebih dari 0.");
  }

  if (
    product.default_price !== null &&
    (!Number.isFinite(product.default_price) || product.default_price < 0)
  ) {
    throw new Error("Harga default harus berupa angka 0 atau lebih.");
  }

  return product;
}
