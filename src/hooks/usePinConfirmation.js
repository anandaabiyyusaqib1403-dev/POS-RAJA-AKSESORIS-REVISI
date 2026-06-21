import { useCallback, useState } from "react";
import { useAuth } from "../contexts/useAuth";
import { useSecurityData } from "./useSecurityData";
import { shouldRequirePinForAction, getActionDescription } from "../utils/sensitiveActions";
import { supabase, supabaseEnabled } from "../lib/supabase";

function createPinActionCancelledError() {
  const error = new Error("Aksi dibatalkan.");
  error.isCancelled = true;
  return error;
}

export function isPinActionCancelledError(error) {
  return error?.isCancelled === true;
}

async function writeSensitiveActionAudit({ user, actionKey, status, error }) {
  if (!supabaseEnabled || !user || !actionKey) return;

  const [category] = String(actionKey).toLowerCase().split(".");
  try {
    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      actor_role: user.role || "",
      action: `sensitive_action_${status}`,
      target_table: category || "sensitive_action",
      target_id: null,
      before_value: {},
      after_value: {
        action_key: actionKey,
        status,
        error: error ? String(error.message || error) : "",
      },
      reason: getActionDescription(actionKey),
      device_info: {
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        pathname: typeof window !== "undefined" ? window.location.pathname : "",
      },
      session_id:
        typeof window !== "undefined" ? window.sessionStorage?.getItem("pos_session_id") || "" : "",
      incident_code: status === "failed" ? "SENSITIVE_ACTION_FAILED" : "",
    });
  } catch (auditError) {
    if (!["42P01", "PGRST205"].includes(String(auditError?.code || ""))) {
      console.warn("Audit aksi sensitif gagal disimpan:", auditError);
    }
  }
}

/**
 * Hook for handling PIN-protected actions
 *
 * Usage:
 * const { isPinModalOpen, closePinModal, executeSensitiveAction } = usePinConfirmation();
 *
 * // Then in your component:
 * const handleDelete = async () => {
 *   await executeSensitiveAction(
 *     async () => {
 *       // Do sensitive action here
 *       await dataContext.deleteProduct(id);
 *     },
 *     "PRODUCT.DELETE"
 *   );
 * };
 *
 * // And render the modal:
 * <PinConfirmationModal
 *   isOpen={isPinModalOpen}
 *   onClose={closePinModal}
 *   onConfirm={onConfirmAction}
 *   title={actionTitle}
 *   message={`Konfirmasi PIN untuk ${actionDescription}`}
 * />
 */
export function usePinConfirmation() {
  const { user } = useAuth();
  const { pinRequiredEnabled = true } = useSecurityData();
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionDescription, setActionDescription] = useState("");

  const openPinModal = useCallback((action, actionKey, reject) => {
    const description = getActionDescription(actionKey);
    setActionDescription(description);
    setPendingAction({ action, reject });
    setIsPinModalOpen(true);
  }, []);

  const clearPinModal = useCallback(() => {
    setIsPinModalOpen(false);
    setPendingAction(null);
    setActionDescription("");
  }, []);

  const closePinModal = useCallback(() => {
    const reject = pendingAction?.reject;
    clearPinModal();
    reject?.(createPinActionCancelledError());
  }, [clearPinModal, pendingAction]);

  const executeSensitiveAction = useCallback(
    async (action, actionKey) => {
      if (!actionKey) {
        return await action();
      }

      const runAuditedAction = async () => {
        try {
          const result = await action();
          await writeSensitiveActionAudit({ user, actionKey, status: "success" });
          return result;
        } catch (err) {
          await writeSensitiveActionAudit({ user, actionKey, status: "failed", error: err });
          throw err;
        }
      };

      // If PIN is not required for this action/role, execute immediately
      if (!pinRequiredEnabled || !shouldRequirePinForAction(actionKey, user?.role)) {
        return await runAuditedAction();
      }

      // PIN is required, open modal
      return new Promise((resolve, reject) => {
        openPinModal(
          async () => {
            try {
              const result = await runAuditedAction();
              resolve(result);
            } catch (err) {
              reject(err);
            }
          },
          actionKey,
          reject
        );
      });
    },
    [pinRequiredEnabled, user, openPinModal]
  );

  const executeConfirmedAction = useCallback(async () => {
    const action = pendingAction?.action;
    if (!action) return;

    await action();
    clearPinModal();
  }, [clearPinModal, pendingAction]);

  return {
    isPinModalOpen,
    openPinModal,
    closePinModal,
    executeSensitiveAction,
    executeConfirmedAction,
    actionDescription,
  };
}


