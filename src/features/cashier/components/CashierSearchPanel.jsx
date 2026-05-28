import { forwardRef, memo } from "react";
import AppIcon from "../../../components/app/AppIcon";
import Panel from "../../../components/app/Panel";
import { formatRupiah } from "../../../utils/format";
import { getProductDisplayName } from "../utils/productPresentation";

const CashierSearchPanel = memo(
  forwardRef(function CashierSearchPanel(
    {
      search,
      exactCodeMatch,
      filteredProductCount,
      cartItemCount,
      cartTotal,
      categoryOptions,
      activeCategory,
      onSearchChange,
      onSearchClear,
      onSearchKeyDown,
      onCategoryChange,
    },
    searchInputRef
  ) {
    return (
      <Panel variant="strong" className="p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-end">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Cari / Scan
              </label>
              <span className="brand-badge-success">Scanner mode - Enter tambah item</span>
            </div>
            <div className="relative">
              <AppIcon
                name="search"
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                onKeyDown={onSearchKeyDown}
                className="brand-input brand-input-lg pl-11 pr-12 text-base font-semibold"
                placeholder="Scan barcode atau cari nama produk"
                autoComplete="off"
              />
              {search ? (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onSearchClear}
                  className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Hapus pencarian"
                >
                  <AppIcon name="x" className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            {exactCodeMatch ? (
              <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                Enter untuk tambah {getProductDisplayName(exactCodeMatch)}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="brand-subtle-block">
              <p className="brand-kicker">Produk tampil</p>
              <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                {filteredProductCount}
              </p>
            </div>
            <div className="brand-subtle-block">
              <p className="brand-kicker">Keranjang</p>
              <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                {cartItemCount}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {cartItemCount ? formatRupiah(cartTotal) : "Belum ada item"}
              </p>
            </div>
          </div>
        </div>

        <div className="brand-scrollbar mt-5 overflow-x-auto pb-2">
          <div className="flex min-w-max gap-2.5">
            {categoryOptions.map((category) => (
              <button
                key={category.value}
                type="button"
                onClick={() => onCategoryChange(category.value)}
                className={`brand-pill-button ${
                  activeCategory === category.value
                    ? "brand-pill-button-active"
                    : "brand-pill-button-idle"
                }`}
              >
                {category.label}
                <span className="ml-2 text-xs opacity-70">{category.count}</span>
              </button>
            ))}
          </div>
        </div>
      </Panel>
    );
  })
);

export default CashierSearchPanel;
