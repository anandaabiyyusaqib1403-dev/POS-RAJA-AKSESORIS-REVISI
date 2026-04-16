import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";

export default function HelpPage() {
  const sections = [
    {
      title: "Kasir cepat",
      items: [
        "Masuk ke halaman Kasir, pilih kategori, lalu klik produk untuk langsung menambah cart.",
        "Untuk transaksi digital, gunakan shortcut kategori di POS atau buka menu Transaksi Keuangan.",
        "Pilih metode bayar dan selesaikan checkout tanpa popup tambahan.",
      ],
    },
    {
      title: "Owner control",
      items: [
        "Pantau omzet, profit, dan transaksi dari Dashboard.",
        "Gunakan Stok Barang untuk update master produk dan cek stok menipis.",
        "Masuk ke Laporan Keuangan atau Laporan Penjualan untuk rekap periodik dan export.",
      ],
    },
    {
      title: "Operasional harian",
      items: [
        "Saldo dipakai untuk mutasi dana internal toko.",
        "Catat Operasional dipakai untuk pemasukan dan pengeluaran kas.",
        "Kalkulator membantu cocokkan uang fisik dengan saldo sistem.",
      ],
    },
    {
      title: "HUBUNGI ABIYYU",
      items: [
        "anandaabiyyu1403@gmail.com",
        "https:wa.me/6285659085578"
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Support"
        title="Bantuan operasional"
        description="Panduan singkat untuk kasir dan owner supaya alur kerja tetap cepat dan tidak membingungkan."
        icon="help"
      />

      <div className="grid gap-6 xl:grid-cols-3">
        {sections.map((section) => (
          <Panel key={section.title} className="p-6">
            <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
              {section.title}
            </h3>
            <div className="mt-5 space-y-3">
              {section.items.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-600"
                >
                  {item}
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
