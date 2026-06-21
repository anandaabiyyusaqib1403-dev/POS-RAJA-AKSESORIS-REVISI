import axios from "axios";
import dotenv from "dotenv";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(backendRoot, "..");

dotenv.config({ path: path.join(projectRoot, ".env") });
dotenv.config({ path: path.join(backendRoot, ".env"), override: true });

const FONNTE_SEND_URL = "https://api.fonnte.com/send";
const DEFAULT_OWNER_TARGETS = "6287884820507,6285659085578";
const TIME_ZONE = "Asia/Jakarta";
const defaultStorePath =
  process.env.VERCEL === "1"
    ? path.join("/tmp", "wa-notifications.json")
    : path.join(backendRoot, "data", "wa-notifications.json");
const STORE_PATH =
  process.env.WA_NOTIFICATION_STORE_PATH ||
  defaultStorePath;
const inFlightNotificationKeys = new Set();

function normalizeText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatRupiahNumber(value) {
  return new Intl.NumberFormat("id-ID").format(Math.round(normalizeNumber(value)));
}

function getDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function getShiftTimeParts(timestamp = new Date()) {
  const date = getDate(timestamp);

  return {
    tanggal: new Intl.DateTimeFormat("id-ID", {
      timeZone: TIME_ZONE,
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(date),
    jam: new Intl.DateTimeFormat("id-ID", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date),
  };
}

export function getHourInJakarta(timestamp = new Date()) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).format(getDate(timestamp));

  return Number(hour) === 24 ? 0 : Number(hour);
}

export function isAtOrAfterHour(timestamp, hour) {
  return getHourInJakarta(timestamp) >= hour;
}

export function getNotificationKey(type, shiftId) {
  const safeType = normalizeText(type, "shift").toLowerCase();
  const safeShiftId = normalizeText(shiftId, "");
  if (!safeShiftId) {
    throw new Error("shiftId wajib diisi untuk notifikasi WhatsApp.");
  }

  return `${safeType}:${safeShiftId}`;
}

function normalizeTargets(targets = process.env.FONNTE_TARGETS || DEFAULT_OWNER_TARGETS) {
  const normalizedTargets = String(targets)
    .split(",")
    .map((target) => target.replace(/[+\s-]/g, "").trim())
    .filter(Boolean);

  const invalidTargets = normalizedTargets.filter((target) => !/^62\d{8,15}$/.test(target));
  if (!normalizedTargets.length || invalidTargets.length) {
    throw new Error(
      "Nomor WhatsApp owner harus format 62xxxxxxxxxx dan dipisahkan koma."
    );
  }

  return [...new Set(normalizedTargets)].join(",");
}

async function readNotificationStore() {
  try {
    const content = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? parsed : { sent: {} };
  } catch (error) {
    if (error.code === "ENOENT") return { sent: {} };
    throw error;
  }
}

async function writeNotificationStore(store) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function hasNotificationBeenSent(idempotencyKey) {
  if (!idempotencyKey) return false;
  const store = await readNotificationStore();
  return Boolean(store.sent?.[idempotencyKey]);
}

async function recordNotificationSent(idempotencyKey, metadata = {}) {
  if (!idempotencyKey) return null;
  const store = await readNotificationStore();
  store.sent ||= {};
  store.sent[idempotencyKey] = {
    ...metadata,
    sentAt: new Date().toISOString(),
  };
  await writeNotificationStore(store);
  return store.sent[idempotencyKey];
}

export function buildOpeningShiftMessage(data = {}) {
  const timestamp = data.timestamp || data.start_time || data.startedAt || new Date();
  const { tanggal, jam } = {
    ...getShiftTimeParts(timestamp),
    ...(data.tanggal ? { tanggal: data.tanggal } : {}),
    ...(data.jam ? { jam: data.jam } : {}),
  };

  return `🟢 OPENING SHIFT
Raja Aksesoris

👤 Kasir: ${normalizeText(data.kasir || data.cashier)}
📅 Tanggal: ${tanggal}
⏰ Jam: ${jam}

اللَّهُمَّ اكْفِنِى بِحَلاَلِكَ عَنْ حَرَامِكَ وَأَغْنِنِى بِفَضْلِكَ عَمَّنْ سِوَاكَ

Allahumma ikfini bihalalika ‘an haramika wa aghnini bifadlika ‘amman siwaka.

Ya Allah, berilah kami kecukupan dengan yang halal dan jauhkan dari yang haram 🤲

Shift dimulai. Semoga hari ini lancar dan penuh keberkahan.`;
}

export function buildClosingShiftMessage(data = {}) {
  const timestamp = data.timestamp || data.end_time || data.closedAt || new Date();
  const { tanggal, jam } = {
    ...getShiftTimeParts(timestamp),
    ...(data.tanggal ? { tanggal: data.tanggal } : {}),
    ...(data.jam ? { jam: data.jam } : {}),
  };

  return `🔴 CLOSING SHIFT
Raja Aksesoris

👤 Kasir: ${normalizeText(data.kasir || data.cashier)}
📅 Tanggal: ${tanggal}
⏰ Jam: ${jam}

📊 RINGKASAN PENJUALAN
Total Transaksi : ${formatRupiahNumber(data.total_trx || data.totalTransaksi)}
Omzet           : Rp ${formatRupiahNumber(data.omzet)}
Modal           : Rp ${formatRupiahNumber(data.modal)}
Profit          : Rp ${formatRupiahNumber(data.profit)}

💳 METODE PEMBAYARAN
Cash     : Rp ${formatRupiahNumber(data.cash)}
QRIS     : Rp ${formatRupiahNumber(data.qris)}
Transfer : Rp ${formatRupiahNumber(data.transfer)}
E-Wallet : Rp ${formatRupiahNumber(data.ewallet)}

سُبْحانَكَ اللَّهُمَّ وَبِحَمْدِكَ، أَشْهَدُ أَنْ لَا إِلٰهَ إِلَّا أَنْتَ، أَسْتَغْفِرُكَ وَأَتُوبُ إِلَيْكَ

Subhanakallahumma wa bihamdika, asyhadu alla ilaha illa anta, astaghfiruka wa atubu ilaik.

Maha Suci Engkau ya Allah, kami memohon ampun dan bertaubat kepada-Mu 🤲

Shift selesai. Terima kasih 🙏`;
}

export async function sendWA(message, options = {}) {
  const normalizedMessage = normalizeText(message, "");
  if (!normalizedMessage) {
    throw new Error("Pesan WhatsApp tidak boleh kosong.");
  }

  const target = normalizeTargets(options.target);
  const idempotencyKey = options.idempotencyKey
    ? normalizeText(options.idempotencyKey, "")
    : "";
  const dryRun = options.dryRun ?? process.env.FONNTE_DRY_RUN === "true";

  if (idempotencyKey) {
    if (await hasNotificationBeenSent(idempotencyKey)) {
      return { sent: false, duplicate: true, target };
    }

    if (inFlightNotificationKeys.has(idempotencyKey)) {
      return { sent: false, duplicate: true, inProgress: true, target };
    }

    inFlightNotificationKeys.add(idempotencyKey);
  }

  try {
    const payload = {
      target,
      message: normalizedMessage,
    };

    if (dryRun) {
      return { sent: false, duplicate: false, dryRun: true, target, payload };
    }

    if (!process.env.FONNTE_TOKEN) {
      throw new Error("FONNTE_TOKEN belum diatur di backend .env.");
    }

    const response = await axios.post(FONNTE_SEND_URL, payload, {
      headers: {
        Authorization: process.env.FONNTE_TOKEN,
      },
      timeout: 15000,
    });

    if (response.data?.status === false) {
      throw new Error(
        response.data?.reason ||
          response.data?.message ||
          "Fonnte menolak pengiriman WhatsApp."
      );
    }

    await recordNotificationSent(idempotencyKey, {
      ...options.metadata,
      target,
      fonnteResponse: response.data,
    });

    return {
      sent: true,
      duplicate: false,
      target,
      fonnteResponse: response.data,
    };
  } finally {
    if (idempotencyKey) {
      inFlightNotificationKeys.delete(idempotencyKey);
    }
  }
}

export async function sendOpening(data = {}, options = {}) {
  const shiftId = data.shiftId || data.shift_id || data.id;
  return sendWA(buildOpeningShiftMessage(data), {
    ...options,
    idempotencyKey: options.idempotencyKey || getNotificationKey("opening", shiftId),
    metadata: {
      type: "opening",
      shiftId,
      cashier: data.kasir || data.cashier,
      timestamp: data.timestamp || data.start_time || new Date().toISOString(),
      ...options.metadata,
    },
  });
}

export async function sendClosing(data = {}, options = {}) {
  const shiftId = data.shiftId || data.shift_id || data.id;
  return sendWA(buildClosingShiftMessage(data), {
    ...options,
    idempotencyKey: options.idempotencyKey || getNotificationKey("closing", shiftId),
    metadata: {
      type: "closing",
      shiftId,
      cashier: data.kasir || data.cashier,
      timestamp: data.timestamp || data.end_time || new Date().toISOString(),
      ...options.metadata,
    },
  });
}
