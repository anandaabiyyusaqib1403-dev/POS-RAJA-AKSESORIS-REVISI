import Panel from "./app/Panel";
import { toClientMessage } from "../utils/clientMessages";

export default function FeatureLoadPanel({
  error,
  errorFallback = "Data fitur belum berhasil dimuat.",
  loading = false,
  loadingText = "Memuat data fitur...",
  onRetry,
}) {
  if (!loading && !error) return null;

  return (
    <Panel className={`p-4 ${error ? "border-amber-200 bg-amber-50" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            {error ? "Data fitur belum lengkap" : loadingText}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {error
              ? toClientMessage(error?.message || error, errorFallback)
              : "Halaman tetap bisa dipakai sambil sinkronisasi berjalan."}
          </p>
        </div>
        {onRetry ? (
          <button type="button" className="brand-button-secondary shrink-0" onClick={onRetry}>
            Coba Lagi
          </button>
        ) : null}
      </div>
    </Panel>
  );
}
