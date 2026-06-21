import { STOCK_OPNAME_MIGRATION_MESSAGE } from "../../../core/constants/migrationMessages";
import { createSupabaseError } from "../../../core/errors/supabaseErrors";
import {
  isMissingColumnError,
  isMissingRelationOrSchemaError,
} from "../../../core/errors/schemaDrift";

export function createStockOpnameSchemaError(error: Record<string, any>, fallbackMessage: string) {
  if (
    isMissingRelationOrSchemaError(error, ["stock_opname_sessions", "stock_opname_items"]) ||
    isMissingColumnError(error, [
      "status",
      "real_stock",
      "system_stock",
      "difference",
      "checked_products",
      "total_loss",
    ])
  ) {
    return new Error(STOCK_OPNAME_MIGRATION_MESSAGE);
  }
  return createSupabaseError(error, fallbackMessage);
}
