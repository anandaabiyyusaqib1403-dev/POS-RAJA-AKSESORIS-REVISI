import { createClient } from "@supabase/supabase-js";

function getSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

function sendJson(res, status, payload) {
  return res.status(status).json(payload);
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function isMissingStationColumnError(error = {}) {
  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    ["42703", "PGRST204"].includes(String(error.code || "")) ||
    text.includes("cashier_station") ||
    text.includes("station_name")
  );
}

function validatePayload(body) {
  const nama = String(body?.nama || body?.name || "").trim();
  const email = normalizeEmail(body?.email);
  const username = normalizeUsername(body?.username || email.split("@")[0]);
  const password = String(body?.password || "");
  const pin = String(body?.pin || "").trim();
  const role = body?.role === "pemilik" ? "pemilik" : "kasir";
  const phone = String(body?.phone || "").trim();
  const baseSalary = Number(body?.baseSalary ?? body?.base_salary ?? 0);
  const defaultBonus = Number(body?.defaultBonus ?? body?.default_bonus ?? 0);
  const defaultDeduction = Number(body?.defaultDeduction ?? body?.default_deduction ?? 0);
  const cashierStation = String(body?.cashierStation ?? body?.cashier_station ?? "").trim();
  const validStations = new Set(["", "Kasir 1", "Kasir 2", "Kasir 3", "Kasir 4"]);

  if (!nama) throw new Error("Nama karyawan wajib diisi.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email karyawan tidak valid.");
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw new Error("Username harus 3-40 karakter dan hanya boleh huruf, angka, titik, underscore, atau strip.");
  }
  if (password.length < 8) throw new Error("Password minimal 8 karakter.");
  if (!/^[0-9]{4,8}$/.test(pin)) throw new Error("PIN harus berisi 4 sampai 8 digit angka.");
  if (phone && !/^[0-9+()\-\s]{8,20}$/.test(phone)) throw new Error("Nomor HP tidak valid.");
  if ([baseSalary, defaultBonus, defaultDeduction].some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Nominal payroll tidak boleh minus.");
  }
  if (!validStations.has(cashierStation)) {
    throw new Error("Pos kasir tidak valid.");
  }

  return {
    nama,
    email,
    username,
    password,
    pin,
    role,
    cashierStation,
    phone,
    baseSalary: Math.trunc(baseSalary),
    defaultBonus: Math.trunc(defaultBonus),
    defaultDeduction: Math.trunc(defaultDeduction),
  };
}

async function getOwnerProfile(token, config) {
  const userClient = createClient(config.url, config.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(token);
  if (userError || !user) throw new Error("Sesi owner tidak valid.");

  const { data: profile, error: profileError } = await userClient
    .from("users")
    .select("id, role, status")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) throw new Error("Profil owner tidak ditemukan.");
  if (profile.role !== "pemilik") throw new Error("Hanya pemilik yang dapat membuat karyawan.");
  if (profile.status && profile.status !== "active") throw new Error("Akun owner tidak aktif.");

  return { ...profile, userClient };
}

export async function employeesHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  }

  const config = getSupabaseConfig();

  if (!config.url || !config.anonKey || !config.serviceRoleKey) {
    return sendJson(res, 500, {
      ok: false,
      error: "Server belum memiliki SUPABASE_URL, SUPABASE_ANON_KEY, atau SUPABASE_SERVICE_ROLE_KEY.",
    });
  }

  try {
    const token = getBearerToken(req);
    if (!token) {
      return sendJson(res, 401, { ok: false, error: "Bearer token wajib diisi." });
    }

    const owner = await getOwnerProfile(token, config);
    const payload = validatePayload(req.body || {});
    const adminClient = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false },
    });

    if (payload.role === "pemilik") {
      const { count, error } = await adminClient
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "pemilik")
        .eq("status", "active")
        .is("archived_at", null);
      if (error) throw error;
      if (count > 0) {
        throw new Error("Tidak bisa membuat lebih dari satu owner aktif dari halaman karyawan.");
      }
    }

    const { data: existingUsername, error: usernameError } = await adminClient
      .from("users")
      .select("id")
      .ilike("username", payload.username)
      .is("archived_at", null)
      .maybeSingle();
    if (usernameError) throw usernameError;
    if (existingUsername) throw new Error("Username sudah dipakai.");

    const { data: authResult, error: createError } = await adminClient.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        name: payload.nama,
        role: payload.role,
      },
    });
    if (createError) throw createError;

    const createdUser = authResult.user;
    const profilePayload = {
      id: createdUser.id,
      nama: payload.nama,
      email: payload.email,
      username: payload.username,
      phone: payload.phone || null,
      role: payload.role,
      cashier_station: payload.cashierStation || null,
      station_name: payload.cashierStation || null,
      status: "active",
      pin_hash: null,
      base_salary: payload.baseSalary,
      default_bonus: payload.defaultBonus,
      default_deduction: payload.defaultDeduction,
    };

    let { data: profile, error: profileError } = await adminClient
      .from("users")
      .upsert(profilePayload, { onConflict: "id" })
      .select("id,nama,email,username,phone,role,cashier_station,station_name,status,base_salary,default_bonus,default_deduction")
      .single();

    if (profileError && isMissingStationColumnError(profileError)) {
      const fallbackPayload = { ...profilePayload };
      delete fallbackPayload.cashier_station;
      delete fallbackPayload.station_name;
      const fallback = await adminClient
        .from("users")
        .upsert(fallbackPayload, { onConflict: "id" })
        .select("id,nama,email,username,phone,role,status,base_salary,default_bonus,default_deduction")
        .single();
      profile = fallback.data;
      profileError = fallback.error;
    }

    if (profileError) {
      await adminClient.auth.admin.deleteUser(createdUser.id).catch(() => {});
      throw profileError;
    }

    const { error: pinError } = await owner.userClient.rpc("owner_reset_employee_pin", {
      p_user_id: createdUser.id,
      p_new_pin: payload.pin,
    });
    if (pinError) {
      await adminClient.from("users").delete().eq("id", createdUser.id);
      await adminClient.auth.admin.deleteUser(createdUser.id).catch(() => {});
      throw pinError;
    }

    await adminClient.from("audit_logs").insert({
      actor_id: owner.id,
      actor_role: "pemilik",
      action: "employee.create",
      target_table: "users",
      target_id: createdUser.id,
      before_value: {},
      after_value: {
        id: profile.id,
        nama: profile.nama,
        email: profile.email,
        username: profile.username,
        role: profile.role,
        status: profile.status,
      },
      reason: "Tambah karyawan",
      incident_code: "EMPLOYEE-MANAGEMENT",
    });

    return sendJson(res, 201, { ok: true, employee: profile });
  } catch (error) {
    return sendJson(res, 400, {
      ok: false,
      error: error.message || "Gagal membuat karyawan.",
    });
  }
}
