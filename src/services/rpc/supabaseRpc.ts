import { supabase } from "../supabase/client";
import {
  ATOMIC_POS_MIGRATION_MESSAGE,
  RPC_SCHEMA_CACHE_MESSAGE,
} from "../../core/constants/migrationMessages";
import {
  createSupabaseError,
  isMissingRpcError,
} from "../../core/errors/supabaseErrors";
import { recordOperationalEventSoon } from "../observability";

export async function callSupabaseRpc<TPayload extends Record<string, any>, TResult = any>(
  functionName: string,
  payload: TPayload
): Promise<TResult> {
  const { data, error } = await supabase.rpc(functionName, payload);
  if (error) throw error;
  return data as TResult;
}

export async function callAtomicRpc<TPayload extends Record<string, any>, TResult = any>(
  functionName: string,
  args: TPayload
): Promise<TResult> {
  const { data, error } = await supabase.rpc(functionName, args);

  if (isMissingRpcError(error)) {
    recordOperationalEventSoon({
      eventType: "rpc_missing",
      severity: "critical",
      source: "supabase_rpc",
      details: { functionName },
    });
    throw new Error(`${ATOMIC_POS_MIGRATION_MESSAGE} ${RPC_SCHEMA_CACHE_MESSAGE}`);
  }

  if (error) {
    recordOperationalEventSoon({
      eventType: "rpc_failed",
      severity: "critical",
      source: "supabase_rpc",
      details: {
        functionName,
        code: error.code || "",
        message: error.message || "",
        details: error.details || "",
        hint: error.hint || "",
      },
    });
    throw createSupabaseError(error, "Data belum bisa disimpan.");
  }

  return data as TResult;
}

export async function callOptionalAtomicRpc<TPayload extends Record<string, any>, TResult = any>(
  functionName: string,
  args: TPayload
): Promise<{ data: TResult | null; missing: boolean }> {
  const { data, error } = await supabase.rpc(functionName, args);

  if (isMissingRpcError(error)) {
    recordOperationalEventSoon({
      eventType: "rpc_missing_optional",
      severity: "warning",
      source: "supabase_rpc",
      details: { functionName },
    });
    return { data: null, missing: true };
  }

  if (error) {
    recordOperationalEventSoon({
      eventType: "rpc_failed",
      severity: "critical",
      source: "supabase_rpc",
      details: {
        functionName,
        code: error.code || "",
        message: error.message || "",
      },
    });
    throw createSupabaseError(error, "Data belum bisa disimpan.");
  }

  return { data: data as TResult, missing: false };
}
