import { getSupabaseErrorText } from "./supabaseErrors";

export function isMissingRelationOrSchemaError(
  error: Record<string, any> = {},
  tableNames: string[] = []
) {
  const code = String(error?.code || "");
  const message = getSupabaseErrorText(error);
  const mentionsTable = tableNames.some((tableName) =>
    message.includes(String(tableName).toLowerCase())
  );

  return (
    ["42P01", "PGRST106", "PGRST205"].includes(code) ||
    (message.includes("schema cache") && mentionsTable) ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

export function isMissingColumnError(
  error: Record<string, any> = {},
  columns: string[] = []
) {
  const code = String(error?.code || "");
  const message = getSupabaseErrorText(error);
  const normalizedColumns = columns.map((column) => String(column).toLowerCase());
  const mentionsColumn = normalizedColumns.some(
    (column) =>
      message.includes(`'${column}'`) ||
      message.includes(`"${column}"`) ||
      message.includes(`column ${column}`) ||
      (message.includes(column) && message.includes("could not find"))
  );

  return (
    ["42703", "PGRST204"].includes(code) ||
    (message.includes("schema cache") && mentionsColumn)
  );
}

export function isOptionalResetTableError(error: Record<string, any> = {}) {
  const code = String(error?.code || "");
  const message = getSupabaseErrorText(error);

  return (
    ["42P01", "42703", "PGRST106", "PGRST205"].includes(code) ||
    message.includes("schema cache") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

export function isPermissionDeniedForTable(
  error: Record<string, any> = {},
  tableNames: string[] = []
) {
  const code = String(error?.code || "");
  const message = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    code === "42501" &&
    message.includes("permission denied") &&
    tableNames.some((tableName) => message.includes(tableName.toLowerCase()))
  );
}

export function getOptionalRows<T = any>(result: { data?: T[] | null; error?: any } | null | undefined) {
  if (!result) return [];
  if (result.error && isOptionalResetTableError(result.error)) return [];
  if (result.error) throw result.error;
  return result.data || [];
}
