import { isAtOrAfterHour, sendClosing, sendOpening } from "./sendWA.js";
import {
  enqueueWhatsappNotification,
  isNotificationQueueConfigured,
  processWhatsappNotificationJob,
} from "./notificationQueue.js";
import {
  appendIntegrationAuditSafely,
  authenticateRequest,
  authorizeShiftNotification,
  enforceIntegrationRateLimit,
} from "./requestSecurity.js";

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return typeof req.body === "object" ? req.body : {};
}

function getShiftId(body) {
  return String(body?.shiftId || body?.shift_id || body?.id || "").trim();
}

function sendError(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}

function getSafeJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    attempt_count: job.attempt_count,
    next_attempt_at: job.next_attempt_at,
    sent_at: job.sent_at,
    last_error: job.last_error,
  };
}

function asAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function getBreakdownAmount(breakdown, keys) {
  return keys.reduce((total, key) => total + asAmount(breakdown?.[key]), 0);
}

function buildVerifiedPayload(type, shift, user, ownerOverride) {
  const payload = {
    shiftId: shift.id,
    kasir: shift.cashier_name,
    requestedByRole: user.role,
    ownerOverride,
    timestamp: type === "opening" ? shift.start_time : shift.end_time,
    openedAt: shift.start_time,
  };

  if (type !== "closing") return payload;

  const breakdown =
    shift.digital_breakdown && typeof shift.digital_breakdown === "object"
      ? shift.digital_breakdown
      : {};
  const cash = asAmount(shift.total_cash);
  const totalDigital = asAmount(shift.total_digital);
  const qris = getBreakdownAmount(breakdown, ["qris"]);
  const transfer = getBreakdownAmount(breakdown, [
    "transfer",
    "transfer_bank",
    "bca",
    "bank_mas",
  ]);

  return {
    ...payload,
    total_trx: asAmount(shift.total_transactions),
    omzet: cash + totalDigital,
    modal: 0,
    profit: 0,
    cash,
    qris,
    transfer,
    ewallet: Math.max(0, totalDigital - qris - transfer),
  };
}

async function enqueueAndMaybeProcess(type, payload) {
  if (!isNotificationQueueConfigured()) {
    throw new Error("WhatsApp durable queue belum dikonfigurasi di backend.");
  }

  const job = await enqueueWhatsappNotification({
    type,
    shiftId: payload.shiftId,
    payload,
  });

  if (process.env.WA_PROCESS_INLINE === "false") {
    return job;
  }

  const sendFn = type === "opening" ? sendOpening : sendClosing;
  return processWhatsappNotificationJob(job, sendFn);
}

export async function handleWhatsappNotificationRequest(type, req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendError(res, 405, "Method not allowed.");
  }

  let user = req.user || null;
  let shiftId = "";

  try {
    const body = getBody(req);
    shiftId = getShiftId(body);
    if (!shiftId) {
      return sendError(res, 400, "shiftId wajib diisi.");
    }

    user ||= await authenticateRequest(req);
    enforceIntegrationRateLimit(req, user, `whatsapp:${type}`);

    const { shift, ownerOverride } = await authorizeShiftNotification({
      type,
      shiftId,
      user,
      ownerOverrideRequested: body.ownerOverride === true,
    });
    const payload = buildVerifiedPayload(type, shift, user, ownerOverride);

    if (type === "opening" && !ownerOverride && !isAtOrAfterHour(payload.timestamp, 7)) {
      throw Object.assign(new Error("Opening Shift hanya boleh dikirim setelah jam 07:00."), {
        status: 400,
      });
    }

    if (type === "closing" && !ownerOverride && !isAtOrAfterHour(payload.timestamp, 20)) {
      throw Object.assign(
        new Error("Closing Shift hanya boleh dikirim setelah jam 20:00 kecuali owner override."),
        { status: 400 }
      );
    }

    const result = await enqueueAndMaybeProcess(type, payload);
    await appendIntegrationAuditSafely({
      user,
      action: `whatsapp.${type}.queue`,
      targetId: shift.id,
      afterValue: {
        job_id: result.id,
        status: result.status,
        owner_override: ownerOverride,
      },
      reason: "Verified shift notification request",
    });

    return res.status(200).json({
      ok: true,
      queued: true,
      status: result.status,
      job: getSafeJob(result),
      provider: result.provider_response || null,
    });
  } catch (error) {
    const status = Number(error.status) || 500;
    if (user) {
      await appendIntegrationAuditSafely({
        user,
        action: `whatsapp.${type}.denied`,
        targetId: shiftId,
        afterValue: { status, error: error.message || "Request rejected" },
        reason: "Notification request rejected",
      });
    }
    return sendError(
      res,
      status,
      error.message || `Gagal memproses notifikasi ${type} shift.`
    );
  }
}
