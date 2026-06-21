const storageKey = "pos:legacy-dashboard-chunk-recovered";
const recoveryParam = "legacy_dashboard_recovery";

try {
  const url = new URL(window.location.href);
  const alreadyRecovered =
    window.sessionStorage?.getItem(storageKey) === "1" ||
    url.searchParams.get(recoveryParam) === "1";

  if (!alreadyRecovered) {
    window.sessionStorage?.setItem(storageKey, "1");
    url.searchParams.set(recoveryParam, "1");
    url.searchParams.set("refresh", String(Date.now()));
    window.location.replace(url.toString());
  }
} catch {
  const url = new URL(window.location.href);
  if (url.searchParams.get(recoveryParam) !== "1") {
    url.searchParams.set(recoveryParam, "1");
    url.searchParams.set("refresh", String(Date.now()));
    window.location.replace(url.toString());
  }
}

export default function LegacyDashboardChunkRecovery() {
  return null;
}
