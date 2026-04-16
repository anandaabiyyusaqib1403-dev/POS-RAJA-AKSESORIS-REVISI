export const walletPlatforms = [
  { value: "cash", label: "Cash", type: "cash" },
  { value: "dana", label: "DANA" },
  { value: "bank_mas", label: "Bank Mas" },
  { value: "wahana", label: "Wahana" },
  { value: "pasar_kuota", label: "PASAR KUOTA" },
  { value: "shopee", label: "Shopee" },
  { value: "bca", label: "BCA" },
  { value: "qris", label: "QRIS", type: "qris" },
];

export const walletPlatformLabelMap = walletPlatforms.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

export const walletPlatformIds = walletPlatforms.map((item) => item.value);

export const walletPlatformTypeMap = walletPlatforms.reduce((acc, item) => {
  acc[item.value] = item.type || "validated";
  return acc;
}, {});

export const nonValidatedWalletIds = ["cash", "qris"];

export const validatedWalletIds = walletPlatformIds.filter(
  (id) => !nonValidatedWalletIds.includes(id)
);

export const walletOverviewPlatforms = walletPlatformIds;

export const walletAliasMap = {
  tunai: "cash",
  cash: "cash",
  qris: "qris",
  dana: "dana",
  "bank mas": "bank_mas",
  bank_mas: "bank_mas",
  bankmas: "bank_mas",
  wahana: "wahana",
  "pasar kuota": "pasar_kuota",
  pasar_kuota: "pasar_kuota",
  pasarkuota: "pasar_kuota",
  shopee: "shopee",
  shopeepay: "shopee",
  bca: "bca",
};

export const walletTransactionTypes = [
  { value: "masuk", label: "Saldo Masuk" },
  { value: "keluar", label: "Saldo Keluar" },
  { value: "transfer_antar", label: "Transfer Antar Wallet" },
];

export const walletTransactionTypeLabelMap = walletTransactionTypes.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

export const bankProviderOptions = [
  "BCA",
  "Mandiri",
  "BRI",
  "BNI",
  "BSI",
  "CIMB Niaga",
  "Permata",
  "Lainnya",
];

export const ewalletProviderOptions = [
  "DANA",
  "GoPay",
  "ShopeePay",
  "OVO",
  "LinkAja",
  "Lainnya",
];

export const serviceTypes = [
  {
    value: "pulsa",
    label: "Pulsa",
    providerLabel: "Provider",
    providerPlaceholder: "Telkomsel / Indosat / XL",
    providerOptions: ["Telkomsel", "Indosat", "XL", "Tri", "Smartfren"],
    targetLabel: "Nomor Tujuan",
    targetPlaceholder: "08xxxxxxxxxx",
    targetNameLabel: "Nama Pelanggan",
    targetNamePlaceholder: "Opsional",
  },
  {
    value: "kuota",
    label: "Kuota",
    providerLabel: "Provider",
    providerPlaceholder: "Telkomsel / Indosat / XL",
    providerOptions: ["Telkomsel", "Indosat", "XL", "Tri", "Smartfren"],
    targetLabel: "Nomor Tujuan",
    targetPlaceholder: "08xxxxxxxxxx",
    targetNameLabel: "Nama Pelanggan",
    targetNamePlaceholder: "Opsional",
  },
  {
    value: "voucher_game",
    label: "Voucher Game",
    providerLabel: "Game / Platform",
    providerPlaceholder: "Garena / Mobile Legends / Steam",
    providerOptions: ["Mobile Legends", "Free Fire", "PUBG Mobile", "Steam", "Garena"],
    targetLabel: "User ID / Server ID",
    targetPlaceholder: "Masukkan ID tujuan",
    targetNameLabel: "Nama Akun",
    targetNamePlaceholder: "Opsional",
  },
  {
    value: "token_listrik",
    label: "Token Listrik",
    providerLabel: "Provider",
    providerPlaceholder: "PLN",
    providerOptions: ["PLN"],
    defaultProvider: "PLN",
    targetLabel: "Nomor Meter / ID Pelanggan",
    targetPlaceholder: "Masukkan nomor meter atau ID",
    targetNameLabel: "Nama Pelanggan",
    targetNamePlaceholder: "Opsional",
  },
  {
    value: "transfer_bank",
    label: "Transfer Bank",
    providerLabel: "Bank Tujuan",
    providerPlaceholder: "BCA / Mandiri / BRI",
    providerOptions: bankProviderOptions,
    targetLabel: "Nomor Rekening",
    targetPlaceholder: "Masukkan nomor rekening tujuan",
    targetNameLabel: "Nama Penerima",
    targetNamePlaceholder: "Wajib diisi",
    targetNameRequired: true,
    sourcePlatformLabel: "Sumber Saldo Toko",
    sourcePlatformRequired: true,
  },
  {
    value: "transfer_ewallet",
    label: "Transfer E-Wallet",
    providerLabel: "Platform Tujuan",
    providerPlaceholder: "DANA / GoPay / OVO",
    providerOptions: ewalletProviderOptions,
    targetLabel: "Nomor HP / ID Akun",
    targetPlaceholder: "Masukkan nomor tujuan",
    targetNameLabel: "Nama Penerima",
    targetNamePlaceholder: "Wajib diisi",
    targetNameRequired: true,
    sourcePlatformLabel: "Sumber Saldo Toko",
    sourcePlatformRequired: true,
  },
  {
    value: "tarik_tunai",
    label: "Tarik Tunai",
    providerLabel: "Platform / Bank Pelanggan",
    providerPlaceholder: "DANA / GoPay / BCA",
    providerOptions: [...ewalletProviderOptions, ...bankProviderOptions],
    targetLabel: "Nomor Akun / Nomor HP",
    targetPlaceholder: "Masukkan nomor akun pelanggan",
    targetNameLabel: "Nama Pemilik Akun",
    targetNamePlaceholder: "Wajib diisi",
    targetNameRequired: true,
  },
  {
    value: "lainnya",
    label: "Lainnya",
    providerLabel: "Layanan / Provider",
    providerPlaceholder: "Isi nama layanan",
    providerOptions: [],
    targetLabel: "Tujuan / Referensi",
    targetPlaceholder: "Isi nomor, ID, atau referensi",
    targetNameLabel: "Nama Tujuan",
    targetNamePlaceholder: "Opsional",
  },
];

export const serviceTypeLabelMap = serviceTypes.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

export const logisticsCouriers = [
  "JNE",
  "Wahana",
  "SiCepat",
  "J&T",
];

export const logisticsPackageTypes = [
  "Regular",
  "Express",
  "Cargo",
];

export const cashTypes = [
  { value: "pemasukan", label: "Pemasukan" },
  { value: "pengeluaran", label: "Pengeluaran" },
];

export const cashCategories = [
  { value: "saldo_awal", label: "Saldo Awal" },
  { value: "tambah_saldo", label: "Tambah Saldo" },
  { value: "setor_bank", label: "Setor Bank" },
  { value: "tarik_tunai", label: "Tarik Tunai" },
  { value: "restock", label: "Restock" },
  { value: "listrik", label: "Listrik" },
  { value: "sewa", label: "Sewa" },
  { value: "gaji", label: "Gaji" },
  { value: "operasional", label: "Operasional" },
  { value: "lainnya", label: "Lainnya" },
];

export const cashCategoryLabelMap = cashCategories.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});
