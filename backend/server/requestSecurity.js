const RATE_LIMIT_BUCKETS = new Map();
const USER_ROLES = new Set(["pemilik", "kasir"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
}

function getServiceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "");
}

function getAuthApiKey() {
  return String(
    process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      getServiceRoleKey()
  );
}

export function createRequestError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requireSupabaseConfig() {
  const url = getSupabaseUrl();
  const serviceKey = getServiceRoleKey();

  if (!url || !serviceKey) {
    throw createRequestError(500, "Supabase service role belum dikonfigurasi di backend.");
  }

  return { url, serviceKey };
}

function getBearerToken(req) {
  const header =
    (typeof req.get === "function" ? req.get("authorization") : "") ||
    req.headers?.authorization ||
    req.headers?.Authorization ||
    "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw createRequestError(
      response.status,
      data?.message || data?.error || `Supabase request failed (${response.status}).`
    );
  }

  return data;
}

async function serviceRest(pathname, options = {}) {
  const { url, serviceKey } = requireSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  return parseResponse(response);
}

export async function authenticateRequest(req) {
  const token = getBearerToken(req);
  if (!token) {
    throw createRequestError(401, "Bearer token wajib diisi.");
  }

  const { url } = requireSupabaseConfig();
  const apiKey = getAuthApiKey();
  if (!apiKey) {
    throw createRequestError(500, "Supabase auth key belum dikonfigurasi di backend.");
  }

  const authUser = await parseResponse(
    await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${token}`,
      },
    })
  );

  const profileRows = await serviceRest(
    `users?select=id,email,role,status,archived_at&id=eq.${encodeURIComponent(authUser.id)}&limit=1`
  );
  const profile = Array.isArray(profileRows) ? profileRows[0] : null;

  if (!profile || profile.archived_at || profile.status !== "active") {
    throw createRequestError(403, "Akun tidak aktif atau tidak tersedia.");
  }

  if (!USER_ROLES.has(profile.role)) {
    throw createRequestError(403, "Role akun tidak valid untuk operasi ini.");
  }

  return {
    id: profile.id,
    email: profile.email || authUser.email || "",
    role: profile.role,
    accessToken: token,
  };
}

export function requireAuthenticatedUser(req, res, next) {
  authenticateRequest(req)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch((error) => {
      const status = [401, 403].includes(error.status) ? error.status : 500;
      res.status(status).json({ ok: false, error: error.message || "Gagal memverifikasi user." });
    });
}

function requireUuid(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw createRequestError(400, `${fieldName} tidak valid.`);
  }
  return normalized;
}

export async function authorizeShiftNotification({ type, shiftId, user, ownerOverrideRequested }) {
  if (!["opening", "closing"].includes(type)) {
    throw createRequestError(400, "Jenis notifikasi tidak valid.");
  }

  const verifiedShiftId = requireUuid(shiftId, "shiftId");
  const shiftRows = await serviceRest(
    `shifts?select=id,cashier_id,start_time,end_time,status,total_cash,total_digital,total_transactions,digital_breakdown&id=eq.${encodeURIComponent(verifiedShiftId)}&limit=1`
  );
  const shift = Array.isArray(shiftRows) ? shiftRows[0] : null;

  if (!shift) {
    throw createRequestError(404, "Shift tidak ditemukan.");
  }

  if (user.role !== "pemilik" && shift.cashier_id !== user.id) {
    throw createRequestError(403, "Kasir hanya dapat mengirim notifikasi shift miliknya.");
  }

  if (!shift.start_time) {
    throw createRequestError(409, "Data opening shift tidak lengkap.");
  }

  if (type === "closing" && (!shift.end_time || shift.status === "active")) {
    throw createRequestError(409, "Shift belum ditutup secara resmi.");
  }

  const cashierRows = await serviceRest(
    `users?select=nama&id=eq.${encodeURIComponent(shift.cashier_id)}&limit=1`
  );
  const cashier = Array.isArray(cashierRows) ? cashierRows[0] : null;

  return {
    ownerOverride: user.role === "pemilik" && ownerOverrideRequested === true,
    shift: {
      ...shift,
      cashier_name: String(cashier?.nama || "Kasir").trim() || "Kasir",
    },
  };
}

export function enforceIntegrationRateLimit(_req, user, action) {
  const limit = Math.max(1, Number(process.env.INTEGRATION_RATE_LIMIT_MAX || 10));
  const windowMs = Math.max(1000, Number(process.env.INTEGRATION_RATE_LIMIT_WINDOW_MS || 60000));
  const key = `${action}:${user.id}`;
  const now = Date.now();
  const current = RATE_LIMIT_BUCKETS.get(key);

  if (!current || current.expiresAt <= now) {
    RATE_LIMIT_BUCKETS.set(key, { count: 1, expiresAt: now + windowMs });
    return;
  }

  if (current.count >= limit) {
    throw createRequestError(429, "Terlalu banyak permintaan. Coba lagi sebentar.");
  }

  current.count += 1;
}

export async function appendIntegrationAudit({
  user,
  action,
  targetId = null,
  afterValue = {},
  reason = "",
}) {
  if (!user?.id) return;

  await serviceRest("audit_logs", {
    method: "POST",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      actor_id: user.id,
      actor_role: user.role,
      action,
      target_table: "shifts",
      target_id: targetId && UUID_PATTERN.test(targetId) ? targetId : null,
      before_value: {},
      after_value: afterValue,
      reason,
      incident_code: "WHATSAPP-INTEGRATION",
    }),
  });
}

export async function appendIntegrationAuditSafely(payload) {
  try {
    await appendIntegrationAudit(payload);
  } catch (error) {
    console.error("Gagal menyimpan audit integrasi WhatsApp:", error.message || error);
  }
}
