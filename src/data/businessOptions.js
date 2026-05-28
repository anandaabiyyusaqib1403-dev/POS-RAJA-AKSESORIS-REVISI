export const walletPlatforms = [
  { value: "cash", label: "Cash", type: "cash" },
  { value: "dana", label: "DANA" },
  { value: "bank_mas", label: "Bank Mas" },
  { value: "mandiri", label: "Mandiri" },
  { value: "bri", label: "BRI" },
  { value: "bni", label: "BNI" },
  { value: "wahana", label: "Wahana" },
  { value: "pasar_kuota", label: "PASAR KUOTA" },
  { value: "shopee", label: "Shopee Pay" },
  { value: "gopay", label: "GoPay" },
  { value: "ovo", label: "OVO" },
  { value: "bca", label: "BCA" },
  { value: "qris", label: "QRIS", type: "qris" },
];

export const externalCustomerPaymentPlatforms = [
  { value: "gopay_customer", label: "GoPay Customer" },
  { value: "gopay_driver", label: "GoPay Driver" },
  { value: "grab_customer", label: "Grab Customer" },
  { value: "grab_driver", label: "Grab Driver" },
  { value: "isaku_indomaret", label: "iSaku Indomaret" },
  { value: "shopee_food_driver", label: "Shopee Food Driver" },
  { value: "maxim_driver", label: "Maxim Driver" },
  { value: "linkaja", label: "Link Aja" },
  { value: "in_driver", label: "In Driver" },
  { value: "emoney", label: "eMoney" },
  { value: "etoll_emoney_mandiri", label: "E-toll E-Money Mandiri" },
  { value: "etoll_brizzi", label: "E-toll BRIZZI" },
  { value: "etoll_tapcash_bni", label: "E-toll TapCash BNI" },
];

export const customerPaymentPlatforms = [
  ...walletPlatforms,
  ...externalCustomerPaymentPlatforms,
];

export const walletPlatformLabelMap = customerPaymentPlatforms.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

export const walletPlatformIds = walletPlatforms.map((item) => item.value);
export const customerPaymentPlatformIds = customerPaymentPlatforms.map((item) => item.value);

export const walletPlatformTypeMap = walletPlatforms.reduce((acc, item) => {
  acc[item.value] = item.type || "validated";
  return acc;
}, {});

export const nonValidatedWalletIds = ["cash", "qris", "split"];

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
  mandiri: "mandiri",
  bri: "bri",
  bni: "bni",
  wahana: "wahana",
  "pasar kuota": "pasar_kuota",
  pasar_kuota: "pasar_kuota",
  pasarkuota: "pasar_kuota",
  shopee: "shopee",
  "shopee pay": "shopee",
  shopeepay: "shopee",
  gopay: "gopay",
  "go pay": "gopay",
  ovo: "ovo",
  "gopay customer": "gopay_customer",
  gopay_customer: "gopay_customer",
  "gopay driver": "gopay_driver",
  gopay_driver: "gopay_driver",
  "grab customer": "grab_customer",
  grab_customer: "grab_customer",
  "grab driver": "grab_driver",
  grab_driver: "grab_driver",
  "isaku indomaret": "isaku_indomaret",
  isaku: "isaku_indomaret",
  isaku_indomaret: "isaku_indomaret",
  "shopee food driver": "shopee_food_driver",
  shopee_food_driver: "shopee_food_driver",
  "maxim driver": "maxim_driver",
  maxim_driver: "maxim_driver",
  "link aja": "linkaja",
  linkaja: "linkaja",
  "in driver": "in_driver",
  in_driver: "in_driver",
  emoney: "emoney",
  "e-money": "emoney",
  "e money": "emoney",
  "e-toll e-money mandiri": "etoll_emoney_mandiri",
  "etoll emoney mandiri": "etoll_emoney_mandiri",
  etoll_emoney_mandiri: "etoll_emoney_mandiri",
  "e-toll brizzi": "etoll_brizzi",
  brizzi: "etoll_brizzi",
  etoll_brizzi: "etoll_brizzi",
  "e-toll tapcash bni": "etoll_tapcash_bni",
  tapcash: "etoll_tapcash_bni",
  etoll_tapcash_bni: "etoll_tapcash_bni",
  bca: "bca",
  split: "split",
  "split payment": "split",
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
  "Bank BCA",
  "Bank Mandiri",
  "Bank BRI",
  "Bank BNI",
  "Bank CIMB Niaga",
  "Bank Danamon",
  "Bank Permata",
  "Bank BTN",
  "Jago (Bank Jago)",
  "Jenius (BTPN)",
  "Blu by BCA Digital",
  "SeaBank",
  "Neo Bank (Bank Neo Commerce)",
  "Line Bank",
  "MotionBanking (MNC Bank)",
  "Bank Syariah Indonesia (BSI)",
  "Bank Muamalat",
  "Bank Mega",
  "Bank OCBC NISP",
  "Bank HSBC Indonesia",
  "Bank Maybank Indonesia",
  "Bank Panin",
  "Bank Sinarmas",
];

export const ewalletProviderOptions = [
  "E-Wallet",
  "Dana",
  "ShopeePay",
  "OVO",
  "Gopay Customer",
  "Gopay Driver",
  "Grab Customer",
  "Grab Driver",
  "iSaku Indomaret",
  "Shopee Food Driver",
  "Maxim Driver",
  "LinkAja",
  "In Driver",
  "eMoney",
  "E-toll E-Money Mandiri",
  "E-toll BRIZZI",
  "E-toll TapCash BNI",
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
    providerPlaceholder: "Bank BCA / Bank Mandiri / Bank BRI",
    providerOptions: bankProviderOptions,
    targetLabel: "Nomor Rekening",
    targetPlaceholder: "Masukkan nomor rekening tujuan",
    targetNameLabel: "Nama Penerima",
    targetNamePlaceholder: "Wajib diisi",
    targetNameRequired: true,
  },
  {
    value: "transfer_ewallet",
    label: "Transfer E-Wallet",
    providerLabel: "Platform Tujuan",
    providerPlaceholder: "Dana / ShopeePay / OVO",
    providerOptions: ewalletProviderOptions,
    targetLabel: "Nomor HP / ID Akun",
    targetPlaceholder: "Masukkan nomor tujuan",
    targetNameLabel: "Nama Penerima",
    targetNamePlaceholder: "Wajib diisi",
    targetNameRequired: true,
  },
  {
    value: "tarik_tunai",
    label: "Tarik Tunai",
    providerLabel: "Platform / Bank Pelanggan",
    providerPlaceholder: "Dana / Bank BCA",
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

// Additional service types removed per feature deprecation

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
    { value: "tabungan", label: "Tabungan" },
  { value: "restock", label: "Restock" },
  { value: "listrik", label: "Listrik" },
  { value: "sewa", label: "Sewa" },
  { value: "gaji", label: "Gaji" },
  { value: "operasional", label: "Operasional" },
  { value: "bonus", label: "Bonus" },
  { value: "marketing", label: "Marketing" },
  { value: "lainnya", label: "Lainnya" },
];

export const cashCategoryLabelMap = cashCategories.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});
