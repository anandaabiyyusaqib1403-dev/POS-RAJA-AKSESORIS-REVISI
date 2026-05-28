import React from "react";
import { resetBrowserAppStateAndReload } from "../utils/browserRecovery";

function createIncidentCode() {
  return `POS-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
}

function isChunkLoadError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("error loading dynamically imported module")
  );
}

function recoverFromStaleChunk() {
  const storageKey = "pos:chunk-recovery-attempted";
  const recoveryParam = "chunk_recovery";
  try {
    if (window.sessionStorage?.getItem(storageKey) === "1") return false;
    window.sessionStorage?.setItem(storageKey, "1");
  } catch {
    // If storage is unavailable, still try one visible reload path.
  }

  const url = new URL(window.location.href);
  if (url.searchParams.get(recoveryParam) === "1") return false;
  url.searchParams.set(recoveryParam, "1");
  url.searchParams.set("refresh", String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null, incidentCode: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, incidentCode: createIncidentCode() };
  }

  componentDidCatch(error, info) {
    if (isChunkLoadError(error) && recoverFromStaleChunk()) {
      return;
    }

    const incidentCode = this.state.incidentCode || createIncidentCode();
    const errorReport = {
      incidentCode,
      message: error?.message || String(error),
      stack: error?.stack || "",
      componentStack: info?.componentStack || "",
      path: window.location?.pathname || "",
      createdAt: new Date().toISOString(),
    };

    try {
      window.localStorage?.setItem("pos:last-error", JSON.stringify(errorReport));
    } catch {
      // Ignore storage failures; the visible incident code still helps support.
    }

    this.setState({ error, info, incidentCode });
    console.error("ErrorBoundary caught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      const incidentCode = this.state.incidentCode || createIncidentCode();
      const errorMessage = this.state.error?.message || String(this.state.error || "");
      const showDebug = import.meta.env.DEV;

      return (
        <div className="min-h-screen flex items-center justify-center bg-white p-6">
          <div className="max-w-xl text-center">
            <h2 className="text-lg font-semibold mb-2">Halaman belum bisa dibuka</h2>
            <p className="text-sm text-slate-600 mb-4">
              Coba muat ulang halaman. Kalau masih sama, catat kode ini untuk dicek pemilik toko.
            </p>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950">
              {incidentCode}
            </div>
            {showDebug && errorMessage ? (
              <p className="mx-auto mt-4 max-w-lg rounded-lg bg-rose-50 px-4 py-3 text-xs text-rose-700">
                Detail teknis: {errorMessage}
              </p>
            ) : null}
            <button
              type="button"
              className="mt-5 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
              onClick={resetBrowserAppStateAndReload}
            >
              Pulihkan halaman
            </button>
            {showDebug ? (
              <pre className="mt-4 text-xs bg-slate-100 p-3 rounded overflow-auto text-left">
                {String(this.state.error)}
              </pre>
            ) : null}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
