export default function PaginationBar({ page, pageCount, from, to, count, onPageChange }) {
  const canGoBack = page > 1;
  const canGoForward = page < pageCount;

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <span className="font-medium">
        {count ? `${from}-${to} dari ${count}` : "Tidak ada data"}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={!canGoBack}
          className="brand-button-secondary min-h-[36px] px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Sebelumnya
        </button>
        <span className="min-w-[88px] text-center font-semibold text-slate-800">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          disabled={!canGoForward}
          className="brand-button-secondary min-h-[36px] px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}

