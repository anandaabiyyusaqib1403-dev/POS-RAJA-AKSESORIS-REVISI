const RETRY_BASE_MS = 60_000;
const MAX_RETRY_MS = 30 * 60_000;

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
}

function getServiceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "");
}

export function isNotificationQueueConfigured() {
  return Boolean(getSupabaseUrl() && getServiceRoleKey());
}

function requireQueueConfig() {
  const url = getSupabaseUrl();
  const serviceKey = getServiceRoleKey();

  if (!url || !serviceKey) {
    throw new Error("Supabase service key belum dikonfigurasi untuk WhatsApp durable queue.");
  }

  return { url, serviceKey };
}

async function supabaseRest(path, options = {}) {
  const { url, serviceKey } = requireQueueConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.message || data?.error || `Supabase queue request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function getRetryDelay(attemptCount) {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attemptCount - 1), MAX_RETRY_MS);
}

export async function getNotificationJobByKey(idempotencyKey) {
  const rows = await supabaseRest(
    `notification_jobs?select=*&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function hasQueuedNotificationBeenSent(idempotencyKey) {
  const job = await getNotificationJobByKey(idempotencyKey);
  return job?.status === "sent";
}

export async function enqueueWhatsappNotification({ type, shiftId, payload }) {
  const idempotencyKey = `${type}:${shiftId}`;
  const existingJob = await getNotificationJobByKey(idempotencyKey);
  if (existingJob) {
    return existingJob;
  }

  const body = {
    type,
    shift_id: shiftId,
    idempotency_key: idempotencyKey,
    payload: payload || {},
    status: "pending",
    next_attempt_at: new Date().toISOString(),
  };

  const rows = await supabaseRest("notification_jobs?on_conflict=idempotency_key", {
    method: "POST",
    headers: {
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(body),
  });

  const insertedJob = Array.isArray(rows) ? rows[0] : rows;
  return insertedJob || getNotificationJobByKey(idempotencyKey);
}

async function patchNotificationJob(id, patch, query = "") {
  const rows = await supabaseRest(`notification_jobs?id=eq.${encodeURIComponent(id)}${query}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });

  return Array.isArray(rows) ? rows[0] : rows;
}

export async function processWhatsappNotificationJob(job, sendFn) {
  if (!job?.id) {
    throw new Error("Notification job tidak valid.");
  }

  if (job.status === "sent") {
    return job;
  }

  if (job.status === "processing") {
    return job;
  }

  if (
    job.status === "retrying" &&
    job.next_attempt_at &&
    new Date(job.next_attempt_at).getTime() > Date.now()
  ) {
    return job;
  }

  if (!["pending", "retrying"].includes(job.status)) {
    return job;
  }

  const attemptCount = Number(job.attempt_count || 0) + 1;
  const claimedJob = await patchNotificationJob(job.id, {
    status: "processing",
    attempt_count: attemptCount,
    last_error: null,
  }, "&status=in.(pending,retrying)");

  if (!claimedJob) {
    return (await getNotificationJobByKey(job.idempotency_key)) || job;
  }

  try {
    const result = await sendFn(claimedJob.payload || {}, {
      idempotencyKey: claimedJob.idempotency_key,
      metadata: {
        notificationJobId: claimedJob.id,
      },
    });

    return patchNotificationJob(claimedJob.id, {
      status: "sent",
      sent_at: new Date().toISOString(),
      provider_response: result || {},
      last_error: null,
    });
  } catch (error) {
    const retryDelay = getRetryDelay(attemptCount);
    const retrying = attemptCount < Number(process.env.WA_MAX_ATTEMPTS || 5);
    const nextAttemptAt = new Date(Date.now() + retryDelay).toISOString();

    return patchNotificationJob(claimedJob.id, {
      status: retrying ? "retrying" : "failed",
      next_attempt_at: retrying ? nextAttemptAt : new Date().toISOString(),
      last_error: error.message || "WhatsApp provider gagal.",
      provider_response: {
        error: error.message || String(error),
      },
    });
  }
}
