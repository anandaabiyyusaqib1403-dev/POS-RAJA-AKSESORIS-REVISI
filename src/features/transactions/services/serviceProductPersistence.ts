import { supabase } from "../../../services/supabase/client";
import { SERVICE_PRODUCTS_MIGRATION_MESSAGE } from "../../../core/constants/migrationMessages";
import { getSupabaseErrorText } from "../../../core/errors/supabaseErrors";
import {
  isMissingRelationOrSchemaError,
} from "../../../core/errors/schemaDrift";

const SERVICE_PRODUCT_TABLES = ["services_products", "service_products"];
const SERVICE_PRODUCT_WRITE_TABLES = ["services_products", "service_products"];

function isServiceProductTableFallbackError(error: Record<string, any> = {}) {
  const code = String(error?.code || "");
  const message = getSupabaseErrorText(error);

  return (
    ["42P01", "42703", "42809", "42501", "55000", "PGRST106", "PGRST205"].includes(code) ||
    message.includes("services_products") ||
    message.includes("service_products") ||
    message.includes("schema cache") ||
    (message.includes("relation") && message.includes("does not exist")) ||
    message.includes("cannot insert") ||
    message.includes("cannot update") ||
    message.includes("not updatable") ||
    message.includes("permission denied")
  );
}

function isMissingServiceProductSchemaError(error: Record<string, any> = {}) {
  const code = String(error?.code || "");
  const message = getSupabaseErrorText(error);

  return (
    ["42P01", "42703", "PGRST106", "PGRST205"].includes(code) ||
    message.includes("schema cache") ||
    (message.includes("relation") && message.includes("does not exist")) ||
    message.includes("service_products") ||
    message.includes("services_products")
  );
}

export async function runServiceProductQuery(
  buildQuery: (query: ReturnType<typeof supabase.from>, tableName: string) => Promise<Record<string, any>>,
  { allowMissing = false }: { allowMissing?: boolean } = {}
) {
  let lastResult: Record<string, any> | null = null;

  for (const tableName of SERVICE_PRODUCT_TABLES) {
    const result = await buildQuery(supabase.from(tableName), tableName);
    if (!result.error) {
      return { ...result, tableName };
    }

    lastResult = result;
    if (!isServiceProductTableFallbackError(result.error)) {
      return result;
    }
  }

  if (allowMissing && lastResult?.error && isServiceProductTableFallbackError(lastResult.error)) {
    return { data: [], error: null };
  }

  if (lastResult?.error && isMissingServiceProductSchemaError(lastResult.error)) {
    return { data: null, error: new Error(SERVICE_PRODUCTS_MIGRATION_MESSAGE) };
  }

  return lastResult || { data: [], error: null };
}

export async function runServiceProductWriteQuery(
  buildQuery: (query: ReturnType<typeof supabase.from>, tableName: string) => Promise<Record<string, any>>,
  { allowMissing = false }: { allowMissing?: boolean } = {}
) {
  let lastResult: Record<string, any> | null = null;

  for (const tableName of SERVICE_PRODUCT_WRITE_TABLES) {
    const result = await buildQuery(supabase.from(tableName), tableName);
    if (!result.error) {
      return { ...result, tableName };
    }

    lastResult = result;
    if (!isMissingRelationOrSchemaError(result.error, [tableName])) {
      return result;
    }
  }

  if (allowMissing && lastResult?.error && isMissingRelationOrSchemaError(lastResult.error)) {
    return { data: [], error: null };
  }

  if (lastResult?.error && isMissingServiceProductSchemaError(lastResult.error)) {
    return { data: null, error: new Error(SERVICE_PRODUCTS_MIGRATION_MESSAGE) };
  }

  return lastResult || { data: null, error: new Error(SERVICE_PRODUCTS_MIGRATION_MESSAGE) };
}

export function getServiceProductDbPayload(
  product: Record<string, any>,
  tableName: string,
  options: { legacy?: boolean } = {}
) {
  const { legacy = false } = options;
  const basePayload: Record<string, any> = {
    name: product.name,
    category: product.category,
    provider: product.provider,
    cost: product.cost,
  };

  if (!legacy) {
    basePayload.service_type = product.service_type || "";
    basePayload.default_price = product.default_price;
  }

  if (tableName === "service_products") {
    return {
      ...basePayload,
      status: product.active === false ? "inactive" : "active",
    };
  }

  return {
    ...basePayload,
    active: product.active !== false,
  };
}
