import { useMemo, useState } from "react";
import AppIcon from "../components/app/AppIcon";
import LottieState from "../components/LottieState";
import Panel from "../components/app/Panel";

const categories = [
  { id: "semua", label: "Semua", icon: "spark" },
  { id: "shift", label: "Shift", icon: "history" },
  { id: "kasir", label: "Kasir POS", icon: "pos" },
  { id: "digital", label: "Layanan Digital", icon: "credit" },
  { id: "wallet", label: "Saldo & Wallet", icon: "wallet" },
  { id: "stok", label: "Stok Barang", icon: "box" },
  { id: "opname", label: "Stock Opname", icon: "clipboard" },
  { id: "retur", label: "Retur", icon: "return" },
  { id: "laporan", label: "Laporan", icon: "chart" },
  { id: "print", label: "Thermal Print", icon: "receipt" },
  { id: "akun", label: "Akun & PIN", icon: "settings" },
  { id: "trouble", label: "Troubleshooting", icon: "help" },
];

const categoryById = categories.reduce((acc, category) => {
  acc[category.id] = category;
  return acc;
}, {});

const guides = [
  {
    id: "open-shift",
    title: "Cara Membuka Shift",
    category: "shift",
    audience: "kasir",
    time: "2 menit",
    description: "Shift wajib aktif sebelum transaksi disimpan.",
    tags: ["opening", "mulai shift", "kasir"],
    steps: [
      "Login memakai akun kasir atau owner.",
      "Masuk ke menu Shift.",
      "Pilih kasir yang bertugas jika login sebagai owner.",
      "Klik Buka Shift.",
      "Pastikan status berubah menjadi shift aktif.",
      "Lanjut ke Kasir POS atau Layanan Digital.",
    ],
    warning: "Transaksi akan ditolak jika belum ada shift aktif.",
    tip: "Buka shift saat toko mulai beroperasi agar laporan harian masuk ke kasir yang benar.",
  },
  {
    id: "close-shift",
    title: "Cara Closing Shift",
    category: "shift",
    audience: "kasir",
    time: "4 menit",
    description: "Tutup shift dan cocokkan uang cash fisik dengan sistem.",
    tags: ["closing", "pin", "actual cash", "kas"],
    steps: [
      "Masuk ke menu Shift.",
      "Pilih shift aktif.",
      "Hitung uang cash fisik.",
      "Isi actual cash sesuai uang fisik.",
      "Tambahkan catatan jika ada selisih.",
      "Masukkan PIN kasir.",
      "Kirim closing untuk direview owner.",
    ],
    warning: "Selisih besar perlu dicek owner sebelum shift di-approve.",
    tip: "Pisahkan uang transaksi toko dengan uang pribadi agar closing lebih cepat.",
  },
  {
    id: "approve-shift",
    title: "Approval Shift oleh Owner",
    category: "shift",
    audience: "owner",
    time: "4 menit",
    description: "Review closing kasir sebelum data harian dianggap selesai.",
    tags: ["owner", "approval", "selisih", "closing"],
    steps: [
      "Login sebagai owner.",
      "Buka menu Shift.",
      "Cari shift dengan status pending atau flagged.",
      "Bandingkan expected cash, actual cash, dan catatan kasir.",
      "Cek riwayat transaksi jika ada selisih besar.",
      "Approve jika data sudah benar.",
    ],
    warning: "Jangan approve shift dengan selisih besar sebelum penyebabnya jelas.",
    tip: "Cek shift setiap akhir hari agar laporan laba tidak tertunda.",
  },
  {
    id: "accessory-checkout",
    title: "Transaksi Aksesoris dari Scan sampai Print",
    category: "kasir",
    audience: "kasir",
    time: "3 menit",
    description: "Alur utama transaksi produk fisik aksesoris HP.",
    tags: ["barcode", "checkout", "print", "keranjang"],
    steps: [
      "Pastikan shift aktif.",
      "Buka menu Kasir POS.",
      "Scan barcode atau cari nama produk.",
      "Klik produk untuk masuk ke keranjang.",
      "Atur qty jika pelanggan membeli lebih dari satu.",
      "Klik Lanjut checkout.",
      "Pilih metode bayar.",
      "Klik Simpan Transaksi.",
      "Cetak struk jika pelanggan membutuhkan bukti.",
    ],
    warning: "Produk dengan stok habis tidak bisa ditambahkan ke keranjang.",
    tip: "Jika barcode cocok, tekan Enter agar produk langsung masuk keranjang.",
  },
  {
    id: "digital-service",
    title: "Input Layanan Digital",
    category: "digital",
    audience: "kasir",
    time: "4 menit",
    description: "Panduan pulsa, kuota, token, voucher, transfer, dan layanan lain.",
    tags: ["pulsa", "kuota", "token", "voucher", "pasarkuota"],
    steps: [
      "Pastikan shift aktif.",
      "Buka menu Layanan Digital.",
      "Pilih kategori layanan.",
      "Pilih provider dan produk layanan.",
      "Isi nomor tujuan atau data pelanggan.",
      "Cek harga jual, modal, dan laba.",
      "Pilih metode pembayaran pelanggan.",
      "Simpan transaksi.",
    ],
    warning: "Pastikan saldo supplier mencukupi untuk layanan yang memotong wallet.",
    tip: "Gunakan layanan favorit untuk produk yang paling sering dijual.",
  },
  {
    id: "wallet-topup",
    title: "Tambah dan Transfer Saldo Wallet",
    category: "wallet",
    audience: "owner",
    time: "3 menit",
    description: "Catat saldo masuk, keluar, tarik tunai, atau transfer antar wallet.",
    tags: ["saldo", "wallet", "transfer", "mutasi"],
    steps: [
      "Buka menu Saldo.",
      "Pilih jenis mutasi.",
      "Pilih platform asal.",
      "Isi platform tujuan jika transfer antar wallet.",
      "Isi nominal dan biaya admin bila ada.",
      "Simpan mutasi.",
      "Cek ringkasan saldo setelah tersimpan.",
    ],
    warning: "Saldo keluar akan ditolak jika saldo wallet tidak mencukupi.",
    tip: "Catat top up supplier segera agar layanan digital tidak terhambat.",
  },
  {
    id: "add-product",
    title: "Tambah Produk dan Barcode",
    category: "stok",
    audience: "owner",
    time: "5 menit",
    description: "Buat produk baru agar muncul di Kasir POS.",
    tags: ["produk", "barcode", "kategori", "harga", "stok"],
    steps: [
      "Buka menu Stok Barang.",
      "Masuk ke bagian Tambah Produk.",
      "Isi nama produk dan kategori.",
      "Isi barcode jika ada, atau kosongkan agar sistem membuat kode.",
      "Isi harga modal, harga jual, stok awal, dan stok minimum.",
      "Klik Simpan Produk.",
      "Cek produk muncul di daftar dan Kasir POS.",
    ],
    warning: "Barcode tidak boleh sama dengan produk lain, termasuk produk di History Produk.",
    tip: "Gunakan kategori yang konsisten agar pencarian kasir lebih cepat.",
  },
  {
    id: "stock-mutation",
    title: "Mencatat Stok Masuk atau Penyesuaian",
    category: "stok",
    audience: "kasir",
    time: "3 menit",
    description: "Catat perubahan stok dari barang masuk atau penyesuaian sederhana.",
    tags: ["stok masuk", "mutasi", "penyesuaian"],
    steps: [
      "Buka menu Stok Barang.",
      "Masuk ke bagian mutasi stok.",
      "Pilih produk.",
      "Pilih tipe mutasi yang tersedia.",
      "Isi jumlah barang.",
      "Tambahkan catatan.",
      "Simpan mutasi.",
    ],
    warning: "Gunakan catatan agar owner tahu alasan perubahan stok.",
    tip: "Catat nomor nota supplier jika stok berasal dari pembelian barang.",
  },
  {
    id: "stock-opname",
    title: "Melakukan Stock Opname",
    category: "opname",
    audience: "owner",
    time: "7 menit",
    description: "Cocokkan stok fisik toko dengan stok di sistem.",
    tags: ["opname", "stok fisik", "selisih"],
    steps: [
      "Buka menu Stock Opname.",
      "Buat sesi opname baru.",
      "Pilih kategori jika ingin opname bertahap.",
      "Hitung stok fisik di toko.",
      "Isi stok fisik pada item opname.",
      "Simpan draft jika belum selesai.",
      "Apply sesi opname setelah data dicek.",
    ],
    warning: "Apply opname akan mengubah stok sistem.",
    tip: "Lakukan opname saat toko sepi agar transaksi tidak mengganggu hitungan.",
  },
  {
    id: "supplier-return",
    title: "Mencatat Retur Supplier",
    category: "retur",
    audience: "owner",
    time: "4 menit",
    description: "Catat barang rusak atau salah kirim yang dikembalikan ke supplier.",
    tags: ["retur", "supplier", "barang rusak"],
    steps: [
      "Buka menu Retur & Garansi.",
      "Pilih tab Retur Supplier.",
      "Pilih produk yang akan diretur.",
      "Isi jumlah dan alasan retur.",
      "Simpan retur.",
      "Update status saat supplier sudah menyelesaikan retur.",
    ],
    warning: "Jumlah retur tidak boleh melebihi stok yang tersedia.",
    tip: "Tambahkan catatan nota supplier agar retur mudah dilacak.",
  },
  {
    id: "financial-report",
    title: "Membaca Laporan Laba",
    category: "laporan",
    audience: "owner",
    time: "5 menit",
    description: "Pahami omzet, modal, laba, pengeluaran, dan performa toko.",
    tags: ["laporan", "laba", "omzet", "modal", "export"],
    steps: [
      "Buka Laporan Keuangan atau Laporan Penjualan.",
      "Pilih periode laporan.",
      "Cek omzet dan modal.",
      "Bandingkan laba dengan pengeluaran operasional.",
      "Cek produk, layanan, provider, dan kasir terbaik.",
      "Export laporan jika dibutuhkan.",
    ],
    warning: "Laba akurat hanya jika modal produk dan modal layanan diinput benar.",
    tip: "Review laporan setelah shift kasir selesai di-approve.",
  },
  {
    id: "dashboard-owner",
    title: "Membaca Dashboard Owner",
    category: "laporan",
    audience: "owner",
    time: "4 menit",
    description: "Gunakan dashboard sebagai ringkasan kondisi toko harian.",
    tags: ["dashboard", "owner", "stok kritis", "saldo", "alert"],
    steps: [
      "Login sebagai owner.",
      "Buka Dashboard.",
      "Cek omzet, laba, total transaksi, dan produk terjual.",
      "Perhatikan alert stok kritis, saldo, retur pending, dan approval shift.",
      "Gunakan filter periode jika perlu membandingkan performa.",
      "Buka laporan detail untuk audit angka.",
    ],
    warning: "Dashboard adalah ringkasan. Untuk audit angka, tetap cek laporan dan riwayat transaksi.",
    tip: "Mulai review harian dari alert dashboard lalu lanjut ke approval shift.",
  },
  {
    id: "thermal-print",
    title: "Mengatasi Struk Tidak Tercetak",
    category: "print",
    audience: "kasir",
    time: "3 menit",
    description: "Solusi saat popup print atau printer thermal bermasalah.",
    tags: ["printer", "thermal", "struk", "popup"],
    steps: [
      "Pastikan printer thermal menyala dan terhubung.",
      "Cek kertas thermal terpasang benar.",
      "Klik Cetak Struk Thermal dari modal transaksi.",
      "Jika popup diblokir, izinkan popup browser.",
      "Jika hasil terpotong, pakai Preview 80mm.",
      "Pilih ukuran kertas 80mm pada dialog printer.",
    ],
    warning: "Jangan simpan transaksi ulang hanya karena struk gagal print.",
    tip: "Cetak ulang dari preview atau riwayat transaksi jika transaksi sudah tersimpan.",
  },
  {
    id: "account-pin",
    title: "Akun, Role, dan PIN",
    category: "akun",
    audience: "semua",
    time: "3 menit",
    description: "Pahami akses kasir, akses owner, dan PIN untuk aksi sensitif.",
    tags: ["akun", "pin", "role", "login"],
    steps: [
      "Login memakai email dan password akun masing-masing.",
      "Kasir mendapat akses operasional harian.",
      "Owner mendapat akses laporan, audit, retur, opname, dan approval.",
      "Gunakan PIN saat closing shift atau aksi sensitif.",
      "Minta owner mengecek akun jika role atau PIN bermasalah.",
    ],
    warning: "Jangan berbagi PIN antar kasir.",
    tip: "Gunakan akun berbeda untuk setiap kasir agar laporan performa akurat.",
  },
  {
    id: "transaction-failed",
    title: "Kenapa Transaksi Gagal Disimpan?",
    category: "trouble",
    audience: "semua",
    time: "3 menit",
    description: "Checklist cepat saat transaksi gagal.",
    tags: ["gagal", "internet", "shift", "stok", "saldo"],
    steps: [
      "Cek koneksi internet laptop.",
      "Pastikan shift masih aktif.",
      "Cek stok produk jika transaksi aksesoris.",
      "Cek saldo supplier jika transaksi layanan digital.",
      "Pastikan metode pembayaran sudah dipilih benar.",
      "Jika error berulang, screenshot pesan error dan hubungi admin.",
    ],
    warning: "Jangan klik simpan berkali-kali sebelum tahu penyebab error.",
    tip: "Jika transaksi belum tersimpan, perbaiki penyebabnya lalu simpan ulang satu kali.",
  },
];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function AudienceFilter({ value, onChange }) {
  const options = [
    { value: "semua", label: "Semua" },
    { value: "kasir", label: "Kasir" },
    { value: "owner", label: "Owner" },
  ];

  return (
    <div className="brand-segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`brand-segmented-button ${
            value === option.value ? "brand-segmented-button-active" : ""
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function GuideCard({ guide, category, isOpen, onToggle }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-4 p-5 text-left transition hover:bg-slate-50 sm:flex-row sm:items-start"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
          <AppIcon name={category.icon} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="brand-badge-neutral">{category.label}</span>
            <span className="brand-badge-info">{guide.time}</span>
            <span className="brand-badge">{guide.audience === "owner" ? "Owner" : guide.audience === "kasir" ? "Kasir" : "Semua"}</span>
          </span>
          <h3 className="mt-3 text-lg font-bold tracking-tight text-slate-950">{guide.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{guide.description}</p>
        </span>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition ${
            isOpen ? "rotate-90 border-[var(--brand-gold)]/40 text-slate-950" : ""
          }`}
        >
          <AppIcon name="chevron" className="h-4 w-4" />
        </span>
      </button>

      <div
        className={`grid transition-all duration-300 ease-out ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-slate-200 px-5 py-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div>
                <p className="brand-kicker">Langkah panduan</p>
                <ol className="mt-4 space-y-3">
                  {guide.steps.map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm leading-6 text-slate-600">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-gold)]/14 text-xs font-black text-slate-950">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-800">
                  <p className="font-bold">Perhatian</p>
                  <p className="mt-1">{guide.warning}</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4 text-sm leading-6 text-blue-800">
                  <p className="font-bold">Tips</p>
                  <p className="mt-1">{guide.tip}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function HelpPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("semua");
  const [audience, setAudience] = useState("semua");
  const [openGuideId, setOpenGuideId] = useState("open-shift");

  const categoryCounts = useMemo(
    () =>
      guides.reduce((acc, guide) => {
        acc[guide.category] = (acc[guide.category] || 0) + 1;
        return acc;
      }, {}),
    []
  );

  const filteredGuides = useMemo(() => {
    const keyword = normalizeText(search);

    return guides.filter((guide) => {
      const categoryMatch = activeCategory === "semua" || guide.category === activeCategory;
      const audienceMatch =
        audience === "semua" || guide.audience === audience || guide.audience === "semua";
      const searchable = [
        guide.title,
        guide.description,
        guide.category,
        guide.audience,
        guide.warning,
        guide.tip,
        ...guide.tags,
        ...guide.steps,
      ]
        .join(" ")
        .toLowerCase();

      return categoryMatch && audienceMatch && (!keyword || searchable.includes(keyword));
    });
  }, [activeCategory, audience, search]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[var(--brand-gold)]/24 bg-[linear-gradient(135deg,#ffffff_0%,#fffaf0_100%)] p-5 shadow-[0_16px_34px_rgba(15,23,42,0.08)] sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <span className="brand-chip">
              <AppIcon name="help" className="h-3.5 w-3.5" />
              Panduan POS
            </span>
            <h1 className="mt-5 font-display text-3xl font-black tracking-tight text-slate-950 sm:text-[40px]">
              Pusat Bantuan POS
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
              Panduan penggunaan sistem Raja Aksesoris untuk kasir dan owner. Cari masalah atau
              pilih kategori, lalu buka langkah panduan yang dibutuhkan.
            </p>
            <button
              type="button"
              onClick={() => document.getElementById("hubungi-admin")?.scrollIntoView({ behavior: "smooth" })}
              className="brand-button-secondary mt-5 gap-2"
            >
              <AppIcon name="users" className="h-4 w-4" />
              Hubungi Admin
            </button>
          </div>

          <div className="w-full xl:max-w-sm">
            <AudienceFilter value={audience} onChange={setAudience} />
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
          <div className="relative">
            <AppIcon
              name="search"
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="brand-input h-14 pl-11 pr-5 text-base"
              placeholder="Cari panduan: shift, stok, retur, printer..."
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setActiveCategory("semua");
              setAudience("semua");
            }}
            className="brand-button-secondary"
          >
            Reset
          </button>
        </div>
      </section>

      <Panel className="p-4">
        <div className="brand-scrollbar flex gap-2 overflow-x-auto pb-1">
          {categories.map((category) => {
            const active = activeCategory === category.id;
            const count = category.id === "semua" ? guides.length : categoryCounts[category.id] || 0;

            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                className={`inline-flex min-w-max items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition duration-200 ease-out hover:-translate-y-px ${
                  active
                    ? "border-[var(--brand-gold)]/40 bg-[var(--brand-gold)]/14 text-slate-950"
                    : "border-slate-200 bg-white text-slate-600 hover:border-[var(--brand-gold)]/35 hover:bg-[var(--brand-surface-tint)]"
                }`}
              >
                <AppIcon name={category.icon} className="h-4 w-4" />
                {category.label}
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel className="p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="brand-kicker">Daftar panduan</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
              Panduan Operasional
            </h2>
          </div>
          <p className="text-sm font-semibold text-slate-500">
            {filteredGuides.length} panduan tampil
          </p>
        </div>

        <div className="mt-5 space-y-4">
          {filteredGuides.length ? (
            filteredGuides.map((guide) => (
              <GuideCard
                key={guide.id}
                guide={guide}
                category={categoryById[guide.category] || categoryById.semua}
                isOpen={openGuideId === guide.id}
                onToggle={() =>
                  setOpenGuideId((current) => (current === guide.id ? "" : guide.id))
                }
              />
            ))
          ) : (
            <div className="brand-empty-state brand-empty-state-with-motion min-h-[320px]">
              <LottieState
                ariaLabel="Panduan tidak ditemukan"
                size={132}
              />
              <p className="text-lg font-semibold text-slate-950">Panduan tidak ditemukan</p>
              <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
                Coba kata kunci lain seperti shift, stok, saldo, printer, retur, atau laporan.
              </p>
            </div>
          )}
        </div>
      </Panel>

      <Panel id="hubungi-admin" variant="strong" className="scroll-mt-24 p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div>
            <p className="brand-kicker text-[var(--brand-gold)]/90">Hubungi admin</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
              Butuh bantuan teknis?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Kalau panduan belum menyelesaikan masalah, kirim screenshot error, nama akun,
              jam kejadian, dan langkah terakhir yang dilakukan.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <a
              href="mailto:anandaabiyyu1403@gmail.com"
              className="brand-button-secondary justify-start gap-2"
            >
              <AppIcon name="help" className="h-4 w-4" />
              Email Admin
            </a>
            <a
              href="https://wa.me/6285659085578"
              target="_blank"
              rel="noreferrer"
              className="brand-button-primary justify-start gap-2"
            >
              <AppIcon name="users" className="h-4 w-4" />
              WhatsApp Admin
            </a>
          </div>
        </div>
      </Panel>
    </div>
  );
}
