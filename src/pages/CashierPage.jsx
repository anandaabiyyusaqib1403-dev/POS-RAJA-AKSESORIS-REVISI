import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import LottieState from "../components/LottieState";
import Panel from "../components/app/Panel";
import ConfirmModal from "../components/ConfirmModal";
import Loading from "../components/Loading";
import LoadingState from "../components/LoadingState";
import PinConfirmationModal from "../components/PinConfirmationModal";
import ReceiptModal from "../components/ReceiptModal";
import { useAuth } from "../contexts/useAuth";
import { showNotification } from "../contexts/NotificationContext";
import {
  customerPaymentPlatforms,
  walletPlatformLabelMap,
} from "../data/businessOptions";
import {
  buildCashierCategoryOptions,
  getCartUnavailableMessage,
  getProductBrand,
  getProductDisplayName,
  getStockDisplay,
} from "../features/cashier/utils/productPresentation";
import {
  createSplitPaymentRow,
  getCashInputDisplay,
  getPaymentLabel,
  getResolvedPaymentMethod,
  getSplitPaymentAmount,
} from "../features/cashier/utils/paymentCalculations";
import CashierSearchPanel from "../features/cashier/components/CashierSearchPanel";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useProducts } from "../hooks/useProducts";
import {
  isPinActionCancelledError,
  usePinConfirmation,
} from "../hooks/usePinConfirmation";
import { useShift } from "../hooks/useShift";
import { useTransactions } from "../hooks/useTransactions";
import { useWallet } from "../hooks/useWallet";
import { formatDateTime, formatRupiah } from "../utils/format";
import {
  openReceiptPrintWindow,
  printTransactionReceiptWithStatus,
} from "../utils/print";
import { recordOperationalEventSoon } from "../services/observability";
import { getMoneySaveFailureMessage } from "../core/money/moneyRetry";

const paymentGroups = [
  { value: "cash", label: "Cash" },
  { value: "qris", label: "QRIS" },
  { value: "transfer_bank", label: "Transfer Bank" },
  { value: "ewallet", label: "E-Wallet" },
  { value: "pasar_kuota", label: "PASAR KUOTA" },
];

const NOTE_MAX_LENGTH = 150;
const CART_UNAVAILABLE_REMOVAL_DELAY_MS = 2800;
const quickCashAmounts = [50000, 100000, 200000, 500000];
const bankWalletIds = ["bca", "bank_mas", "mandiri", "bri", "bni"];
const ewalletWalletIds = [
  "dana",
  "shopee",
  "ovo",
  "gopay_customer",
  "gopay_driver",
  "grab_customer",
  "grab_driver",
  "isaku_indomaret",
  "shopee_food_driver",
  "maxim_driver",
  "linkaja",
  "in_driver",
  "emoney",
  "etoll_emoney_mandiri",
  "etoll_brizzi",
  "etoll_tapcash_bni",
];
const splitPaymentMethodIds = [
  "cash",
  "qris",
  "bca",
  "bank_mas",
  "mandiri",
  "bri",
  "bni",
  "dana",
  "shopee",
  "ovo",
  "gopay_customer",
  "pasar_kuota",
];
const splitPaymentOptions = customerPaymentPlatforms.filter((platform) =>
  splitPaymentMethodIds.includes(platform.value)
);

export default function CashierPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { products, refreshProducts } = useProducts();
  const { createAccessoryTransaction, deleteTransactionHistory } = useTransactions();
  const { currentShift, selectedCashier } = useShift();
  const { walletBalances } = useWallet();

  const searchInputRef = useRef(null);
  const cashInputRef = useRef(null);
  const successTimerRef = useRef(null);
  const cartRemovalTimerRef = useRef(null);
  const productHydrationRef = useRef(false);

  const [step, setStep] = useState("product");
  const [activeCategory, setActiveCategory] = useState("semua");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [paymentGroup, setPaymentGroup] = useState("cash");
  const [paymentMode, setPaymentMode] = useState("single");
  const [bankWallet, setBankWallet] = useState("bca");
  const [ewalletWallet, setEwalletWallet] = useState("dana");
  const [cashReceived, setCashReceived] = useState("");
  const [splitPayments, setSplitPayments] = useState(() => [
    createSplitPaymentRow("cash"),
    createSplitPaymentRow("qris"),
  ]);
  const [note, setNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const processingRef = useRef(false);
  const [successFeedback, setSuccessFeedback] = useState(null);
  const [receiptTransaction, setReceiptTransaction] = useState(null);
  const [lastCompletedTransaction, setLastCompletedTransaction] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
  const [hydratingProducts, setHydratingProducts] = useState(false);
  const [productHydrationError, setProductHydrationError] = useState("");
  const {
    isPinModalOpen,
    closePinModal,
    executeSensitiveAction,
    executeConfirmedAction,
    actionDescription,
  } = usePinConfirmation();

  const activeProducts = useMemo(
    () => products.filter((product) => product.aktif && product.status !== "deleted"),
    [products]
  );

  const categoryOptions = useMemo(
    () => buildCashierCategoryOptions(activeProducts),
    [activeProducts]
  );

  useEffect(() => {
    if (!categoryOptions.some((category) => category.value === activeCategory)) {
      setActiveCategory("semua");
    }
  }, [activeCategory, categoryOptions]);

  useEffect(() => {
    setCart((currentCart) => {
      if (!currentCart.length) return currentCart;

      const activeProductById = new Map(activeProducts.map((product) => [product.id, product]));
      let changed = false;
      let markedUnavailable = false;

      const nextCart = currentCart.flatMap((item) => {
        const latestProduct = activeProductById.get(item.id);

        if (!latestProduct) {
          if (item.unavailableReason !== "deleted") {
            changed = true;
            markedUnavailable = true;
          }

          return [
            {
              ...item,
              unavailableReason: "deleted",
              unavailableAt: item.unavailableAt || Date.now(),
            },
          ];
        }

        const latestStock = Number(latestProduct.stok || 0);
        const latestPrice = Number(latestProduct.harga_jual ?? item.harga_jual ?? 0);

        if (latestStock <= 0) {
          if (item.unavailableReason !== "out_of_stock" || Number(item.stok || 0) !== latestStock) {
            changed = true;
            markedUnavailable = true;
          }

          return [
            {
              ...item,
              stok: latestStock,
              unavailableReason: "out_of_stock",
              unavailableAt: item.unavailableAt || Date.now(),
            },
          ];
        }

        const safeQty = Math.min(Number(item.qty || 0), latestStock);
        if (safeQty <= 0) return [];

        const nextItem = {
          ...item,
          nama: latestProduct.nama || item.nama,
          brand: latestProduct.brand ?? item.brand,
          provider: latestProduct.provider ?? item.provider,
          kategori: latestProduct.kategori ?? item.kategori,
          harga_jual: latestPrice,
          stok: latestStock,
          qty: safeQty,
          subtotal: safeQty * latestPrice,
          unavailableReason: "",
          unavailableAt: null,
        };

        if (
          item.unavailableReason ||
          safeQty !== Number(item.qty || 0) ||
          latestStock !== Number(item.stok || 0) ||
          latestPrice !== Number(item.harga_jual || 0)
        ) {
          changed = true;
        }

        return [nextItem];
      });

      if (markedUnavailable) {
        showNotification(
          "warning",
          "Ada produk di keranjang yang stoknya habis atau sudah tidak tersedia."
        );
      }

      return changed ? nextCart : currentCart;
    });
  }, [activeProducts]);

  useEffect(() => {
    if (step === "product") {
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      return;
    }

    if (paymentGroup === "cash") {
      window.requestAnimationFrame(() => {
        cashInputRef.current?.focus();
      });
    }
  }, [paymentGroup, step]);

  useEffect(
    () => () => {
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
      }
    },
    []
  );

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return activeProducts
      .filter((product) => {
        const matchesCategory =
          activeCategory === "semua" ? true : product.kategori === activeCategory;
        const matchesSearch =
          !keyword ||
          getProductDisplayName(product).toLowerCase().includes(keyword) ||
          getProductBrand(product).toLowerCase().includes(keyword) ||
          (product.kode_produk || "").toLowerCase().includes(keyword);

        return matchesCategory && matchesSearch;
      })
      .sort((left, right) => {
        if ((left.stok > 0) !== (right.stok > 0)) {
          return left.stok > 0 ? -1 : 1;
        }

        return getProductDisplayName(left).localeCompare(getProductDisplayName(right), "id", {
          sensitivity: "base",
        });
      });
  }, [activeCategory, activeProducts, search]);
  const renderedProducts = filteredProducts;
  const hiddenProductCount = 0;

  const exactCodeMatch = useMemo(
    () =>
      activeProducts.find(
        (product) =>
          product.stok > 0 &&
          (product.kode_produk || "").toLowerCase() === search.trim().toLowerCase()
      ) || null,
    [activeProducts, search]
  );

  const cartItemCount = useMemo(
    () =>
      cart
        .filter((item) => !item.unavailableReason)
        .reduce((sum, item) => sum + Number(item.qty || 0), 0),
    [cart]
  );

  const cartTotal = useMemo(
    () =>
      cart
        .filter((item) => !item.unavailableReason)
        .reduce((sum, item) => sum + Number(item.subtotal || 0), 0),
    [cart]
  );
  const unavailableCartKey = useMemo(
    () =>
      cart
        .filter((item) => item.unavailableReason)
        .map((item) => `${item.id}:${item.unavailableReason}`)
        .join("|"),
    [cart]
  );
  const hasUnavailableCartItems = Boolean(unavailableCartKey);

  const resolvedPaymentMethod = useMemo(
    () => getResolvedPaymentMethod(paymentGroup, bankWallet, ewalletWallet),
    [bankWallet, ewalletWallet, paymentGroup]
  );

  const resolvedPaymentLabel = useMemo(
    () => getPaymentLabel(paymentGroup, bankWallet, ewalletWallet),
    [bankWallet, ewalletWallet, paymentGroup]
  );

  const selectedWalletBalance = useMemo(
    () =>
      Number(
        walletBalances.find((wallet) => wallet.id === resolvedPaymentMethod)?.balance || 0
      ),
    [resolvedPaymentMethod, walletBalances]
  );

  const bankWalletOptions = useMemo(
    () => customerPaymentPlatforms.filter((platform) => bankWalletIds.includes(platform.value)),
    []
  );

  const ewalletOptions = useMemo(
    () => customerPaymentPlatforms.filter((platform) => ewalletWalletIds.includes(platform.value)),
    []
  );

  const normalizedSplitPayments = useMemo(
    () =>
      splitPayments
        .map((payment) => ({
          method: payment.method,
          amount: getSplitPaymentAmount(payment),
        }))
        .filter((payment) => payment.amount > 0),
    [splitPayments]
  );
  const splitPaidTotal = useMemo(
    () => normalizedSplitPayments.reduce((sum, payment) => sum + payment.amount, 0),
    [normalizedSplitPayments]
  );
  const splitRemaining = Math.max(0, cartTotal - splitPaidTotal);
  const splitOverpay = Math.max(0, splitPaidTotal - cartTotal);
  const isSplitPayment = paymentMode === "split";
  const cashValue = Number(cashReceived || 0);
  const isCashPayment = !isSplitPayment && paymentGroup === "cash";
  const paidTotal = isSplitPayment ? splitPaidTotal : isCashPayment ? cashValue : cartTotal;
  const amountShortage = Math.max(0, cartTotal - paidTotal);
  const cashShortage = isCashPayment && cashValue < cartTotal ? cartTotal - cashValue : 0;
  const cashChange = isCashPayment ? Math.max(0, cashValue - cartTotal) : 0;
  const cashDisplay = getCashInputDisplay(cashReceived, cartTotal);
  const splitPaymentReady =
    !isSplitPayment ||
    (normalizedSplitPayments.length >= 2 && splitPaidTotal === cartTotal && !splitOverpay);
  const checkoutDisabled =
    processing ||
    !cartItemCount ||
    hasUnavailableCartItems ||
    (isSplitPayment ? !splitPaymentReady : isCashPayment && cashShortage > 0);
  const commandPaymentSummary = useMemo(() => {
    if (!isSplitPayment) {
      return {
        cash: paymentGroup === "cash" ? cartTotal : 0,
        qris: paymentGroup === "qris" ? cartTotal : 0,
        transfer: ["transfer_bank", "ewallet"].includes(paymentGroup) ? cartTotal : 0,
      };
    }

    return normalizedSplitPayments.reduce(
      (summary, payment) => {
        if (payment.method === "cash") summary.cash += payment.amount;
        else if (payment.method === "qris") summary.qris += payment.amount;
        else summary.transfer += payment.amount;
        return summary;
      },
      { cash: 0, qris: 0, transfer: 0 }
    );
  }, [cartTotal, isSplitPayment, normalizedSplitPayments, paymentGroup]);
  const commandPaymentStatus = !cartItemCount
    ? "MENUNGGU"
    : amountShortage
      ? "KURANG"
      : (isCashPayment && cashChange > 0) || splitOverpay
        ? "LEBIH"
        : "PAS";
  const commandStatusClass =
    commandPaymentStatus === "PAS"
      ? "brand-badge-success"
      : commandPaymentStatus === "KURANG" || commandPaymentStatus === "MENUNGGU"
        ? "brand-badge-warning"
        : "brand-badge-info";

  const resetCheckoutFields = () => {
    setPaymentMode("single");
    setPaymentGroup("cash");
    setBankWallet("bca");
    setEwalletWallet("dana");
    setCashReceived("");
    setSplitPayments([createSplitPaymentRow("cash"), createSplitPaymentRow("qris")]);
    setNote("");
  };

  const resetSale = () => {
    setCart([]);
    resetCheckoutFields();
  };

  useEffect(() => {
    if (!unavailableCartKey) {
      window.clearTimeout(cartRemovalTimerRef.current);
      return undefined;
    }

    window.clearTimeout(cartRemovalTimerRef.current);
    cartRemovalTimerRef.current = window.setTimeout(() => {
      setCart((currentCart) => {
        const nextCart = currentCart.filter((item) => !item.unavailableReason);

        if (!nextCart.length) {
          setStep("product");
          setPaymentMode("single");
          setPaymentGroup("cash");
          setBankWallet("bca");
          setEwalletWallet("dana");
          setCashReceived("");
          setSplitPayments([createSplitPaymentRow("cash"), createSplitPaymentRow("qris")]);
          setNote("");
        }

        return nextCart;
      });
      showNotification("info", "Item tidak tersedia sudah dihapus dari keranjang.");
    }, CART_UNAVAILABLE_REMOVAL_DELAY_MS);

    return () => window.clearTimeout(cartRemovalTimerRef.current);
  }, [unavailableCartKey]);

  const goToProductStep = () => {
    setStep("product");
  };

  const addToCart = useCallback((product, { refocusSearch = false } = {}) => {
    if (product.stok <= 0) {
      showNotification("warning", `Stok ${getProductDisplayName(product)} sedang habis.`);
      return;
    }

    setCart((currentCart) => {
      const currentItem = currentCart.find((item) => item.id === product.id);

      if (currentItem) {
        if (currentItem.qty >= product.stok) {
          showNotification(
            "warning",
            `Jumlah ${getProductDisplayName(product)} sudah mencapai batas stok.`
          );
          return currentCart;
        }

        return currentCart.map((item) =>
          item.id === product.id
            ? {
                ...item,
                qty: item.qty + 1,
                subtotal: (item.qty + 1) * item.harga_jual,
              }
            : item
        );
      }

      return [
        ...currentCart,
        {
          ...product,
          qty: 1,
          subtotal: Number(product.harga_jual || 0),
        },
      ];
    });

    if (refocusSearch) {
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, []);

  const setCartQty = (productId, nextQty) => {
    setCart((currentCart) =>
      currentCart.flatMap((item) => {
        if (item.id !== productId) return [item];

        const safeQty = Math.max(0, Math.min(Number(nextQty || 0), Number(item.stok || 0)));
        if (safeQty === 0) return [];

        return [
          {
            ...item,
            qty: safeQty,
            subtotal: safeQty * Number(item.harga_jual || 0),
          },
        ];
      })
    );
  };

  const updateSplitPayment = (paymentId, patch) => {
    setSplitPayments((currentPayments) =>
      currentPayments.map((payment) =>
        payment.id === paymentId ? { ...payment, ...patch } : payment
      )
    );
  };

  const removeSplitPayment = (paymentId) => {
    setSplitPayments((currentPayments) =>
      currentPayments.length <= 2
        ? currentPayments
        : currentPayments.filter((payment) => payment.id !== paymentId)
    );
  };

  const addSplitPayment = () => {
    setSplitPayments((currentPayments) => [
      ...currentPayments,
      createSplitPaymentRow("dana"),
    ]);
  };

  const fillSplitRemaining = (paymentId) => {
    const otherTotal = splitPayments.reduce((sum, payment) => {
      if (payment.id === paymentId) return sum;
      return sum + getSplitPaymentAmount(payment);
    }, 0);
    const nextAmount = Math.max(0, cartTotal - otherTotal);

    updateSplitPayment(paymentId, {
      amount: nextAmount ? String(nextAmount) : "",
    });
  };

  const handleContinue = () => {
    if (!cartItemCount) {
      showNotification("warning", "Pilih produk dulu sebelum lanjut checkout.");
      return;
    }

    if (hasUnavailableCartItems) {
      showNotification("warning", "Selesaikan item stok habis atau tunggu item dihapus otomatis.");
      return;
    }

    setStep("checkout");
  };

  const handleCheckout = async (event) => {
    event.preventDefault();

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      showNotification(
        "warning",
        "Koneksi offline. Transaksi belum disimpan; lanjutkan setelah koneksi kembali."
      );
      return;
    }

    if (!currentShift) {
      showNotification("warning", "Buka shift dulu sebelum menyimpan transaksi.");
      navigate("/shift");
      return;
    }

    if (!cartItemCount) {
      showNotification("warning", "Keranjang masih kosong.");
      setStep("product");
      return;
    }

    const activeProductById = new Map(activeProducts.map((product) => [product.id, product]));
    const blockedProducts = cart.filter((item) => {
      if (item.unavailableReason) return true;
      const latestProduct = activeProductById.get(item.id);
      return !latestProduct || Number(latestProduct.stok || 0) <= 0;
    });

    if (blockedProducts.length) {
      showNotification(
        "warning",
        "Ada produk di keranjang yang stoknya habis atau sudah tidak tersedia."
      );
      setCart((currentCart) =>
        currentCart.map((item) => {
          const latestProduct = activeProductById.get(item.id);
          if (item.unavailableReason) return item;

          if (!latestProduct) {
            return {
              ...item,
              unavailableReason: "deleted",
              unavailableAt: item.unavailableAt || Date.now(),
            };
          }

          if (Number(latestProduct.stok || 0) <= 0) {
            return {
              ...item,
              stok: Number(latestProduct.stok || 0),
              unavailableReason: "out_of_stock",
              unavailableAt: item.unavailableAt || Date.now(),
            };
          }

          return item;
        })
      );
      return;
    }

    if (isCashPayment && cashValue < cartTotal) {
      showNotification("warning", "Uang diterima masih kurang dari total transaksi.");
      return;
    }

    if (isSplitPayment) {
      if (normalizedSplitPayments.length < 2) {
        showNotification("warning", "Split payment perlu minimal dua metode pembayaran.");
        return;
      }

      if (splitPaidTotal !== cartTotal) {
        showNotification("warning", "Total split payment harus sama dengan total transaksi.");
        return;
      }
    }

    if (processingRef.current) {
      return;
    }

    processingRef.current = true;
    const printWindow = openReceiptPrintWindow();

    setProcessing(true);
    try {
      const transaction = await createAccessoryTransaction({
        items: cart.filter((item) => !item.unavailableReason),
        metodeBayar: isSplitPayment ? "split" : resolvedPaymentMethod,
        uangDiterima: isSplitPayment ? splitPaidTotal : isCashPayment ? cashValue : cartTotal,
        payments: isSplitPayment
          ? normalizedSplitPayments
          : [{ method: resolvedPaymentMethod, amount: cartTotal }],
        catatan: note,
      });

      window.clearTimeout(successTimerRef.current);
      setSuccessFeedback({
        noTransaksi: transaction.no_transaksi,
        total: Number(transaction.total_bayar || cartTotal),
      });
      setReceiptTransaction(transaction);
      setLastCompletedTransaction(transaction);
      successTimerRef.current = window.setTimeout(() => {
        setSuccessFeedback(null);
      }, 2600);

      resetSale();
      goToProductStep();
      setSearch("");

      showNotification(
        "success",
        `Transaksi ${transaction.no_transaksi} berhasil disimpan.`
      );

      if (printWindow) {
        const printResult = printTransactionReceiptWithStatus(transaction, printWindow);
        if (!printResult.ok) {
          recordOperationalEventSoon({
            eventType: "receipt_print_failed",
            severity: "warning",
            source: "printer",
            sourceId: transaction.id || null,
            details: printResult,
          });
          showNotification("warning", `Transaksi tersimpan, tetapi print gagal. ${printResult.message}`);
        } else {
          recordOperationalEventSoon({
            eventType: "receipt_print_opened",
            severity: "info",
            source: "printer",
            sourceId: transaction.id || null,
            details: printResult,
          });
        }
      } else {
        recordOperationalEventSoon({
          eventType: "receipt_print_blocked",
          severity: "warning",
          source: "printer",
          sourceId: transaction.id || null,
          details: { no_transaksi: transaction.no_transaksi },
        });
        showNotification(
          "warning",
          "Transaksi tersimpan, tetapi popup print diblokir browser. Cetak ulang dari preview struk."
        );
      }
    } catch (error) {
      if (printWindow) {
        printWindow.close();
      }
      if (String(error?.code || "") === "P0001") {
        resetSale();
        setStep("product");
      }
      showNotification(
        "error",
        getMoneySaveFailureMessage(error, "Gagal menyimpan transaksi.")
      );
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  };

  const reprintLastTransaction = () => {
    if (!lastCompletedTransaction) return;

    const printWindow = openReceiptPrintWindow();
    const result = printWindow
      ? printTransactionReceiptWithStatus(lastCompletedTransaction, printWindow)
      : { ok: false, message: "Popup print diblokir browser." };

    showNotification(
      result.ok ? "success" : "warning",
      result.ok
        ? `Struk ${lastCompletedTransaction.no_transaksi} siap dicetak ulang.`
        : result.message
    );
  };

  const confirmVoidLastTransaction = async () => {
    if (!voidTarget?.id) return;

    const target = voidTarget;
    setVoidTarget(null);

    try {
      await executeSensitiveAction(
        async () =>
          deleteTransactionHistory({
            source: "aksesoris",
            id: target.id,
            reason: `Void dari command strip kasir: ${target.no_transaksi || target.id}`,
          }),
        "TRANSACTION.DELETE"
      );
      setLastCompletedTransaction(null);
      showNotification(
        "success",
        `Transaksi ${target.no_transaksi || target.id} di-void. Reversal stok/wallet tercatat.`
      );
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Void transaksi gagal.");
    }
  };

  const handleQuickExactPayment = () => {
    if (!cartItemCount) {
      showNotification("warning", "Keranjang masih kosong.");
      searchInputRef.current?.focus();
      return;
    }

    if (hasUnavailableCartItems) {
      showNotification("warning", "Selesaikan item stok habis atau tunggu item dihapus otomatis.");
      return;
    }

    setPaymentMode("single");
    setPaymentGroup("cash");
    setCashReceived(String(cartTotal));
    setStep("checkout");
    window.requestAnimationFrame(() => {
      cashInputRef.current?.focus();
    });
  };

  const handleShortcutReset = () => {
    if (!cart.length && step === "product") {
      setSearch("");
      searchInputRef.current?.focus();
      return;
    }

    resetSale();
    setStep("product");
    setSearch("");
    showNotification("info", "Keranjang dan pembayaran direset.");
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  };

  const handleSearchClear = useCallback(() => {
    setSearch("");
    searchInputRef.current?.focus();
  }, []);

  const handleSearchKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter" && exactCodeMatch) {
        event.preventDefault();
        addToCart(exactCodeMatch, { refocusSearch: true });
        setSearch("");
      }
    },
    [addToCart, exactCodeMatch]
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
          if (step === "checkout") return;
          handleContinue();
        },
      },
      {
        key: "F8",
        allowInInput: true,
        action: handleQuickExactPayment,
      },
      {
        key: "Escape",
        allowInInput: true,
        action: handleShortcutReset,
      },
    ],
    !processing
  );

  const hydrateCashierProducts = useCallback(async () => {
    productHydrationRef.current = true;
    setHydratingProducts(true);
    setProductHydrationError("");

    try {
      await refreshProducts();
    } catch (error) {
      const message = error.message || "Gagal memuat produk kasir.";
      console.error("Gagal memuat produk kasir:", error);
      setProductHydrationError(message);
      showNotification("error", message);
    } finally {
      setHydratingProducts(false);
    }
  }, [refreshProducts]);

  useEffect(() => {
    if (productHydrationRef.current || products.length) return undefined;

    void hydrateCashierProducts();
    return undefined;
  }, [hydrateCashierProducts, products.length]);

  const retryCashierProducts = () => {
    productHydrationRef.current = false;
    void hydrateCashierProducts();
  };

  if (hydratingProducts && !products.length) {
    return <LoadingState text="Memuat kasir..." variant="cashier" />;
  }

  if (productHydrationError && !products.length) {
    return (
      <div className="space-y-6">
        <Panel className="p-6">
          <p className="brand-kicker">Kasir POS</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-slate-950">
            Produk kasir belum berhasil dimuat
          </h1>
          <p className="mt-3 text-sm leading-6 text-red-700">{productHydrationError}</p>
          <button type="button" onClick={retryCashierProducts} className="brand-button-primary mt-5">
            Coba Lagi
          </button>
        </Panel>
      </div>
    );
  }

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
              ? `${selectedCashier?.nama || currentShift.cashier_name || "Kasir"} • ${currentShift.cashier_station || "Station belum dipilih"} • Shift ${currentShift.shift_type || "-"} aktif sejak ${formatDateTime(
                  currentShift.start_time,
                  {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }
                )}`
              : "Transaksi baru bisa disimpan setelah shift dibuka oleh kasir yang bertugas."}
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
  const selectionCartRail = (
    <Panel
      variant="strong"
      className="brand-cart-rail flex flex-col p-4 md:sticky md:top-[184px] lg:top-24"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <p className="brand-kicker">Keranjang</p>
          <p className="mt-1 text-sm font-bold text-slate-950">{cartItemCount} item dipilih</p>
        </div>
        <span className="brand-badge-neutral">{formatRupiah(cartTotal)}</span>
      </div>

      {cart.length ? (
        <div className="brand-scroll-region-y brand-scrollbar mt-3 flex-1 space-y-2 pr-1">
          {cart.map((item) => (
            <div
              key={item.id}
              className={`border-b px-1 pb-3 pt-1 ${
                item.unavailableReason ? "border-rose-200 text-slate-500" : "border-slate-100"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-sm font-semibold text-slate-950">{item.nama}</p>
                <button
                  type="button"
                  onClick={() => setCartQty(item.id, 0)}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                >
                  Hapus
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCartQty(item.id, item.qty - 1)}
                    disabled={Boolean(item.unavailableReason)}
                    className="brand-icon-button brand-icon-button-sm brand-icon-button-muted disabled:opacity-40"
                    aria-label={`Kurangi ${item.nama}`}
                  >
                    -
                  </button>
                  <span className="min-w-[28px] text-center text-sm font-bold text-slate-950">
                    {item.qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCartQty(item.id, item.qty + 1)}
                    disabled={Boolean(item.unavailableReason)}
                    className="brand-icon-button brand-icon-button-sm brand-icon-button-primary disabled:opacity-40"
                    aria-label={`Tambah ${item.nama}`}
                  >
                    +
                  </button>
                </div>
                <p className="text-sm font-bold text-slate-950">{formatRupiah(item.subtotal)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center py-8 text-center text-sm text-slate-500">
          Scan atau pilih produk untuk mulai transaksi.
        </div>
      )}

      <div className="mt-3 border-t border-slate-200 pt-3">
        <div className="flex items-end justify-between gap-3">
          <span className="text-sm font-semibold text-slate-500">Total</span>
          <span className="text-xl font-black text-slate-950">{formatRupiah(cartTotal)}</span>
        </div>
        <button
          type="button"
          className="brand-button-primary mt-3 w-full"
          onClick={handleContinue}
          disabled={!cartItemCount || hasUnavailableCartItems}
        >
          Lanjut Pembayaran
        </button>
      </div>
    </Panel>
  );

  return (
    <div className="space-y-4">
      <div className="brand-ops-header">
        <div className="min-w-0">
          <p className="brand-kicker text-[var(--brand-gold-strong)]">Kasir POS</p>
          <h1 className="mt-1 truncate font-display text-2xl font-black tracking-tight text-slate-950">
            Transaksi Aksesoris
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="brand-shortcut-strip">
            <span>F2 Cari</span>
            <span>F4 Checkout</span>
            <span>F8 Uang Pas</span>
            <span>Esc Reset</span>
          </div>
        </div>
      </div>

      {renderShiftBanner}

      {step === "product" ? (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className={`min-w-0 space-y-4 ${cartItemCount ? "brand-mobile-cta-offset md:pb-0" : ""}`}>
            <CashierSearchPanel
            ref={searchInputRef}
            search={search}
            exactCodeMatch={exactCodeMatch}
            filteredProductCount={filteredProducts.length}
            cartItemCount={cartItemCount}
            cartTotal={cartTotal}
            categoryOptions={categoryOptions}
            activeCategory={activeCategory}
            onSearchChange={setSearch}
            onSearchClear={handleSearchClear}
            onSearchKeyDown={handleSearchKeyDown}
            onCategoryChange={setActiveCategory}
            />

            {!activeProducts.length ? (
            <div className="brand-empty-state brand-empty-state-with-motion">
              <LottieState
                ariaLabel="Produk belum tersedia"
                size={118}
              />
              <p className="text-lg font-semibold text-slate-950">Belum ada produk aktif</p>
              <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
                Owner bisa tambah atau import produk dari menu Stok Barang. Setelah aktif, produk
                langsung muncul di grid kasir.
              </p>
            </div>
            ) : !filteredProducts.length ? (
            <div className="brand-empty-state brand-empty-state-with-motion">
              <LottieState
                ariaLabel="Produk tidak ditemukan"
                size={132}
              />
              <p className="text-lg font-semibold text-slate-950">Produk tidak ditemukan</p>
              <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
                Periksa kode barcode, nama produk, atau kategori. Filter bisa dikosongkan untuk
                kembali ke semua produk aktif.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setActiveCategory("semua");
                }}
                className="brand-button-secondary mt-5"
              >
                Reset Filter
              </button>
            </div>
            ) : (
              <>
              {hiddenProductCount ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  Menampilkan {renderedProducts.length} dari {filteredProducts.length} produk.
                  Cari nama/barcode atau pilih kategori untuk menemukan produk lainnya.
                </p>
              ) : null}
              <div className="brand-scroll-region-y brand-scrollbar md:max-h-[min(62dvh,680px)] md:pr-2">
                <div className="brand-product-grid brand-product-grid-compact">
                {renderedProducts.map((product) => {
                  const inCart = cart.find((item) => item.id === product.id);
                  const isOutOfStock = Number(product.stok || 0) <= 0;
                  const stockDisplay = getStockDisplay(product);

                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addToCart(product)}
                      disabled={isOutOfStock}
                      className={`brand-product-card brand-product-card-compact ${
                        isOutOfStock
                          ? "brand-product-card-disabled"
                          : `brand-product-card-available ${
                              inCart ? "brand-product-card-selected" : ""
                            }`
                      }`}
                    >
                      {inCart ? (
                        <span className="absolute right-3 top-3 rounded-md bg-[var(--brand-gold)] px-2.5 py-1 text-[11px] font-black text-slate-950">
                          x{inCart.qty}
                        </span>
                      ) : null}

                      <div className="flex items-start justify-between gap-3 pr-10">
                        <span className="brand-badge-neutral max-w-full truncate">
                          {getProductBrand(product)}
                        </span>
                      </div>

                      <div className="mt-4 flex-1">
                        <p className="line-clamp-2 min-h-[44px] text-sm font-bold leading-5 text-slate-950">
                          {getProductDisplayName(product)}
                        </p>
                        <p className="mt-2 truncate text-[11px] font-semibold text-slate-500">
                          {product.kode_produk || product.kategori || "Tanpa kode"}
                        </p>
                      </div>

                      <div className="mt-4 space-y-3">
                        <p className="text-lg font-black tracking-tight text-slate-950">
                          {formatRupiah(product.harga_jual)}
                        </p>
                        <div className="brand-product-card-actions">
                          <span className={`${stockDisplay.className} min-h-[32px] px-3 py-1.5`}>
                            {stockDisplay.label}
                          </span>
                          <span
                            className={`brand-mini-action ${
                              isOutOfStock
                                ? "bg-slate-200 text-slate-500"
                                : "bg-[var(--brand-gold)] text-slate-950"
                            }`}
                          >
                            {isOutOfStock ? "Habis" : "Tambah"}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
                </div>
              </div>
              </>
            )}
          </div>
          <div className="hidden md:block">{selectionCartRail}</div>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="brand-command-strip" aria-label="Cashier command strip">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <p className="brand-kicker shrink-0">Bayar:</p>
                <div className="brand-segmented">
                  {[
                    { value: "cash", label: "CASH" },
                    { value: "qris", label: "QRIS" },
                    { value: "transfer_bank", label: "TRANSFER" },
                  ].map((method) => (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => {
                        setPaymentMode("single");
                        setPaymentGroup(method.value);
                      }}
                      className={`brand-segmented-button ${
                        !isSplitPayment && paymentGroup === method.value
                          ? "brand-segmented-button-active"
                          : ""
                      }`}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
                <span className={commandStatusClass}>Status: {commandPaymentStatus}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  form="cashier-checkout-form"
                  disabled={checkoutDisabled}
                  className="brand-button-success"
                >
                  Simpan
                </button>
                <button
                  type="button"
                  onClick={reprintLastTransaction}
                  disabled={!lastCompletedTransaction}
                  className="brand-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Print Ulang
                </button>
                <button
                  type="button"
                  onClick={() => setVoidTarget(lastCompletedTransaction)}
                  disabled={!lastCompletedTransaction || user?.role !== "pemilik"}
                  title={user?.role !== "pemilik" ? "Void membutuhkan akses owner dan PIN." : ""}
                  className="brand-button-danger disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Batal (Void)
                </button>
              </div>
            </div>
            <div className="brand-payment-summary mt-4" aria-live="polite">
              <span>Cash=<strong>{formatRupiah(commandPaymentSummary.cash)}</strong></span>
              <span>QRIS=<strong>{formatRupiah(commandPaymentSummary.qris)}</strong></span>
              <span>Transfer=<strong>{formatRupiah(commandPaymentSummary.transfer)}</strong></span>
              <span>Total=<strong>{formatRupiah(cartTotal)}</strong></span>
              <span>Sisa=<strong>{formatRupiah(amountShortage)}</strong></span>
            </div>
          </section>

          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1.18fr)_420px]">
          <Panel className="p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="brand-kicker">Checkout</p>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
                  Ringkasan Belanja
                </h2>
              </div>
              <button
                type="button"
                onClick={goToProductStep}
                className="brand-button-secondary"
              >
                Kembali ke Produk
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="brand-subtle-block">
                <p className="brand-kicker">Total item</p>
                <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                  {cartItemCount}
                </p>
              </div>
              <div className="brand-subtle-block">
                <p className="brand-kicker">Total harga</p>
                <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                  {formatRupiah(cartTotal)}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {cart.length ? (
                cart.map((item) => {
                  const unavailableMessage = getCartUnavailableMessage(item.unavailableReason);

                  return (
                  <div
                    key={item.id}
                    className={`rounded-lg border px-4 py-4 shadow-[0_6px_16px_rgba(15,23,42,0.04)] ${
                      item.unavailableReason
                        ? "border-rose-200 bg-rose-50/80"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-bold ${
                            item.unavailableReason ? "text-slate-500 line-through" : "text-slate-950"
                          }`}
                        >
                          {item.nama}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {getProductBrand(item)} - {formatRupiah(item.harga_jual)}
                        </p>
                        {unavailableMessage ? (
                          <p className="mt-2 inline-flex rounded-md bg-rose-100 px-2.5 py-1 text-xs font-black text-rose-700">
                            {unavailableMessage} - akan dihapus otomatis
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => setCartQty(item.id, 0)}
                        className="brand-button-danger min-h-[44px] px-3 py-2 text-xs"
                      >
                        Hapus
                      </button>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCartQty(item.id, item.qty - 1)}
                          disabled={Boolean(item.unavailableReason)}
                          className="brand-icon-button brand-icon-button-md brand-icon-button-muted min-h-[48px] min-w-[48px] disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Kurangi ${item.nama}`}
                        >
                          -
                        </button>
                        <span className="min-w-[40px] text-center text-base font-bold text-slate-950">
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCartQty(item.id, item.qty + 1)}
                          disabled={Boolean(item.unavailableReason)}
                          className="brand-icon-button brand-icon-button-md brand-icon-button-primary min-h-[48px] min-w-[48px] disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Tambah ${item.nama}`}
                        >
                          +
                        </button>
                      </div>
                      <p
                        className={`text-base font-black ${
                          item.unavailableReason ? "text-slate-500 line-through" : "text-slate-950"
                        }`}
                      >
                        {formatRupiah(item.subtotal)}
                      </p>
                    </div>
                  </div>
                  );
                })
              ) : (
                <div className="brand-empty-state brand-empty-state-with-motion min-h-[260px]">
                  <LottieState
                    ariaLabel="Keranjang kosong"
                    icon="pos"
                    size={138}
                  />
                  <p className="text-base font-semibold text-slate-950">Keranjang masih kosong</p>
                  <p className="mt-2 max-w-sm text-sm leading-7 text-slate-500">
                    Kembali ke daftar produk, lalu pilih item yang akan dibayar pelanggan.
                  </p>
                </div>
              )}
            </div>
          </Panel>

          <Panel variant="strong" className="p-5 md:sticky md:top-[184px] md:self-start lg:top-24 sm:p-6">
            <form id="cashier-checkout-form" onSubmit={handleCheckout} className="space-y-5">
              <div className="rounded-lg bg-slate-950 px-5 py-5 text-white shadow-[0_16px_34px_rgba(15,23,42,0.18)]">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-300">
                  Total tagihan
                </p>
                <p className="mt-2 text-4xl font-black tracking-tight">
                  {formatRupiah(cartTotal)}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-300">
                  {cartItemCount} item - struk otomatis disiapkan setelah transaksi tersimpan
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    Tagihan
                  </p>
                  <p className="mt-1 text-sm font-black text-slate-950">{formatRupiah(cartTotal)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    Dibayar
                  </p>
                  <p className="mt-1 text-sm font-black text-slate-950">{formatRupiah(paidTotal)}</p>
                </div>
                <div
                  className={`rounded-lg border px-3 py-3 ${
                    isSplitPayment && splitOverpay
                      ? "border-red-200 bg-red-50"
                      : amountShortage
                        ? "border-amber-200 bg-amber-50"
                        : "border-emerald-200 bg-emerald-50"
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    {isCashPayment ? "Kembali" : amountShortage ? "Sisa" : "Status"}
                  </p>
                  <p
                    className={`mt-1 text-sm font-black ${
                      isSplitPayment && splitOverpay
                        ? "text-red-700"
                        : amountShortage
                          ? "text-amber-700"
                          : "text-emerald-700"
                    }`}
                  >
                    {isCashPayment
                      ? formatRupiah(cashChange)
                      : splitOverpay
                        ? `Lebih ${formatRupiah(splitOverpay)}`
                        : amountShortage
                          ? formatRupiah(amountShortage)
                          : "Pas"}
                  </p>
                </div>
              </div>

              <div>
                <p className="brand-kicker">Mode pembayaran</p>
                <div className="brand-segmented mt-3 grid w-full grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMode("single")}
                    className={`brand-segmented-button ${
                      !isSplitPayment ? "brand-segmented-button-active" : ""
                    }`}
                  >
                    Sekali Bayar
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode("split")}
                    className={`brand-segmented-button ${
                      isSplitPayment ? "brand-segmented-button-active" : ""
                    }`}
                  >
                    Split Payment
                  </button>
                </div>
              </div>

              {!isSplitPayment ? (
                <>
                  <div>
                    <p className="brand-kicker">Metode bayar</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {paymentGroups.map((method) => (
                        <button
                          key={method.value}
                          type="button"
                          onClick={() => setPaymentGroup(method.value)}
                          className={`brand-choice-button min-h-[50px] text-sm ${
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

                  {paymentGroup === "transfer_bank" ? (
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Rekening tujuan toko
                      </label>
                      <select
                        value={bankWallet}
                        onChange={(event) => setBankWallet(event.target.value)}
                        className="brand-select"
                      >
                        {bankWalletOptions.map((option) => (
                          <option key={option.value} value={option.value} className="bg-white">
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {paymentGroup === "ewallet" ? (
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        E-Wallet tujuan toko
                      </label>
                      <select
                        value={ewalletWallet}
                        onChange={(event) => setEwalletWallet(event.target.value)}
                        className="brand-select"
                      >
                        {ewalletOptions.map((option) => (
                          <option key={option.value} value={option.value} className="bg-white">
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {paymentGroup === "cash" ? (
                    <div>
                      <label
                        htmlFor="cash-payment-received"
                        className="mb-2 block text-sm font-semibold text-slate-700"
                      >
                        Uang diterima
                      </label>
                      <input
                        id="cash-payment-received"
                        ref={cashInputRef}
                        type="number"
                        min="0"
                        value={cashReceived}
                        onChange={(event) => setCashReceived(event.target.value)}
                        className="brand-input h-14 text-lg font-black"
                        placeholder="Masukkan nominal"
                        aria-describedby="cash-payment-validation"
                        aria-invalid={cashReceived !== "" && cashShortage > 0}
                        required
                      />

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setCashReceived(String(cartTotal))}
                          className={`brand-choice-button ${
                            cashValue === cartTotal && cartTotal > 0
                              ? "brand-choice-button-active"
                              : "brand-choice-button-idle"
                          }`}
                        >
                          Uang Pas
                        </button>
                        {quickCashAmounts.map((amount) => (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => setCashReceived(String(amount))}
                            className={`brand-choice-button ${
                              cashValue === amount
                                ? "brand-choice-button-active"
                                : "brand-choice-button-idle"
                            }`}
                          >
                            {formatRupiah(amount)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="brand-subtle-block text-sm text-slate-600">
                      <p className="font-semibold text-slate-950">{resolvedPaymentLabel}</p>
                      <p className="mt-2">
                        Saldo saat ini:{" "}
                        <span className="font-semibold">{formatRupiah(selectedWalletBalance)}</span>
                      </p>
                      <p className="mt-1">
                        Setelah transaksi masuk:{" "}
                        <span className="font-semibold">
                          {formatRupiah(selectedWalletBalance + cartTotal)}
                        </span>
                      </p>
                    </div>
                  )}

                  <div
                    id="cash-payment-validation"
                    className={`rounded-lg border px-4 py-4 text-sm font-semibold ${cashDisplay.tone}`}
                    aria-live="polite"
                  >
                    {isCashPayment ? cashDisplay.label : `Pembayaran dicatat via ${resolvedPaymentLabel}`}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="brand-kicker">Rincian split</p>
                      <p className="mt-1 text-sm font-semibold text-slate-600">
                        Total split harus pas dengan tagihan.
                      </p>
                    </div>
                    <span
                      className={
                        splitPaymentReady ? "brand-badge-success" : "brand-badge-warning"
                      }
                    >
                      {splitPaymentReady ? "Siap bayar" : "Belum pas"}
                    </span>
                  </div>

                  {splitPayments.map((payment, index) => (
                    <div
                      key={payment.id}
                      className="rounded-lg border border-slate-200 bg-white p-3"
                    >
                      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <select
                          value={payment.method}
                          onChange={(event) =>
                            updateSplitPayment(payment.id, { method: event.target.value })
                          }
                          className="brand-select"
                          aria-label={`Metode split ${index + 1}`}
                        >
                          {splitPaymentOptions.map((option) => (
                            <option key={option.value} value={option.value} className="bg-white">
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0"
                          value={payment.amount}
                          onChange={(event) =>
                            updateSplitPayment(payment.id, { amount: event.target.value })
                          }
                          className="brand-input font-black"
                          placeholder="Nominal"
                          aria-label={`Nominal split ${index + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => fillSplitRemaining(payment.id)}
                          className="brand-button-secondary min-h-[42px] px-3 py-2 text-xs"
                        >
                          Isi Sisa
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-slate-500">
                          {walletPlatformLabelMap[payment.method] || payment.method}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeSplitPayment(payment.id)}
                          disabled={splitPayments.length <= 2}
                          className="text-xs font-bold text-[var(--brand-danger)] disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addSplitPayment}
                    className="brand-button-secondary w-full"
                  >
                    Tambah Metode Split
                  </button>

                  <div
                    className={`rounded-lg border px-4 py-4 text-sm font-semibold ${
                      splitOverpay
                        ? "border-red-200 bg-red-50 text-red-700"
                        : splitRemaining
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {splitOverpay
                      ? `Nominal split lebih ${formatRupiah(splitOverpay)}.`
                      : splitRemaining
                        ? `Sisa pembayaran ${formatRupiah(splitRemaining)}.`
                        : "Pembayaran split sudah pas."}
                  </div>
                </div>
              )}

              <div className="brand-subtle-block">
                <div className="flex items-center justify-between gap-4 text-sm text-slate-600">
                  <span>Total item</span>
                  <span className="font-semibold text-slate-950">{cartItemCount}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4 text-sm text-slate-600">
                  <span>Metode</span>
                  <span className="font-semibold text-slate-950">
                    {isSplitPayment ? "Split Payment" : resolvedPaymentLabel}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4 text-sm text-slate-600">
                  <span>Dibayar</span>
                  <span className="font-semibold text-slate-950">{formatRupiah(paidTotal)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4 text-sm text-slate-600">
                  <span>{isCashPayment ? "Kembalian" : "Sisa"}</span>
                  <span
                    className={`font-semibold ${
                      amountShortage ? "text-amber-700" : "text-slate-950"
                    }`}
                  >
                    {isCashPayment ? formatRupiah(cashChange) : formatRupiah(amountShortage)}
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Catatan
                </label>
                <div className="relative">
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
                  Reset Pembayaran
                </button>
                <button
                  type="submit"
                  disabled={checkoutDisabled}
                  className="brand-button-success disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {processing ? "Menyimpan..." : "Bayar & Cetak Struk"}
                </button>
              </div>
            </form>
          </Panel>
        </div>
        </div>
      )}

      {step === "product" && cartItemCount ? (
        <button
          type="button"
          onClick={handleContinue}
          className="brand-floating-checkout md:hidden"
          aria-label="Lanjut ke checkout"
        >
          <span className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-xs font-bold uppercase tracking-[0.18em]">
                Checkout
              </span>
              <span className="mt-1 block text-lg font-black">{formatRupiah(cartTotal)}</span>
            </span>
            <span className="rounded-md bg-white/50 px-3 py-2 text-sm font-black">
              {cartItemCount} item
            </span>
          </span>
        </button>
      ) : null}

      {successFeedback ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <div className="brand-success-popover brand-panel flex items-center gap-4 border-emerald-200 bg-white px-5 py-4 shadow-[0_18px_42px_rgba(21,128,61,0.16)]">
            <LottieState
              ariaLabel="Transaksi berhasil"
              icon="check"
              size={56}
            />
            <div className="min-w-0">
              <p className="font-semibold text-slate-950">Transaksi tersimpan</p>
              <p className="mt-1 truncate text-sm text-slate-600">
                {successFeedback.noTransaksi} - {formatRupiah(successFeedback.total)}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {receiptTransaction ? (
        <ReceiptModal
          transaction={receiptTransaction}
          onClose={() => setReceiptTransaction(null)}
          onNewTransaction={() => {
            setReceiptTransaction(null);
            setStep("product");
            window.requestAnimationFrame(() => {
              searchInputRef.current?.focus();
            });
          }}
        />
      ) : null}

      <ConfirmModal
        isOpen={Boolean(voidTarget)}
        title="Void transaksi terakhir?"
        message="Aksi ini hanya untuk transaksi yang perlu dibatalkan secara operasional."
        target={voidTarget?.no_transaksi || voidTarget?.id}
        consequence="Stok dan dampak wallet akan direversal, sementara catatan audit transaksi tetap disimpan."
        requiresPin
        destructive
        confirmLabel="Lanjut Void"
        onClose={() => setVoidTarget(null)}
        onConfirm={() => void confirmVoidLastTransaction()}
      />

      <PinConfirmationModal
        isOpen={isPinModalOpen}
        onClose={closePinModal}
        onConfirm={executeConfirmedAction}
        title="PIN untuk void transaksi"
        message={`Verifikasi aksi sensitif: ${actionDescription}`}
      />

      {processing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <Loading
            text="Menyimpan transaksi dan menyiapkan struk..."
            size={180}
          />
        </div>
      ) : null}
    </div>
  );
}

