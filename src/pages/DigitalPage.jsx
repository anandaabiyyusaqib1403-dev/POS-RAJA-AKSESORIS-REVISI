import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw, Save, Star } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import AppIcon from "../components/app/AppIcon";
import ConfirmModal from "../components/ConfirmModal";
import Panel from "../components/app/Panel";
import CurrencyInput from "../components/CurrencyInput";
import Loading from "../components/Loading";
import ReceiptModal from "../components/ReceiptModal";
import { useAuth } from "../contexts/useAuth";
import { showNotification } from "../contexts/NotificationContext";
import {
  bankProviderOptions,
  ewalletProviderOptions,
} from "../data/businessOptions";
import { resolveProviderLogo } from "../features/provider-logos/resolveProviderLogo";
import { productServiceCategoryIds, serviceCategories } from "../data/serviceProducts";
import { formatDateTime, formatRupiah } from "../utils/format";
import { useProducts } from "../hooks/useProducts";
import { useShift } from "../hooks/useShift";
import { useTransactions } from "../hooks/useTransactions";
import { useWallet } from "../hooks/useWallet";
import {
  openReceiptPrintWindow,
  printTransactionReceiptWithStatus,
} from "../utils/print";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { getMoneySaveFailureMessage } from "../core/money/moneyRetry";

const productCategoryIdSet = new Set(productServiceCategoryIds);

const serviceCategoryOptions = serviceCategories
  .map((category) => ({
    ...category,
    label: category.label,
  }));

const productCategoryOptions = serviceCategoryOptions
  .filter((category) => category.mode === "product")
  .map((category) => category.value);

const defaultServiceCategory = productCategoryOptions[0] || serviceCategoryOptions[0]?.value || "pulsa";

const NOTE_MAX_LENGTH = 150;

const directInputCategoryOptions = {
  transfer_bank: {
    type: "transfer",
    label: "Transfer Bank",
    eyebrow: "Form Transfer Bank",
    platformLabel: "Platform tujuan bank",
    platformOptions: bankProviderOptions,
    nominalLabel: "Nominal",
    adminFeeLabel: "Biaya admin",
    recipientLabel: "Nama penerima",
    recipientPlaceholder: "Masukkan nama penerima",
    recipientRequired: true,
    targetLabel: "Nomor rekening",
    targetPlaceholder: "Masukkan nomor rekening tujuan",
  },
  transfer_ewallet: {
    type: "ewallet",
    label: "E-Wallet",
    eyebrow: "Form E-Wallet",
    platformLabel: "Platform tujuan e-wallet",
    platformOptions: ewalletProviderOptions,
    nominalLabel: "Nominal",
    adminFeeLabel: "Biaya admin",
    recipientLabel: "Nama penerima / user",
    recipientPlaceholder: "Opsional",
    recipientRequired: false,
    targetLabel: "Nomor tujuan (HP)",
    targetPlaceholder: "Masukkan nomor HP tujuan",
  },
};

const preferredProviderOrder = [
  "Telkomsel",
  "XL",
  "Indosat",
  "Axis",
  "Tri",
  "Smartfren",
  "PLN",
  "Mobile Legends",
  "Free Fire",
  "PUBG Mobile",
  "Steam",
  "Garena",
];

const paymentGroups = [
  { value: "cash", method: "cash", label: "Cash" },
  { value: "qris", method: "qris", label: "QRIS" },
  { value: "transfer_bank", method: "bca", label: "Transfer Bank" },
  { value: "ewallet", method: "dana", label: "E-Wallet" },
];

const productServiceExternalPaymentOptions = [
  { value: "pasar_kuota", label: "Pasar Kuota" },
  { value: "dana", label: "Dana" },
];

const bankExternalPaymentOptions = [
  { value: "bank_mas", label: "Bank Mas" },
  { value: "pasar_kuota", label: "Pasar Kuota" },
];

const ewalletExternalPaymentOptions = [
  { value: "pasar_kuota", label: "Pasar Kuota" },
  { value: "dana", label: "Dana" },
];

const AplikasiLuarPaymentOptions = [
  ...productServiceExternalPaymentOptions,
  ...bankExternalPaymentOptions,
  ...ewalletExternalPaymentOptions,
];

const externalPaymentOptionsByCategory = {
  transfer_bank: bankExternalPaymentOptions,
  transfer_ewallet: ewalletExternalPaymentOptions,
};

const quickPriceIncrements = [500, 1000, 2000];
const FAVORITE_SERVICES_KEY = "raja_pos_favorite_services";
const RECENT_SERVICES_KEY = "raja_pos_recent_services";
const LAST_REPEAT_SERVICE_KEY = "pos_last_digital_repeat";
const MAX_QUICK_SERVICES = 10;
const MAX_RENDERED_SERVICE_PRODUCTS = 160;

const categoryDescriptions = {
  pulsa: "Nomor HP dan nominal cepat",
  kuota: "Paket data dan internet seluler",
  token_listrik: "Token dan layanan PLN",
  voucher_game: "Diamond, voucher, membership",
  transfer_ewallet: "Top up dan transfer wallet",
  transfer_bank: "Transfer rekening bank",
  tagihan: "PDAM, BPJS, cicilan, tagihan",
  tv: "TV kabel dan streaming",
  internet: "Wifi, ISP, dan paket rumah",
  multifinance: "Cicilan dan pembiayaan",
};

const categorySearchAliases = {
  voucher_game: ["game", "diamond"],
  token_listrik: ["pln", "token", "listrik"],
  transfer_ewallet: ["ewallet", "e wallet", "wallet", "dana", "ovo", "gopay"],
  transfer_bank: ["transfer", "bank", "rekening"],
  multifinance: ["finance", "leasing", "cicilan"],
};

function readStoredIdList(key) {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function persistStoredIdList(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local quick actions stay optional. The POS flow must keep working without storage.
  }

  return value;
}

function readStoredObject(key) {
  if (typeof window === "undefined") return null;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function persistStoredObject(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Repeat terakhir remains optional when browser storage is unavailable.
  }

  return value;
}

function sortText(left, right) {
  return String(left || "").localeCompare(String(right || ""), "id", {
    sensitivity: "base",
  });
}

function normalizeProviderLabel(value) {
  return String(value || "").trim() || "Lainnya";
}

function sortProviderOptions(values) {
  const preferredIndex = new Map(
    preferredProviderOrder.map((provider, index) => [provider.toLowerCase(), index])
  );

  return [...values].sort((left, right) => {
    const leftPriority = preferredIndex.get(String(left || "").toLowerCase());
    const rightPriority = preferredIndex.get(String(right || "").toLowerCase());

    if (leftPriority !== undefined || rightPriority !== undefined) {
      return (
        (leftPriority ?? Number.MAX_SAFE_INTEGER) -
        (rightPriority ?? Number.MAX_SAFE_INTEGER)
      );
    }

    return sortText(left, right);
  });
}

function getServiceTypeValue(product) {
  return String(product?.service_type || product?.serviceType || "").trim();
}

function getServiceTypeLabel(value) {
  return String(value || "").trim() || "Reguler";
}

function getServiceTypeOptions(products) {
  return [...new Set(products.map(getServiceTypeValue).filter(Boolean).map(getServiceTypeLabel))].sort(
    sortText
  );
}

function getCategoryLabel(categoryId) {
  return (
    serviceCategoryOptions.find((category) => category.value === categoryId)?.label ||
    categoryId ||
    "Layanan"
  );
}

function getDirectInputCategoryConfig(categoryId) {
  return directInputCategoryOptions[categoryId] || null;
}

function isDirectInputCategory(categoryId) {
  return Boolean(getDirectInputCategoryConfig(categoryId));
}

function getProductName(product) {
  return String(product?.name || "").trim() || "Layanan";
}

function getShortProductName(product) {
  const name = getProductName(product);
  return name.length > 56 ? `${name.slice(0, 53).trim()}...` : name;
}

function getDefaultSellingPrice(product) {
  return Number(product?.default_price ?? product?.cost ?? 0);
}

function getProductCost(product) {
  return Number(product?.cost || 0);
}

function toPositiveInteger(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getSearchTokens(keyword) {
  return normalizeSearchText(keyword).split(/\s+/).filter(Boolean);
}

function getDestinationNumber(value) {
  const compactValue = String(value || "").replace(/[^\d+]/g, "");
  const digits = compactValue.replace(/\D/g, "");
  return digits.length >= 7 ? compactValue : "";
}

function getAcronym(value) {
  return normalizeSearchText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("");
}

function getProviderLogoMeta(provider, categoryId = "") {
  return resolveProviderLogo(provider, categoryId);
}

function ProviderLogo({ provider, category, active = false, size = "md", className = "" }) {
  const meta = getProviderLogoMeta(provider, category);
  const sizeClasses = {
    xs: "h-7 w-7 rounded-md",
    sm: "h-9 w-9 rounded-lg",
    md: "h-12 w-12 rounded-xl",
    lg: "h-14 w-14 rounded-xl",
  };
  const displayText = size === "xs" ? meta.mark : meta.wordmark || meta.mark;
  const markSize =
    displayText.length > 8
      ? "text-[7px]"
      : displayText.length > 5
        ? "text-[8px]"
        : displayText.length > 4
          ? "text-[9px]"
          : displayText.length > 3
            ? "text-[10px]"
            : size === "xs"
              ? "text-[10px]"
              : "text-xs";

  const textFallback = (
    <span className="max-w-full px-1 text-center font-black leading-[0.95] tracking-normal">
      {displayText}
    </span>
  );

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center border border-white/70 font-black leading-none shadow-sm ${sizeClasses[size] || sizeClasses.md} ${markSize} ${className}`}
      style={{
        background: meta.src ? "#ffffff" : meta.background,
        color: meta.color,
        boxShadow: active
          ? "0 12px 24px rgba(15, 23, 42, 0.2)"
          : "0 8px 16px rgba(15, 23, 42, 0.08)",
      }}
      title={`${meta.label} logo`}
      aria-hidden="true"
    >
      {meta.src ? (
        <>
          <img
            src={meta.src}
            alt=""
            loading="lazy"
            decoding="async"
            className="max-h-[78%] max-w-[82%] object-contain"
            onError={(event) => {
              event.currentTarget.style.display = "none";
              const fallback = event.currentTarget.nextElementSibling;
              if (fallback) fallback.removeAttribute("hidden");
            }}
          />
          <span hidden className="max-w-full px-1 text-center font-black leading-[0.95] tracking-normal">
            {displayText}
          </span>
        </>
      ) : (
        textFallback
      )}
    </span>
  );
}

function getProductSearchText(product) {
  const categoryId = product?.category;
  const sellingPrice = getDefaultSellingPrice(product);
  const provider = normalizeProviderLabel(product.provider);
  const productName = getProductName(product);

  return normalizeSearchText(
    [
      productName,
      provider,
      getAcronym(productName),
      getAcronym(provider),
      getServiceTypeValue(product),
      getServiceTypeLabel(getServiceTypeValue(product)),
      getCategoryLabel(categoryId),
      categoryId,
      product?.type,
      sellingPrice ? String(sellingPrice) : "",
      sellingPrice ? formatRupiah(sellingPrice) : "",
      ...(categorySearchAliases[categoryId] || []),
    ].join(" ")
  );
}

function productMatchesSearch(product, keyword) {
  const tokens = getSearchTokens(keyword);
  if (!tokens.length) return true;

  const haystack = getProductSearchText(product);
  return tokens.every((token) => haystack.includes(token));
}

function getProductSearchScore(product, keyword) {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return 0;

  const provider = normalizeSearchText(product.provider);
  const name = normalizeSearchText(getProductName(product));
  const serviceType = normalizeSearchText(getServiceTypeValue(product));
  const category = normalizeSearchText(getCategoryLabel(product.category));
  let score = 0;

  if (provider === normalizedKeyword) score += 120;
  else if (provider.startsWith(normalizedKeyword)) score += 80;
  else if (provider.includes(normalizedKeyword)) score += 55;
  if (name === normalizedKeyword) score += 110;
  else if (name.startsWith(normalizedKeyword)) score += 70;
  else if (name.includes(normalizedKeyword)) score += 45;
  if (serviceType.includes(normalizedKeyword)) score += 24;
  if (category.includes(normalizedKeyword)) score += 18;
  score += getSearchTokens(normalizedKeyword).filter((token) =>
    getProductSearchText(product).includes(token)
  ).length * 4;

  return score;
}

function renderHighlightedText(value, keyword, fallback = "") {
  const text = String(value || fallback);
  const normalizedKeyword = String(keyword || "").trim().toLowerCase();

  if (!normalizedKeyword) return text;

  const matchIndex = text.toLowerCase().indexOf(normalizedKeyword);
  if (matchIndex === -1) return text;

  return (
    <>
      {text.slice(0, matchIndex)}
      <mark className="rounded bg-yellow-200 px-0.5 text-inherit">
        {text.slice(matchIndex, matchIndex + normalizedKeyword.length)}
      </mark>
      {text.slice(matchIndex + normalizedKeyword.length)}
    </>
  );
}

function createCartItem(product, targetNumber = "") {
  const sellingPrice = getDefaultSellingPrice(product);
  const cost = getProductCost(product);

  return {
    cartId: crypto.randomUUID(),
    productId: product.id,
    name: getProductName(product),
    category: product.category,
    provider: normalizeProviderLabel(product.provider),
    serviceType: getServiceTypeValue(product),
    qty: 1,
    sellingPrice: sellingPrice ? String(sellingPrice) : "",
    cost: cost ? String(cost) : "",
    targetNumber,
    customerName: "",
  };
}

function createDirectInputForm(categoryId) {
  const config = getDirectInputCategoryConfig(categoryId);

  return {
    platform: config?.platformOptions?.[0] || "",
    nominal: "",
    adminFee: "",
    sellingPrice: "",
    cost: "",
    recipientName: "",
    targetNumber: "",
  };
}

function getLineSellingPrice(item) {
  return toPositiveInteger(item.sellingPrice);
}

function getLineCost(item) {
  return toPositiveInteger(item.cost);
}

function getLineSubtotal(item) {
  return getLineSellingPrice(item) * Number(item.qty || 0);
}

function getLineCostTotal(item) {
  return getLineCost(item) * Number(item.qty || 0);
}

function getResolvedPaymentMethod(paymentGroup) {
  return paymentGroups.find((method) => method.value === paymentGroup)?.method || "cash";
}

function getPaymentLabel(paymentGroup) {
  return paymentGroups.find((method) => method.value === paymentGroup)?.label || "Cash";
}

function getSupplierPaymentLabel(paymentSupplier) {
  return (
    AplikasiLuarPaymentOptions.find((method) => method.value === paymentSupplier)?.label ||
    paymentSupplier ||
    "-"
  );
}

function getExternalPaymentOptions(categoryId) {
  if (productCategoryIdSet.has(categoryId)) {
    return productServiceExternalPaymentOptions;
  }

  return externalPaymentOptionsByCategory[categoryId] || [];
}

function getDefaultExternalPayment(categoryId) {
  return getExternalPaymentOptions(categoryId)[0]?.value || "";
}

function buildTargetLabel(item) {
  if (item.category === "token_listrik") return "Nomor meter / ID pelanggan";
  if (item.category === "voucher_game") return "User ID";
  if (["pulsa", "kuota", "transfer_ewallet"].includes(item.category)) return "Nomor HP / ID akun";
  if (item.category === "transfer_bank") return "Nomor rekening";
  return "Nomor tujuan";
}

function buildCustomerNameLabel(item) {
  if (item?.category === "voucher_game") return "Server ID / nama akun";
  if (item?.category === "token_listrik") return "Nama pelanggan";
  if (item?.category === "transfer_bank") return "Nama penerima";
  return "Nama pelanggan";
}

function getChoiceButtonClass(isActive, tone = "gold") {
  const activeClass =
    tone === "dark"
      ? "border-slate-950 bg-slate-950 text-white shadow-[0_10px_22px_rgba(15,23,42,0.14)]"
      : "border-[var(--brand-gold)]/30 bg-[var(--brand-gold)]/14 text-slate-950 shadow-[0_10px_22px_rgba(212,175,55,0.12)]";

  return `rounded-lg border px-4 py-3 text-sm font-semibold transition duration-200 ease-out hover:-translate-y-px ${
    isActive
      ? activeClass
      : "border-slate-200 bg-white text-slate-600 hover:border-[var(--brand-gold)]/40 hover:bg-[var(--brand-surface-tint)] hover:text-slate-950"
  }`;
}

function DigitalMetric({ label, value, detail, tone = "default" }) {
  const valueClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "danger"
        ? "text-rose-700"
        : tone === "gold"
          ? "text-[var(--brand-gold-strong)]"
          : "text-slate-950";

  return (
    <div className="brand-subtle-block">
      <p className="brand-kicker">{label}</p>
      <p className={`mt-2 break-words text-xl font-black leading-tight tracking-tight sm:text-2xl ${valueClass}`}>
        {value}
      </p>
      {detail ? <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p> : null}
    </div>
  );
}

function DigitalEmptyState({ title, description, action }) {
  return (
    <div className="brand-empty-state">
      <p className="text-lg font-semibold text-slate-950">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

function CategoryCard({ category, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[78px] rounded-lg border px-3.5 py-3 text-left transition duration-200 ease-out hover:-translate-y-0.5 ${
        active
          ? "border-[var(--brand-gold)]/50 bg-[var(--brand-gold)]/12 shadow-[0_12px_24px_rgba(212,175,55,0.12)]"
          : "border-slate-200 bg-white hover:border-[var(--brand-gold)]/35 hover:bg-[var(--brand-surface-tint)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-black text-slate-950">
          {category.shortLabel || category.label}
        </span>
        <span className={category.mode === "service" ? "brand-badge-info" : "brand-badge-neutral"}>
          {category.mode === "service" ? "Input" : count}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-[11px] font-semibold leading-4 text-slate-500">
        {categoryDescriptions[category.value] || "Produk digital siap transaksi"}
      </p>
    </button>
  );
}

function ProviderCard({ provider, category, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[92px] rounded-lg border px-4 py-4 text-left transition duration-200 ease-out hover:-translate-y-0.5 ${
        active
          ? "border-slate-950 bg-slate-950 text-white shadow-[0_14px_28px_rgba(15,23,42,0.16)]"
          : "border-slate-200 bg-white text-slate-700 hover:border-[var(--brand-gold)]/40 hover:bg-[var(--brand-surface-tint)]"
      }`}
    >
      <div className="flex items-center gap-3">
        <ProviderLogo provider={provider} category={category} active={active} />
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{provider}</p>
          <p className={`mt-1 text-xs font-semibold ${active ? "text-white/70" : "text-slate-500"}`}>
            {count} produk aktif
          </p>
        </div>
      </div>
    </button>
  );
}

function ServiceProductCard({
  product,
  inCart,
  hasSearch,
  searchKeyword,
  isFavorite,
  onToggleFavorite,
  onClick,
}) {
  const providerLabel = normalizeProviderLabel(product.provider);
  const serviceTypeLabel = getServiceTypeLabel(getServiceTypeValue(product));
  const sellingPrice = getDefaultSellingPrice(product);
  const cost = getProductCost(product);
  const margin = sellingPrice - cost;
  const marginClass = margin < 0 ? "brand-badge-danger" : "brand-badge-success";

  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={onToggleFavorite}
        className={`absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg border bg-white shadow-sm transition ${
          isFavorite
            ? "border-[var(--brand-gold)] text-[var(--brand-gold-strong)]"
            : "border-slate-200 text-slate-400 hover:text-slate-700"
        }`}
        aria-label={isFavorite ? "Hapus dari favorit" : "Tambah ke favorit"}
      >
        <Star className="h-4 w-4" fill={isFavorite ? "currentColor" : "none"} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onClick}
        className="relative flex h-full min-h-[190px] w-full flex-col rounded-lg border border-slate-200 bg-white p-4 pr-14 text-left text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--brand-gold)]/40 hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)]"
      >
      {inCart ? (
        <span className="absolute right-14 top-3 rounded-md bg-[var(--brand-gold)] px-2.5 py-1 text-[11px] font-bold text-slate-950">
          {inCart.qty}
        </span>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ProviderLogo provider={providerLabel} category={product.category} size="xs" />
          <span className="brand-badge-neutral min-w-0 truncate">
            {hasSearch ? renderHighlightedText(providerLabel, searchKeyword) : providerLabel}
          </span>
        </div>
        <span className={`${marginClass} shrink-0`}>
          {margin < 0 ? formatRupiah(margin) : `+${formatRupiah(margin)}`}
        </span>
      </div>

      {hasSearch ? (
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {getCategoryLabel(product.category)}
        </p>
      ) : null}

      <div className="mt-4 flex-1">
        <p className="min-h-[48px] text-sm font-bold leading-6 text-slate-950">
          {hasSearch
            ? renderHighlightedText(getShortProductName(product), searchKeyword)
            : getShortProductName(product)}
        </p>
        <p className="mt-2 text-xs font-semibold text-slate-500">
          {hasSearch ? renderHighlightedText(serviceTypeLabel, searchKeyword) : serviceTypeLabel}
        </p>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="relative">
          <p className="text-lg font-black tracking-tight text-slate-950">
            {formatRupiah(sellingPrice)}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Modal {formatRupiah(cost)}
          </p>
        </div>
        <span className="rounded-md bg-[var(--brand-gold)]/12 px-3 py-2 text-xs font-semibold text-slate-950">
          {inCart ? `${inCart.qty}x` : "Pilih"}
        </span>
      </div>
      </button>
    </div>
  );
}

export default function DigitalPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refreshServiceProducts, serviceProducts } = useProducts();
  const { createDigitalTransaction } = useTransactions();
  const { currentShift, selectedCashier } = useShift();
  const { walletBalances } = useWallet();

  const searchInputRef = useRef(null);
  const firstCheckoutInputRef = useRef(null);

  const [step, setStep] = useState("product");
  const [activeCategory, setActiveCategory] = useState(defaultServiceCategory);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [activeServiceType, setActiveServiceType] = useState("semua");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [paymentGroup, setPaymentGroup] = useState("cash");
  const [directSupplierPayment, setDirectSupplierPayment] = useState(
    getDefaultExternalPayment(defaultServiceCategory)
  );
  const [note, setNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const processingRef = useRef(false);
  const [receiptTransaction, setReceiptTransaction] = useState(null);
  const [directForm, setDirectForm] = useState(() =>
    createDirectInputForm(defaultServiceCategory)
  );
  const [directSellingPriceTouched, setDirectSellingPriceTouched] = useState(false);
  const [directCostTouched, setDirectCostTouched] = useState(false);
  const [favoriteServiceIds, setFavoriteServiceIds] = useState(() =>
    readStoredIdList(FAVORITE_SERVICES_KEY)
  );
  const [recentServiceIds, setRecentServiceIds] = useState(() =>
    readStoredIdList(RECENT_SERVICES_KEY)
  );
  const [lastRepeatDraft, setLastRepeatDraft] = useState(() =>
    readStoredObject(LAST_REPEAT_SERVICE_KEY)
  );
  const [repeatConfirmationOpen, setRepeatConfirmationOpen] = useState(false);
  const serviceHydrationRef = useRef(false);
  const [serviceHydrating, setServiceHydrating] = useState(false);
  const [serviceHydrationError, setServiceHydrationError] = useState("");

  const canManageServices = user?.role === "pemilik";
  const directInputCategory = getDirectInputCategoryConfig(activeCategory);
  const isDirectInputActiveCategory = Boolean(directInputCategory);
  const directSupplierPaymentOptions = useMemo(
    () => getExternalPaymentOptions(activeCategory),
    [activeCategory]
  );

  const hydrateServiceProducts = useCallback(async () => {
    serviceHydrationRef.current = true;
    setServiceHydrating(true);
    setServiceHydrationError("");

    try {
      await refreshServiceProducts();
    } catch (error) {
      const message = error.message || "Gagal memuat katalog layanan digital.";
      console.error("Gagal memuat katalog layanan digital:", error);
      setServiceHydrationError(message);
      showNotification("error", message);
    } finally {
      setServiceHydrating(false);
    }
  }, [refreshServiceProducts]);

  useEffect(() => {
    if (serviceHydrationRef.current || serviceProducts.length) return undefined;

    void hydrateServiceProducts();
    return undefined;
  }, [hydrateServiceProducts, serviceProducts.length]);

  const retryServiceHydration = () => {
    serviceHydrationRef.current = false;
    void hydrateServiceProducts();
  };

  const activeProducts = useMemo(
    () =>
      serviceProducts
        .filter(
          (product) =>
            product.active !== false &&
            productCategoryIdSet.has(product.category)
        )
        .sort((left, right) => {
          const providerCompare = sortText(left.provider, right.provider);
          if (providerCompare !== 0) return providerCompare;

          const typeCompare = sortText(getServiceTypeValue(left), getServiceTypeValue(right));
          if (typeCompare !== 0) return typeCompare;

          const priceCompare = getDefaultSellingPrice(left) - getDefaultSellingPrice(right);
          if (priceCompare !== 0) return priceCompare;

          return sortText(left.name, right.name);
        }),
    [serviceProducts]
  );

  const categoryProductCounts = useMemo(
    () =>
      activeProducts.reduce((acc, product) => {
        acc[product.category] = (acc[product.category] || 0) + 1;
        return acc;
      }, {}),
    [activeProducts]
  );

  const providerProductCountMap = useMemo(
    () =>
      activeProducts.reduce((acc, product) => {
        const provider = normalizeProviderLabel(product.provider);
        acc[provider] = (acc[provider] || 0) + 1;
        return acc;
      }, {}),
    [activeProducts]
  );

  const categoryProducts = useMemo(
    () => activeProducts.filter((product) => product.category === activeCategory),
    [activeCategory, activeProducts]
  );

  const providerOptions = useMemo(
    () =>
      sortProviderOptions([
        ...new Set(categoryProducts.map((product) => normalizeProviderLabel(product.provider))),
      ]),
    [categoryProducts]
  );

  const providerProducts = useMemo(
    () =>
      selectedProvider
        ? categoryProducts.filter(
            (product) => normalizeProviderLabel(product.provider) === selectedProvider
          )
        : [],
    [categoryProducts, selectedProvider]
  );

  const serviceTypeOptions = useMemo(
    () => (selectedProvider ? getServiceTypeOptions(providerProducts) : []),
    [providerProducts, selectedProvider]
  );

  const searchKeyword = search.trim().toLowerCase();
  const hasSearch = searchKeyword.length > 0;
  const searchedDestinationNumber = getDestinationNumber(search);

  const visibleProducts = useMemo(() => {
    const rows = hasSearch && !searchedDestinationNumber
      ? activeProducts
          .filter((product) => productMatchesSearch(product, searchKeyword))
          .sort(
            (left, right) =>
              getProductSearchScore(right, searchKeyword) -
              getProductSearchScore(left, searchKeyword)
          )
      : searchedDestinationNumber
        ? activeProducts.slice(0, 5)
      : providerProducts.filter((product) => {
          if (activeServiceType === "semua") return true;
          return getServiceTypeLabel(getServiceTypeValue(product)) === activeServiceType;
        });

    return rows.slice(0, MAX_RENDERED_SERVICE_PRODUCTS);
  }, [activeProducts, activeServiceType, hasSearch, providerProducts, searchKeyword, searchedDestinationNumber]);
  const visibleProductsCapped = visibleProducts.length >= MAX_RENDERED_SERVICE_PRODUCTS;

  const favoriteServices = useMemo(() => {
    const favoriteSet = new Set(favoriteServiceIds.map(String));
    return activeProducts
      .filter((product) => favoriteSet.has(String(product.id)))
      .slice(0, MAX_QUICK_SERVICES);
  }, [activeProducts, favoriteServiceIds]);

  const recentServices = useMemo(() => {
    const productById = new Map(activeProducts.map((product) => [String(product.id), product]));
    return recentServiceIds
      .map((productId) => productById.get(String(productId)))
      .filter(Boolean)
      .slice(0, MAX_QUICK_SERVICES);
  }, [activeProducts, recentServiceIds]);

  const cartItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.qty || 0), 0),
    [cart]
  );

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + getLineSubtotal(item), 0),
    [cart]
  );

  const cartCostTotal = useMemo(
    () => cart.reduce((sum, item) => sum + getLineCostTotal(item), 0),
    [cart]
  );

  const cartProfit = cartTotal - cartCostTotal;
  const resolvedPaymentMethod = getResolvedPaymentMethod(paymentGroup);
  const resolvedPaymentLabel = getPaymentLabel(paymentGroup);
  const directSupplierPaymentLabel = getSupplierPaymentLabel(directSupplierPayment);
  const directNominal = toPositiveInteger(directForm.nominal);
  const directAdminFee = toPositiveInteger(directForm.adminFee);
  const directDefaultCost = directNominal + directAdminFee;
  const directModal = toPositiveInteger(directForm.cost);
  const directSellingPrice = toPositiveInteger(directForm.sellingPrice);
  const directProfit = directSellingPrice - directModal;
  const directSupplierPaymentBalance = useMemo(
    () =>
      Number(
        (walletBalances || []).find((wallet) => wallet.id === directSupplierPayment)?.balance || 0
      ),
    [directSupplierPayment, walletBalances]
  );
  const directWalletDeductionAmount =
    directSupplierPayment === "pasar_kuota" ? directSellingPrice : directModal;
  const directWalletBalanceEnough =
    directWalletDeductionAmount <= 0 || directSupplierPaymentBalance >= directWalletDeductionAmount;
  const directTargetError =
    directForm.targetNumber.trim() && directForm.targetNumber.replace(/\D/g, "").length < 7
      ? "Nomor tujuan terlalu pendek. Periksa kembali sebelum bayar."
      : "";
  const activeCategoryMeta = serviceCategoryOptions.find(
    (category) => category.value === activeCategory
  );
  const selectedProductSummary = cart[0] || null;
  const checkoutReady = cart.length > 0;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    if (!providerOptions.includes(selectedProvider)) {
      setSelectedProvider("");
      setActiveServiceType("semua");
    }
  }, [providerOptions, selectedProvider]);

  useEffect(() => {
    if (activeServiceType !== "semua" && !serviceTypeOptions.includes(activeServiceType)) {
      setActiveServiceType("semua");
    }
  }, [activeServiceType, serviceTypeOptions]);

  useEffect(() => {
    if (
      directSupplierPaymentOptions.length &&
      !directSupplierPaymentOptions.some((method) => method.value === directSupplierPayment)
    ) {
      setDirectSupplierPayment(getDefaultExternalPayment(activeCategory));
    }
  }, [activeCategory, directSupplierPayment, directSupplierPaymentOptions]);

  useEffect(() => {
    if (isDirectInputActiveCategory) {
      window.requestAnimationFrame(() => {
        firstCheckoutInputRef.current?.focus();
      });
      return;
    }

    if (step === "product") {
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      return;
    }

    if (step === "checkout") {
      window.requestAnimationFrame(() => {
        firstCheckoutInputRef.current?.focus();
      });
    }
  }, [isDirectInputActiveCategory, step]);

  useEffect(() => {
    if (!isDirectInputActiveCategory || directSellingPriceTouched) return;

    const nextSellingPrice = directDefaultCost > 0 ? String(directDefaultCost) : "";

    setDirectForm((currentForm) =>
      currentForm.sellingPrice === nextSellingPrice
        ? currentForm
        : { ...currentForm, sellingPrice: nextSellingPrice }
    );
  }, [directDefaultCost, directSellingPriceTouched, isDirectInputActiveCategory]);

  useEffect(() => {
    if (!isDirectInputActiveCategory || directCostTouched) return;

    const nextCost = directDefaultCost > 0 ? String(directDefaultCost) : "";

    setDirectForm((currentForm) =>
      currentForm.cost === nextCost ? currentForm : { ...currentForm, cost: nextCost }
    );
  }, [directCostTouched, directDefaultCost, isDirectInputActiveCategory]);

  const chooseCategory = (categoryId) => {
    if (isDirectInputCategory(categoryId) && cart.length) {
      showNotification(
        "warning",
        "Selesaikan checkout produk dulu sebelum membuka transfer/e-wallet."
      );
      return;
    }

    setActiveCategory(categoryId);
    setSelectedProvider("");
    setActiveServiceType("semua");
    setStep("product");

    if (isDirectInputCategory(categoryId)) {
      setSearchInput("");
      setSearch("");
      setDirectForm(createDirectInputForm(categoryId));
      setDirectSellingPriceTouched(false);
      setDirectCostTouched(false);
      resetCheckoutFields(categoryId);
    }
  };

  const chooseProvider = (provider) => {
    const matchedProduct = activeProducts.find(
      (product) => normalizeProviderLabel(product.provider) === provider
    );
    if (matchedProduct?.category && matchedProduct.category !== activeCategory) {
      setActiveCategory(matchedProduct.category);
    }

    setSelectedProvider(provider);
    setActiveServiceType("semua");
    setSearchInput("");
    setSearch("");
  };

  const rememberCompletedServices = (transactionItems = []) => {
    const completedIds = transactionItems
      .map((item) => String(item.product_id || ""))
      .filter(Boolean);
    if (!completedIds.length) return;

    setRecentServiceIds((currentIds) =>
      persistStoredIdList(
        RECENT_SERVICES_KEY,
        [...new Set([...completedIds, ...currentIds])].slice(0, MAX_QUICK_SERVICES)
      )
    );
  };

  const rememberRepeatDraft = (item, mode = "catalog") => {
    if (!item) return;

    const nextDraft = {
      mode,
      productId: item.product_id || null,
      category: item.category,
      provider: item.provider || item.platform || "",
      serviceType: item.service_type || "",
      productName: item.product_name_snapshot || item.product_name || "Layanan digital",
      targetNumber: item.target_number || "",
      customerName: item.customer_name || item.receiver_name || "",
      nominal: item.nominal || item.selling_price || "",
      adminFee: item.admin_fee || "",
      sellingPrice: item.selling_price || item.price || "",
      cost: item.cost || "",
      paymentSupplier: item.payment_supplier || directSupplierPayment,
    };

    setLastRepeatDraft(persistStoredObject(LAST_REPEAT_SERVICE_KEY, nextDraft));
  };

  const applyLastRepeat = () => {
    if (!lastRepeatDraft) return;

    if (lastRepeatDraft.mode === "direct") {
      chooseCategory(lastRepeatDraft.category);
      setDirectForm({
        platform: lastRepeatDraft.provider,
        nominal: String(lastRepeatDraft.nominal || ""),
        adminFee: String(lastRepeatDraft.adminFee || ""),
        sellingPrice: String(lastRepeatDraft.sellingPrice || ""),
        cost: String(lastRepeatDraft.cost || ""),
        recipientName: lastRepeatDraft.customerName || "",
        targetNumber: lastRepeatDraft.targetNumber || "",
      });
      setDirectSellingPriceTouched(true);
      setDirectCostTouched(true);
      setDirectSupplierPayment(
        lastRepeatDraft.paymentSupplier || getDefaultExternalPayment(lastRepeatDraft.category)
      );
    } else {
      const product = activeProducts.find(
        (item) => String(item.id) === String(lastRepeatDraft.productId)
      );

      if (!product) {
        showNotification("warning", "Produk transaksi terakhir sudah tidak aktif.");
        setRepeatConfirmationOpen(false);
        return;
      }

      setActiveCategory(product.category);
      setSelectedProvider(normalizeProviderLabel(product.provider));
      setCart([
        {
          ...createCartItem(product, lastRepeatDraft.targetNumber),
          customerName: lastRepeatDraft.customerName || "",
          sellingPrice: String(lastRepeatDraft.sellingPrice || getDefaultSellingPrice(product)),
          cost: String(lastRepeatDraft.cost || getProductCost(product)),
        },
      ]);
      setStep("product");
    }

    setRepeatConfirmationOpen(false);
    showNotification("success", "Data transaksi terakhir sudah diisi. Periksa kembali lalu bayar.");
  };

  const toggleFavoriteService = (productId) => {
    const id = String(productId || "");
    if (!id) return;

    setFavoriteServiceIds((currentIds) => {
      const nextIds = currentIds.includes(id)
        ? currentIds.filter((item) => item !== id)
        : [id, ...currentIds].slice(0, MAX_QUICK_SERVICES);

      return persistStoredIdList(FAVORITE_SERVICES_KEY, nextIds);
    });
  };

  const addToCart = (product) => {
    setCart((currentCart) => {
      const existing = currentCart.find((item) => item.productId === product.id);

      if (existing) {
        return currentCart.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                qty: item.qty + 1,
              }
            : item
        );
      }

      return [...currentCart, createCartItem(product, searchedDestinationNumber)];
    });
  };

  const handleSearchKeyDown = (event) => {
    if (event.key !== "Enter") return;

    if (searchedDestinationNumber && cart.length) {
      event.preventDefault();
      setCart((currentCart) =>
        currentCart.map((item, index) =>
          index === 0 ? { ...item, targetNumber: searchedDestinationNumber } : item
        )
      );
      showNotification("success", "Nomor tujuan diterapkan ke layanan pertama.");
      return;
    }

    const immediateKeyword = searchInput.trim().toLowerCase();
    const firstProduct = immediateKeyword
      ? activeProducts.find((product) => productMatchesSearch(product, immediateKeyword))
      : visibleProducts[0];

    if (!firstProduct) return;

    event.preventDefault();
    addToCart(firstProduct);
  };

  const setCartQty = (cartId, nextQty) => {
    setCart((currentCart) =>
      currentCart.flatMap((item) => {
        if (item.cartId !== cartId) return [item];
        const safeQty = Math.max(0, Math.trunc(Number(nextQty || 0)));
        return safeQty > 0 ? [{ ...item, qty: safeQty }] : [];
      })
    );
  };

  const updateCartItem = (cartId, key, value) => {
    setCart((currentCart) =>
      currentCart.map((item) => {
        if (item.cartId !== cartId) return item;

        return {
          ...item,
          [key]: value,
        };
      })
    );
  };

  const increaseSellingPrice = (cartId, amount) => {
    setCart((currentCart) =>
      currentCart.map((item) =>
        item.cartId === cartId
          ? {
              ...item,
              sellingPrice: String(getLineSellingPrice(item) + amount),
            }
          : item
      )
    );
  };

  const resetCheckoutFields = (categoryId = activeCategory) => {
    setPaymentGroup("cash");
    setDirectSupplierPayment(getDefaultExternalPayment(categoryId));
    setNote("");
  };

  const resetDirectInputForm = (categoryId = activeCategory) => {
    setDirectForm(createDirectInputForm(categoryId));
    setDirectSellingPriceTouched(false);
    setDirectCostTouched(false);
  };

  const resetTransaction = () => {
    setCart([]);
    resetCheckoutFields();
    setStep("product");
  };

  const updateDirectForm = (key, value) => {
    setDirectForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  };

  const updateDirectSellingPrice = (value) => {
    setDirectSellingPriceTouched(true);
    updateDirectForm("sellingPrice", value);
  };

  const increaseDirectSellingPrice = (amount) => {
    setDirectSellingPriceTouched(true);
    setDirectForm((currentForm) => ({
      ...currentForm,
      sellingPrice: String(toPositiveInteger(currentForm.sellingPrice) + amount),
    }));
  };

  const updateDirectCost = (value) => {
    setDirectCostTouched(true);
    updateDirectForm("cost", value);
  };

  const validateCheckout = () => {
    if (!currentShift) {
      showNotification("warning", "Buka shift dulu sebelum menyimpan transaksi.");
      navigate("/shift");
      return false;
    }

    if (!cart.length) {
      showNotification("warning", "Keranjang layanan masih kosong.");
      setStep("product");
      return false;
    }

    const invalidPrice = cart.find((item) => getLineSellingPrice(item) <= 0);
    if (invalidPrice) {
      showNotification("warning", `Harga jual ${invalidPrice.name} wajib diisi.`);
      return false;
    }

    const invalidCost = cart.find((item) => getLineCost(item) < 0);
    if (invalidCost) {
      showNotification("warning", `Modal ${invalidCost.name} tidak valid.`);
      return false;
    }

    const missingTarget = cart.find((item) => !String(item.targetNumber || "").trim());
    if (missingTarget) {
      showNotification("warning", `${buildTargetLabel(missingTarget)} wajib diisi.`);
      return false;
    }

    return true;
  };

  const validateDirectInput = () => {
    if (!currentShift) {
      showNotification("warning", "Buka shift dulu sebelum menyimpan transaksi.");
      navigate("/shift");
      return false;
    }

    if (!directInputCategory) {
      showNotification("warning", "Pilih kategori transfer/e-wallet dulu.");
      return false;
    }

    if (!String(directForm.platform || "").trim()) {
      showNotification("warning", "Platform wajib dipilih.");
      return false;
    }

    if (directNominal <= 0) {
      showNotification("warning", "Nominal wajib lebih besar dari 0.");
      return false;
    }

    if (directSellingPrice <= 0) {
      showNotification("warning", "Harga jual wajib lebih besar dari 0.");
      return false;
    }

    if (!String(directForm.targetNumber || "").trim()) {
      showNotification("warning", `${directInputCategory.targetLabel} wajib diisi.`);
      return false;
    }

    if (directTargetError) {
      showNotification("warning", directTargetError);
      return false;
    }

    if (
      directInputCategory.recipientRequired &&
      !String(directForm.recipientName || "").trim()
    ) {
      showNotification("warning", `${directInputCategory.recipientLabel} wajib diisi.`);
      return false;
    }

    if (
      !directSupplierPaymentOptions.some(
        (method) => method.value === directSupplierPayment
      )
    ) {
      showNotification("warning", "Pilih metode bayar ke aplikasi luar.");
      return false;
    }

    return true;
  };

  const buildTransactionItems = () =>
    cart.map((item) => {
      const unitPrice = getLineSellingPrice(item);
      const unitCost = getLineCost(item);
      const qty = Number(item.qty || 0);
      const subtotal = unitPrice * qty;
      const costTotal = unitCost * qty;
      const productId = item.productId || null;
      const platform = item.platform || item.provider || "";

      return {
        id: item.cartId,
        product_id: productId,
        service_product_id: productId,
        product_name_snapshot: item.name,
        product_name: item.name,
        category: item.category,
        provider: item.provider,
        service_type: item.serviceType,
        type: item.type || "product",
        platform,
        transfer_platform: platform,
        nominal: unitPrice,
        qty,
        price: unitPrice,
        selling_price: unitPrice,
        cost: unitCost,
        subtotal,
        cost_total: costTotal,
        profit: subtotal - costTotal,
        target_number: String(item.targetNumber || "").trim(),
        customer_name: String(item.customerName || "").trim(),
      };
    });

  const handleContinue = () => {
    if (!cart.length) {
      showNotification("warning", "Pilih produk layanan dulu sebelum checkout.");
      return;
    }

    setStep("product");
    window.requestAnimationFrame(() => {
      firstCheckoutInputRef.current?.focus();
    });
  };

  const handleCheckout = async (event) => {
    event.preventDefault();

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      showNotification(
        "warning",
        "Koneksi offline. Transaksi layanan belum disimpan; lanjutkan setelah koneksi kembali."
      );
      return;
    }

    if (!validateCheckout()) return;

    if (processingRef.current) return;
    processingRef.current = true;
    const printWindow = openReceiptPrintWindow();
    const transactionItems = buildTransactionItems();
    const firstItem = transactionItems[0];
    const serviceTitle =
      transactionItems.length === 1
        ? firstItem.product_name_snapshot
        : `${cartItemCount} layanan digital`;
    const transferPlatform = firstItem.transfer_platform || firstItem.platform || firstItem.provider;

    setProcessing(true);
    try {
      const savedTransaction = await createDigitalTransaction({
        jenis: firstItem.category,
        category: firstItem.category,
        provider:
          transactionItems.length === 1
            ? firstItem.provider
            : `${transactionItems.length} provider`,
        service_type:
          transactionItems.length === 1 ? firstItem.service_type : "Multi layanan",
        service_product_id: firstItem.service_product_id,
        product_id: firstItem.product_id,
        product_name: serviceTitle,
        nominal: cartTotal,
        harga_jual: cartTotal,
        selling_price: cartTotal,
        modal: cartCostTotal,
        cost: cartCostTotal,
        profit: cartProfit,
        nomor_tujuan: firstItem.target_number,
        target_number: firstItem.target_number,
        nama_tujuan: firstItem.customer_name,
        customer_name: firstItem.customer_name,
        platform: transferPlatform,
        transfer_platform: transferPlatform,
        payment_method: resolvedPaymentMethod,
        catatan: note || serviceTitle,
        transaction_items: transactionItems,
        transaction_details: {
          mode: "digital_pos_cart",
          item_count: cartItemCount,
          platform: transferPlatform,
          payment_label: resolvedPaymentLabel,
          payment_method: resolvedPaymentMethod,
          total: cartTotal,
          cost: cartCostTotal,
          profit: cartProfit,
        },
      });

      const printableTransaction = {
        ...savedTransaction,
        transaction_items: transactionItems,
        total_bayar: cartTotal,
        uang_diterima: cartTotal,
        kembalian: 0,
        metode_bayar: resolvedPaymentLabel,
        payment_method: resolvedPaymentLabel,
      };

      rememberCompletedServices(transactionItems);
      rememberRepeatDraft(firstItem);
      resetTransaction();
      setReceiptTransaction(printableTransaction);
      showNotification(
        "success",
        `Transaksi ${savedTransaction.no_transaksi} berhasil disimpan.`
      );

      if (printWindow) {
        const printResult = printTransactionReceiptWithStatus(printableTransaction, printWindow);
        if (!printResult.ok) {
          showNotification("warning", `Transaksi tersimpan, tetapi print gagal. ${printResult.message}`);
        }
      } else {
        showNotification("warning", "Transaksi tersimpan, tetapi popup print diblokir. Cetak ulang dari preview struk.");
      }
    } catch (error) {
      if (printWindow) {
        printWindow.close();
      }
      showNotification(
        "error",
        getMoneySaveFailureMessage(error, "Gagal menyimpan transaksi layanan.")
      );
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  };

  const handleDirectInputSubmit = async (event) => {
    event.preventDefault();

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      showNotification(
        "warning",
        "Koneksi offline. Transaksi layanan belum disimpan; lanjutkan setelah koneksi kembali."
      );
      return;
    }

    if (!validateDirectInput()) return;

    if (processingRef.current) return;
    processingRef.current = true;
    const platform = String(directForm.platform || "").trim();
    const targetNumber = String(directForm.targetNumber || "").trim();
    const receiverName = String(directForm.recipientName || "").trim();
    const serviceTitle = `${directInputCategory.label} - ${platform}`;
    const printWindow = openReceiptPrintWindow();
    const transactionItems = [
      {
        id: crypto.randomUUID(),
        product_id: null,
        service_product_id: null,
        product_name_snapshot: serviceTitle,
        product_name: serviceTitle,
        category: activeCategory,
        provider: platform,
        service_type: directInputCategory.type,
        type: directInputCategory.type,
        platform,
        transfer_platform: platform,
        nominal: directNominal,
        admin_fee: directAdminFee,
        qty: 1,
        price: directSellingPrice,
        selling_price: directSellingPrice,
        cost: directModal,
        subtotal: directSellingPrice,
        cost_total: directModal,
        profit: directProfit,
        target_number: targetNumber,
        customer_name: receiverName,
        receiver_name: receiverName,
        payment_supplier: directSupplierPayment,
        payment_supplier_label: directSupplierPaymentLabel,
      },
    ];

    setProcessing(true);
    try {
      const savedTransaction = await createDigitalTransaction({
        jenis: activeCategory,
        category: activeCategory,
        provider: platform,
        service_type: directInputCategory.type,
        service_product_id: null,
        product_id: null,
        product_name: serviceTitle,
        nominal: directNominal,
        admin_fee: directAdminFee,
        biaya_admin: directAdminFee,
        total: directSellingPrice,
        harga_jual: directSellingPrice,
        selling_price: directSellingPrice,
        modal: directModal,
        cost: directModal,
        profit: directProfit,
        nomor_tujuan: targetNumber,
        target_number: targetNumber,
        nama_tujuan: receiverName,
        customer_name: receiverName,
        receiver_name: receiverName,
        platform,
        transfer_platform: platform,
        platform_sumber: directSupplierPayment,
        payment_method: resolvedPaymentMethod,
        payment_supplier: directSupplierPayment,
        catatan: note || serviceTitle,
        transaction_items: transactionItems,
        transaction_details: {
          mode: "manual_transfer",
          item_count: 1,
          platform,
          nominal: directNominal,
          admin_fee: directAdminFee,
          total: directSellingPrice,
          selling_price: directSellingPrice,
          cost: directModal,
          profit: directProfit,
          target_number: targetNumber,
          receiver_name: receiverName,
          payment_label: directSupplierPaymentLabel,
          payment_method: resolvedPaymentMethod,
          source_platform: directSupplierPayment,
          payment_supplier: directSupplierPayment,
          payment_supplier_label: directSupplierPaymentLabel,
        },
      });

      const printableTransaction = {
        ...savedTransaction,
        transaction_items: transactionItems,
        total_bayar: directSellingPrice,
        uang_diterima: directSellingPrice,
        kembalian: 0,
        metode_bayar: directSupplierPaymentLabel,
        payment_method: directSupplierPaymentLabel,
      };

      rememberRepeatDraft(transactionItems[0], "direct");
      resetDirectInputForm(activeCategory);
      resetCheckoutFields();
      setReceiptTransaction(printableTransaction);
      showNotification(
        "success",
        `Transaksi ${savedTransaction.no_transaksi} berhasil disimpan.`
      );

      if (printWindow) {
        const printResult = printTransactionReceiptWithStatus(printableTransaction, printWindow);
        if (!printResult.ok) {
          showNotification("warning", `Transaksi tersimpan, tetapi print gagal. ${printResult.message}`);
        }
      } else {
        showNotification("warning", "Transaksi tersimpan, tetapi popup print diblokir. Cetak ulang dari preview struk.");
      }
    } catch (error) {
      if (printWindow) {
        printWindow.close();
      }
      showNotification(
        "error",
        getMoneySaveFailureMessage(error, "Gagal menyimpan transaksi layanan.")
      );
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  };

  const renderQuickServiceStrip = (title, products, emptyText) => (
    <div className="rounded-lg border border-slate-200 bg-white/72 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{title}</p>
        <span className="brand-badge-neutral">{products.length} cepat</span>
      </div>

      {products.length ? (
        <div className="brand-scrollbar mt-3 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2">
            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => addToCart(product)}
                className="min-w-[190px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm transition hover:border-[var(--brand-gold)]/40 hover:bg-[var(--brand-surface-tint)]"
              >
                <div className="flex items-center gap-2">
                  <ProviderLogo
                    provider={product.provider}
                    category={product.category}
                    size="xs"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950">{getShortProductName(product)}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                      {normalizeProviderLabel(product.provider)} - {formatRupiah(getDefaultSellingPrice(product))}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">{emptyText}</p>
      )}
    </div>
  );

  const renderRepeatPanel = () => (
    <Panel className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="brand-kicker">Ulang transaksi</p>
          <p className="mt-1 text-sm font-bold text-slate-950">
            {lastRepeatDraft ? lastRepeatDraft.productName : "Belum ada transaksi terakhir"}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-500">
            {lastRepeatDraft
              ? `${lastRepeatDraft.targetNumber || "Tanpa nomor"} - ${formatRupiah(lastRepeatDraft.sellingPrice || lastRepeatDraft.nominal)}`
              : "Transaksi terakhir akan muncul di sini setelah berhasil disimpan."}
          </p>
        </div>
        <button
          type="button"
          disabled={!lastRepeatDraft}
          onClick={() => setRepeatConfirmationOpen(true)}
          className="brand-button-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ulangi terakhir
        </button>
      </div>
    </Panel>
  );

  const renderProviderCommandCenter = () => (
    <div className="space-y-4">
      <Panel variant="strong" className="p-5">
        <div className="max-w-3xl">
          <div className="min-w-0">
            <p className="brand-kicker">Layanan digital</p>
            <h2 className="mt-2 font-display text-2xl font-black tracking-tight text-slate-950">
              Pilih kategori, produk, nomor, lalu bayar
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Gunakan urutan ini untuk mengurangi salah pilih nominal atau provider.
            </p>
          </div>
        </div>

        <div
          className={`mt-5 grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 ${
            cartItemCount ? "" : "2xl:grid-cols-5"
          }`}
        >
          {serviceCategoryOptions.map((category) => (
            <CategoryCard
              key={category.value}
              category={category}
              count={categoryProductCounts[category.value] || 0}
              active={activeCategory === category.value}
              onClick={() => chooseCategory(category.value)}
            />
          ))}
        </div>
      </Panel>

      <Panel className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="brand-kicker">Provider</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">
              {activeCategoryMeta?.label || getCategoryLabel(activeCategory)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Pilih provider untuk membuka produk atau nominal. Pencarian bisa langsung dipakai.
            </p>
          </div>
          <span className="brand-badge-neutral self-start lg:self-auto">
            {providerOptions.length} provider
          </span>
        </div>

        {providerOptions.length ? (
          <div
            className={`mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${
              cartItemCount ? "" : "2xl:grid-cols-4"
            }`}
          >
            {providerOptions.map((provider) => (
              <ProviderCard
                key={provider}
                provider={provider}
                category={activeCategory}
                count={providerProductCountMap[provider] || 0}
                active={selectedProvider === provider}
                onClick={() => chooseProvider(provider)}
              />
            ))}
          </div>
        ) : (
          <DigitalEmptyState
            title={`Belum ada provider ${activeCategoryMeta?.label || getCategoryLabel(activeCategory)}`}
            description="Tambahkan produk aktif di Kelola Layanan, atau gunakan search untuk mencari layanan dari kategori lain."
            action={
              canManageServices ? (
                <Link to="/layanan-produk" className="brand-button-secondary gap-2">
                  <AppIcon name="settings" className="h-4 w-4" />
                  Kelola Layanan
                </Link>
              ) : null
            }
          />
        )}
      </Panel>

      <div className="grid gap-3 xl:grid-cols-2">
        {renderQuickServiceStrip(
          "Favorit",
          favoriteServices,
          "Klik bintang pada produk supaya muncul sebagai jalur cepat."
        )}
        {renderQuickServiceStrip(
          "Terakhir dijual",
          recentServices,
          "Produk dari transaksi berhasil akan tampil di sini untuk repeat transaksi."
        )}
      </div>
      {renderRepeatPanel()}
    </div>
  );

  const renderProductCheckoutPanel = (mobile = false) => (
    <Panel
      variant="strong"
      className={`${mobile ? "max-h-[86vh] overflow-y-auto rounded-b-none border-x-0 border-b-0 p-4" : "brand-cart-rail flex flex-col p-5 xl:sticky xl:top-24 xl:self-start"}`}
    >
      <form
        onSubmit={handleCheckout}
        className={`${mobile ? "" : "brand-scroll-region-y brand-scrollbar flex-1 pr-1"} space-y-4`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="brand-kicker">Checkout</p>
            <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              {formatRupiah(cartTotal)}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {cartItemCount ? `${cartItemCount} item digital` : "Pilih produk dulu"}
            </p>
          </div>
          <span className={checkoutReady ? "brand-badge-success" : "brand-badge-neutral"}>
            {checkoutReady ? "Siap isi" : "Kosong"}
          </span>
        </div>

        {selectedProductSummary ? (
          <div className="rounded-lg border border-[var(--brand-gold)]/30 bg-[var(--brand-gold)]/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <ProviderLogo
                provider={selectedProductSummary.provider}
                category={selectedProductSummary.category}
                size="sm"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">
                  {selectedProductSummary.name}
                </p>
                <p className="mt-1 truncate text-xs font-semibold text-slate-600">
                  {selectedProductSummary.provider} - {getServiceTypeLabel(selectedProductSummary.serviceType)}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {cart.length ? (
          <div className={`${mobile ? "max-h-[42vh]" : "max-h-[46vh]"} brand-scrollbar space-y-3 overflow-y-auto pr-1`}>
            {cart.map((item, index) => {
              const lineSubtotal = getLineSubtotal(item);
              const lineProfit = lineSubtotal - getLineCostTotal(item);

              return (
                <div key={item.cartId} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <ProviderLogo provider={item.provider} category={item.category} size="xs" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">{item.name}</p>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                          {item.provider} - {formatRupiah(lineSubtotal)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCartQty(item.cartId, 0)}
                      className="text-xs font-bold text-rose-600"
                    >
                      Hapus
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCartQty(item.cartId, item.qty - 1)}
                      className="brand-icon-button brand-icon-button-sm brand-icon-button-muted"
                      aria-label={`Kurangi ${item.name}`}
                    >
                      -
                    </button>
                    <span className="text-center text-sm font-black text-slate-950">
                      {item.qty}x
                    </span>
                    <button
                      type="button"
                      onClick={() => setCartQty(item.cartId, item.qty + 1)}
                      className="brand-icon-button brand-icon-button-sm brand-icon-button-primary"
                      aria-label={`Tambah ${item.name}`}
                    >
                      +
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-600">
                        {buildTargetLabel(item)}
                      </label>
                      <input
                        ref={index === 0 ? firstCheckoutInputRef : null}
                        value={item.targetNumber}
                        onChange={(event) =>
                          updateCartItem(item.cartId, "targetNumber", event.target.value)
                        }
                        className="brand-input h-11 font-bold"
                        placeholder={item.category === "voucher_game" ? "Masukkan user ID" : "Masukkan nomor tujuan"}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-600">
                        {buildCustomerNameLabel(item)}
                      </label>
                      <input
                        value={item.customerName}
                        onChange={(event) =>
                          updateCartItem(item.cartId, "customerName", event.target.value)
                        }
                        className="brand-input h-11 font-bold"
                        placeholder={item.category === "voucher_game" ? "Opsional server ID" : "Opsional"}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-bold text-slate-600">
                          Harga
                        </label>
                        <CurrencyInput
                          value={item.sellingPrice}
                          onChange={(value) => updateCartItem(item.cartId, "sellingPrice", value)}
                          className="brand-input h-11 font-bold"
                          placeholder="Harga"
                          required
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-bold text-slate-600">
                          Modal
                        </label>
                        <CurrencyInput
                          value={item.cost}
                          onChange={(value) => updateCartItem(item.cartId, "cost", value)}
                          className="brand-input h-11 font-bold"
                          placeholder="Modal"
                          required
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {quickPriceIncrements.map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => increaseSellingPrice(item.cartId, amount)}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-600"
                        >
                          +{amount.toLocaleString("id-ID")}
                        </button>
                      ))}
                      <span
                        className={`ml-auto text-xs font-bold ${
                          lineProfit < 0 ? "text-rose-700" : "text-emerald-700"
                        }`}
                      >
                        Laba {formatRupiah(lineProfit)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
            <p className="text-sm font-bold text-slate-950">Belum ada produk dipilih</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Pilih nominal dari grid atau gunakan pencarian cepat seperti ff 140.
            </p>
          </div>
        )}

        <div>
          <p className="brand-kicker">Metode pembayaran</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {paymentGroups.map((method) => (
              <button
                key={method.value}
                type="button"
                onClick={() => setPaymentGroup(method.value)}
                className={`brand-choice-button min-h-[46px] ${
                  paymentGroup === method.value
                    ? "brand-choice-button-active"
                    : "brand-choice-button-idle"
                }`}
              >
                {method.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
          <div className="flex items-center justify-between gap-4 text-sm text-slate-600">
            <span>Subtotal</span>
            <span className="font-black text-slate-950">{formatRupiah(cartTotal)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4 text-sm text-slate-600">
            <span>Wallet source</span>
            <span className="font-semibold text-slate-950">
              {getSupplierPaymentLabel(getDefaultExternalPayment(activeCategory)) || "-"}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4 text-sm text-slate-600">
            <span>Metode</span>
            <span className="font-semibold text-slate-950">{resolvedPaymentLabel}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4 text-sm text-slate-600">
            <span>Laba</span>
            <span className={`font-semibold ${cartProfit < 0 ? "text-rose-700" : "text-emerald-700"}`}>
              {formatRupiah(cartProfit)}
            </span>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Catatan</label>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, NOTE_MAX_LENGTH))}
            maxLength={NOTE_MAX_LENGTH}
            className="brand-textarea min-h-[80px] pb-8"
            placeholder="Opsional"
          />
          <span
            className={`pointer-events-none absolute bottom-2 right-3 text-[11px] font-bold ${
              note.length > NOTE_MAX_LENGTH - 20 ? "text-amber-700" : "text-slate-400"
            }`}
          >
            {note.length}/{NOTE_MAX_LENGTH}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              resetCheckoutFields();
              showNotification("info", "Form pembayaran direset.");
            }}
            className="brand-button-secondary"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={processing || !checkoutReady}
            className="brand-button-success disabled:cursor-not-allowed disabled:opacity-60"
          >
            {processing ? "Menyimpan..." : "Bayar"}
          </button>
        </div>
      </form>
    </Panel>
  );

  useKeyboardShortcuts(
    [
      {
        key: "F2",
        allowInInput: true,
        action: () => {
          setStep("product");
          window.requestAnimationFrame(() => searchInputRef.current?.focus());
        },
      },
      {
        key: "F4",
        allowInInput: true,
        action: () => {
          if (isDirectInputActiveCategory) {
            window.requestAnimationFrame(() => firstCheckoutInputRef.current?.focus());
            return;
          }
          handleContinue();
        },
      },
      {
        key: "F8",
        allowInInput: true,
        action: () => {
          setPaymentGroup("qris");
          if (cart.length) {
            setStep("product");
            window.requestAnimationFrame(() => firstCheckoutInputRef.current?.focus());
          }
        },
      },
      {
        key: "Escape",
        allowInInput: true,
        action: () => {
          resetTransaction();
          resetDirectInputForm();
          setSearchInput("");
          setSearch("");
        },
      },
    ],
    !processing
  );

  const renderCategorySelector = (title = "Pilih Produk Layanan") => (
    <Panel variant="strong" className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="brand-kicker text-[var(--brand-gold-strong)]">Kategori</p>
          <h2 className="mt-2 font-display text-2xl font-bold text-slate-950">
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Pilih jalur transaksi digital yang sedang dilayani.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:w-auto">
          <DigitalMetric
            label="Aktif"
            value={isDirectInputActiveCategory ? directInputCategory.label : getCategoryLabel(activeCategory)}
            detail={isDirectInputActiveCategory ? "Input manual" : `${categoryProducts.length} produk`}
            tone="gold"
          />
          <DigitalMetric
            label="Keranjang"
            value={`${cartItemCount} item`}
            detail={cartItemCount ? formatRupiah(cartTotal) : "Belum ada item"}
          />
        </div>
      </div>

      <div className="brand-scrollbar mt-5 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-2">
          {serviceCategoryOptions.map((category) => {
            const productCount = categoryProductCounts[category.value] || 0;

            return (
              <button
                key={category.value}
                type="button"
                onClick={() => chooseCategory(category.value)}
                className={getChoiceButtonClass(activeCategory === category.value)}
              >
                <span>{category.label}</span>
                <span className="ml-2 text-xs opacity-70">
                  {category.mode === "product" ? productCount : "Input"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Panel>
  );

  const renderShiftBanner = (
    <Panel
      variant={currentShift ? "strong" : "muted"}
      className={`px-5 py-4 ${currentShift ? "" : "border-amber-200 bg-amber-50/70"}`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <span className={currentShift ? "brand-badge-success" : "brand-badge-warning"}>
            {currentShift ? "Shift aktif" : "Shift belum aktif"}
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-950">
            {currentShift
              ? `${selectedCashier?.nama || currentShift.cashier_name || "Kasir"} aktif sejak ${formatDateTime(
                  currentShift.start_time,
                  {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }
                )}`
              : "Shift belum aktif. Transaksi baru bisa disimpan setelah shift dibuka."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/shift")}
          className={currentShift ? "brand-button-secondary" : "brand-button-primary"}
        >
          {currentShift ? "Lihat Shift" : "Buka Shift"}
        </button>
      </div>
    </Panel>
  );

  return (
    <div className="space-y-4">
      <div className="brand-ops-header">
        <div className="min-w-0">
          <p className="brand-kicker text-[var(--brand-gold-strong)]">Kasir Digital</p>
          <h1 className="mt-1 truncate font-display text-2xl font-black tracking-tight text-slate-950">
            Provider - Produk - Nomor - Bayar
          </h1>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="brand-shortcut-strip">
            <span>F2 Cari</span>
            <span>F4 Checkout</span>
            <span>F8 QRIS</span>
            <span>Esc Reset</span>
          </div>
          {canManageServices ? (
            <Link to="/layanan-produk" className="brand-button-secondary gap-2">
              <AppIcon name="settings" className="h-4 w-4" />
              Kelola Layanan
            </Link>
          ) : null}
        </div>
      </div>

      {renderShiftBanner}

      {serviceHydrating ? (
        <Panel className="p-4 text-sm font-semibold text-slate-600">
          Memuat katalog layanan digital...
        </Panel>
      ) : null}

      {serviceHydrationError ? (
        <Panel className="border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">{serviceHydrationError}</p>
          <button type="button" onClick={retryServiceHydration} className="brand-button-secondary mt-3">
            Coba Lagi
          </button>
        </Panel>
      ) : null}

      {isDirectInputActiveCategory ? (
        <>
          {renderCategorySelector("Input Langsung")}
          {renderRepeatPanel()}

          <form
            onSubmit={handleDirectInputSubmit}
            className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]"
          >
            <Panel className="p-6">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">
                  {directInputCategory.eyebrow}
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold text-slate-950">
                  {directInputCategory.label}
                </h2>
              </div>

              <div className="mt-6 grid gap-5">
                <div className="relative">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    {directInputCategory.platformLabel}
                  </label>
                  <select
                    value={directForm.platform}
                    onChange={(event) => updateDirectForm("platform", event.target.value)}
                    className="brand-select"
                    required
                  >
                    {directInputCategory.platformOptions.map((platform) => (
                      <option key={platform} value={platform} className="bg-white">
                        {platform}
                      </option>
                    ))}
                  </select>
                  <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                    <ProviderLogo
                      provider={directForm.platform}
                      category={activeCategory}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase text-slate-500">
                        Platform
                      </p>
                      <p className="truncate text-sm font-black text-slate-950">
                        {directForm.platform || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      {directInputCategory.nominalLabel}
                    </label>
                    <CurrencyInput
                      ref={firstCheckoutInputRef}
                      value={directForm.nominal}
                      onChange={(value) => updateDirectForm("nominal", value)}
                      className="brand-input h-12 font-bold"
                      placeholder="Masukkan nominal"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      {directInputCategory.adminFeeLabel}
                    </label>
                    <CurrencyInput
                      value={directForm.adminFee}
                      onChange={(value) => updateDirectForm("adminFee", value)}
                      className="brand-input h-12 font-bold"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      {directInputCategory.recipientLabel}
                    </label>
                    <input
                      value={directForm.recipientName}
                      onChange={(event) => updateDirectForm("recipientName", event.target.value)}
                      className="brand-input h-12 font-bold"
                      placeholder={directInputCategory.recipientPlaceholder}
                      required={directInputCategory.recipientRequired}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      {directInputCategory.targetLabel}
                    </label>
                    <input
                      value={directForm.targetNumber}
                      onChange={(event) => updateDirectForm("targetNumber", event.target.value)}
                      className="brand-input h-12 font-bold"
                      placeholder={directInputCategory.targetPlaceholder}
                      required
                      aria-invalid={Boolean(directTargetError)}
                    />
                    {directTargetError ? (
                      <p className="mt-2 text-sm font-semibold text-rose-700">{directTargetError}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </Panel>

            <Panel variant="strong" className="p-6 xl:sticky xl:top-6 xl:self-start">
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Harga jual
                  </label>
                  <CurrencyInput
                    value={directForm.sellingPrice}
                    onChange={updateDirectSellingPrice}
                    className="brand-input h-12 font-bold"
                    placeholder="Harga jual"
                    required
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {quickPriceIncrements.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => increaseDirectSellingPrice(amount)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600"
                      >
                        +{amount.toLocaleString("id-ID")}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Modal
                    </label>
                    <CurrencyInput
                      value={directForm.cost}
                      onChange={updateDirectCost}
                      className="brand-input h-12 font-bold"
                      placeholder="Modal"
                    />
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-600">
                    <span>Laba</span>
                    <span
                      className={`font-semibold ${
                        directProfit < 0 ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {formatRupiah(directProfit)}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-4 text-sm text-slate-600">
                    <span>Harga jual</span>
                    <span className="font-semibold text-slate-950">
                      {formatRupiah(directSellingPrice)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-4 text-sm text-slate-600">
                    <span>Saldo aplikasi luar yang dipotong</span>
                    <span className="font-semibold text-slate-950">
                      {directSupplierPaymentLabel}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-4 text-sm text-slate-600">
                    <span>Modal dipotong dari</span>
                    <span className="font-semibold text-slate-950">
                      {directSupplierPaymentLabel} - {formatRupiah(directWalletDeductionAmount)}
                    </span>
                  </div>
                  <div
                    className={`mt-4 rounded-lg border px-3 py-3 text-sm font-semibold ${
                      directWalletBalanceEnough
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {directWalletBalanceEnough ? (
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      )}
                      <span>
                        Saldo {directSupplierPaymentLabel}: {formatRupiah(directSupplierPaymentBalance)}
                      </span>
                    </div>
                    {!directWalletBalanceEnough ? (
                      <p className="mt-2 text-xs font-semibold">
                        Kurang {formatRupiah(directWalletDeductionAmount - directSupplierPaymentBalance)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="border-t border-slate-200 pt-5">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Saldo aplikasi luar yang dipotong
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      {directSupplierPaymentOptions.map((method) => (
                        <button
                          key={method.value}
                          type="button"
                          onClick={() => setDirectSupplierPayment(method.value)}
                          className={`${getChoiceButtonClass(
                            directSupplierPayment === method.value,
                            "dark"
                          )} text-left`}
                        >
                          {method.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Catatan
                  </label>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value.slice(0, NOTE_MAX_LENGTH))}
                    maxLength={NOTE_MAX_LENGTH}
                    className="brand-textarea pb-8"
                    placeholder="Opsional"
                  />
                  <span
                    className={`pointer-events-none absolute bottom-2 right-3 text-[11px] font-bold ${
                      note.length > NOTE_MAX_LENGTH - 20 ? "text-amber-700" : "text-slate-400"
                    }`}
                  >
                    {note.length}/{NOTE_MAX_LENGTH}
                  </span>
                </div>

                <div className="brand-sticky-paybar grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetDirectInputForm(activeCategory);
                      resetCheckoutFields();
                      showNotification("info", "Form transaksi direset.");
                    }}
                    className="brand-button-secondary gap-2"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Reset Form
                  </button>
                  <button
                    type="submit"
                    disabled={processing}
                    className="brand-button-success gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {processing ? "Menyimpan..." : "Simpan Transaksi"}
                  </button>
                </div>
              </div>
            </Panel>
          </form>
        </>
      ) : (
        <>
          <div
            className={`grid gap-5 ${
              cartItemCount ? "xl:grid-cols-[minmax(0,1fr)_420px]" : ""
            }`}
          >
            <div className="min-w-0 space-y-4">
              {renderProviderCommandCenter()}

              {selectedProvider && !hasSearch ? (
                <Panel className="p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="brand-kicker">Jenis layanan</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Filter jenis layanan untuk {selectedProvider}.
                      </p>
                    </div>
                    <span className="brand-badge-neutral self-start lg:self-auto">
                      {visibleProducts.length} produk tampil
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveServiceType("semua")}
                      className={getChoiceButtonClass(activeServiceType === "semua")}
                    >
                      Semua
                    </button>
                    {serviceTypeOptions.map((serviceType) => (
                      <button
                        key={serviceType}
                        type="button"
                        onClick={() => setActiveServiceType(serviceType)}
                        className={getChoiceButtonClass(activeServiceType === serviceType)}
                      >
                        {serviceType}
                      </button>
                    ))}
                  </div>
                </Panel>
              ) : null}

              <Panel variant="strong" className="p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <label className="sr-only" htmlFor="digital-product-search">
                      Cari produk
                    </label>
                    <div className="relative">
                      <AppIcon
                        name="search"
                        className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        ref={searchInputRef}
                        id="digital-product-search"
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        className="brand-input brand-input-lg pl-11 pr-12 text-base font-semibold"
                        placeholder="Cari provider, layanan, atau nomor tujuan..."
                      />
                      {searchInput ? (
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setSearchInput("");
                            setSearch("");
                            searchInputRef.current?.focus();
                          }}
                          className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Hapus pencarian"
                        >
                          <AppIcon name="x" className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <span className="brand-badge-neutral self-start lg:self-auto">
                    {hasSearch
                      ? `${visibleProducts.length} hasil`
                      : selectedProvider
                        ? `${visibleProducts.length} produk tampil`
                        : `${activeProducts.length} produk aktif`}
                  </span>
                </div>
                {visibleProductsCapped ? (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    Menampilkan {visibleProducts.length} layanan pertama. Cari nama layanan atau
                    pilih provider untuk menemukan layanan lainnya.
                  </p>
                ) : null}
                {searchedDestinationNumber ? (
                  <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
                    Nomor tujuan {searchedDestinationNumber} dikenali. Pilih layanan; nomor akan terisi otomatis.
                  </p>
                ) : hasSearch && visibleProducts.length ? (
                  <p className="mt-3 text-xs font-semibold text-slate-500">
                    Top 5 hasil paling relevan diprioritaskan di urutan teratas.
                  </p>
                ) : null}
              </Panel>

              {hasSearch || selectedProvider ? (
                visibleProducts.length ? (
                  <div
                    className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
                      cartItemCount ? "" : "2xl:grid-cols-5"
                    }`}
                  >
                    {visibleProducts.map((product) => {
                      const inCart = cart.find((item) => item.productId === product.id);

                      return (
                        <ServiceProductCard
                          key={product.id}
                          product={product}
                          inCart={inCart}
                          hasSearch={hasSearch}
                          searchKeyword={searchKeyword}
                          isFavorite={favoriteServiceIds.includes(String(product.id))}
                          onToggleFavorite={() => toggleFavoriteService(product.id)}
                          onClick={() => addToCart(product)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <DigitalEmptyState
                    title="Tidak ditemukan produk"
                    description={
                      hasSearch
                        ? "Coba kata kunci lain, hapus pencarian, atau pilih provider langsung dari daftar."
                        : "Pilih jenis layanan lain untuk provider ini."
                    }
                    action={
                      hasSearch ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchInput("");
                            setSearch("");
                            searchInputRef.current?.focus();
                          }}
                          className="brand-button-secondary"
                        >
                          Hapus Pencarian
                        </button>
                      ) : null
                    }
                  />
                )
              ) : (
                <DigitalEmptyState
                  title="Pilih provider dulu"
                  description="Setelah provider dipilih, nominal/produk akan muncul. Untuk jalur cepat, ketik provider dan nominal di search."
                  action={
                    canManageServices && !activeProducts.length ? (
                      <Link to="/layanan-produk" className="brand-button-secondary gap-2">
                        <AppIcon name="settings" className="h-4 w-4" />
                        Tambah Produk Digital
                      </Link>
                    ) : null
                  }
                />
              )}
            </div>

            {cartItemCount > 0 ? (
              <div className="hidden xl:block">
                {renderProductCheckoutPanel()}
              </div>
            ) : null}
          </div>

          {cartItemCount > 0 ? (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-[0_-18px_42px_rgba(15,23,42,0.14)] backdrop-blur xl:hidden">
              {renderProductCheckoutPanel(true)}
            </div>
          ) : null}
        </>
      )}

      {processing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <Loading text="Menyimpan transaksi..." />
        </div>
      ) : null}

      {receiptTransaction ? (
        <ReceiptModal
          transaction={receiptTransaction}
          onClose={() => setReceiptTransaction(null)}
          onNewTransaction={() => {
            setReceiptTransaction(null);
            resetTransaction();
            resetDirectInputForm();
            window.requestAnimationFrame(() => {
              searchInputRef.current?.focus();
            });
          }}
        />
      ) : null}

      <ConfirmModal
        isOpen={repeatConfirmationOpen}
        title="Repeat transaksi terakhir?"
        message="Nomor tujuan dan nominal akan diisi kembali agar dapat diperiksa sebelum pembayaran."
        target={
          lastRepeatDraft
            ? `${lastRepeatDraft.productName} - ${lastRepeatDraft.targetNumber || "Tanpa nomor"}`
            : ""
        }
        consequence="Tidak ada saldo yang dipotong sampai Anda menekan tombol bayar."
        confirmLabel="Isi ulang transaksi"
        onClose={() => setRepeatConfirmationOpen(false)}
        onConfirm={applyLastRepeat}
      />
    </div>
  );
}

