const UNCERTAIN_SAVE_PATTERN =
  /failed to fetch|network|koneksi|connection|timeout|timed out|load failed|gateway|terputus/i;

export function isMoneySaveResultUncertain(error) {
  return UNCERTAIN_SAVE_PATTERN.test(String(error?.message || error || ""));
}

export function getMoneySaveFailureMessage(error, fallbackMessage) {
  const message = error?.message || fallbackMessage;

  if (!isMoneySaveResultUncertain(error)) {
    return message;
  }

  return `${message} Status simpan belum pasti; ulangi aksi yang sama untuk retry aman tanpa transaksi ganda.`;
}
