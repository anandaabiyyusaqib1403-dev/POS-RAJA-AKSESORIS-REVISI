import { recordOperationalEventSoon } from "./observability";
import { supabase } from "../lib/supabase";

const DEFAULT_BACKEND_API_BASE_URL = import.meta.env.PROD ? "" : "http://localhost:3001";
const BACKEND_API_BASE_URL = String(
  import.meta.env.VITE_BACKEND_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    DEFAULT_BACKEND_API_BASE_URL
).replace(/\/+$/, "");

function isNetworkError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timed out") ||
    message.includes("timeout")
  );
}

export async function postShiftWhatsappNotification(type, payload) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error("Sesi login tidak tersedia untuk mengirim notifikasi WhatsApp.");
  }

  let response;
  try {
    response = await fetch(`${BACKEND_API_BASE_URL}/api/whatsapp/${type}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (isNetworkError(error)) {
      recordOperationalEventSoon({
        eventType: "whatsapp_queue_unreachable",
        severity: "critical",
        source: "whatsapp",
        sourceId: payload?.shiftId || null,
        details: { type, backendUrl: BACKEND_API_BASE_URL },
      });
      throw new Error(
        `Backend WhatsApp belum bisa dihubungi di ${BACKEND_API_BASE_URL}. Pastikan service backend sudah berjalan.`
      );
    }
    recordOperationalEventSoon({
      eventType: "whatsapp_request_failed",
      severity: "critical",
      source: "whatsapp",
      sourceId: payload?.shiftId || null,
      details: { type, message: error?.message || String(error) },
    });
    throw error;
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    recordOperationalEventSoon({
      eventType: "whatsapp_queue_failed",
      severity: "critical",
      source: "whatsapp",
      sourceId: payload?.shiftId || null,
      details: {
        type,
        status: response.status,
        error: result.error || "Notifikasi WhatsApp gagal dikirim.",
      },
    });
    throw new Error(result.error || "Notifikasi WhatsApp gagal dikirim.");
  }

  if (["failed", "retrying"].includes(String(result.status || "").toLowerCase())) {
    recordOperationalEventSoon({
      eventType: "whatsapp_delivery_degraded",
      severity: "warning",
      source: "whatsapp",
      sourceId: payload?.shiftId || null,
      details: { type, result },
    });
  }

  return result;
}
