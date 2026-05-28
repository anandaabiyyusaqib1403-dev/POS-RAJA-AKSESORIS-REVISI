import { useEffect, useState } from "react";
import AppIcon from "../components/app/AppIcon";
import { useLocation, useNavigate } from "react-router-dom";
import BrandMark from "../components/BrandMark";
import LoadingState from "../components/LoadingState";
import Panel from "../components/app/Panel";
import { useAuth } from "../contexts/useAuth";
import { getDefaultRoute } from "../core/navigation/navigation";
import { resetBrowserAppStateAndReload } from "../utils/browserRecovery";

export default function Login() {
  const {
    user,
    authState,
    login,
    logout,
    profileError,
    retryProfileVerification,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectPath = location.state?.from?.pathname;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      navigate(redirectPath || getDefaultRoute(user.role), { replace: true });
    }
  }, [navigate, redirectPath, user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err?.message || "Login belum berhasil. Cek email dan password, lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  if (user) {
    return <LoadingState text="Membuka aplikasi..." fullScreen />;
  }

  if (authState === "checking_session") {
    return <LoadingState text="Memuat sesi..." fullScreen />;
  }

  if (authState === "verifying_profile") {
    return <LoadingState text="Memverifikasi profil pengguna..." fullScreen />;
  }

  if (authState === "profile_error" && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--brand-bg)] px-4">
        <Panel className="w-full max-w-[440px] p-8 text-center">
          <div className="mx-auto inline-flex rounded-lg border border-red-200 bg-red-50 p-4">
            <BrandMark size="lg" className="h-14 w-14" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-bold text-slate-950">
            Gagal memverifikasi profil pengguna
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {profileError || "Profil pengguna tidak bisa diverifikasi."}
          </p>
          <div className="mt-6 grid gap-3">
            <button
              type="button"
              className="brand-button-primary w-full"
              onClick={() => {
                void retryProfileVerification().catch((err) => {
                  setError(err?.message || "Gagal memverifikasi ulang akun.");
                });
              }}
            >
              Coba Lagi
            </button>
            <button
              type="button"
              className="w-full text-center text-xs font-semibold text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline"
              onClick={() => {
                void logout();
              }}
            >
              Logout
            </button>
          </div>
          {error ? (
            <p className="mt-4 text-xs font-semibold leading-5 text-red-600">{error}</p>
          ) : null}
        </Panel>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--brand-bg)] px-4 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-7xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <Panel
          variant="strong"
          className="brand-glow hidden overflow-hidden p-10 lg:flex lg:flex-col lg:justify-between"
        >
          <div>
            <div className="inline-flex rounded-lg border border-[var(--brand-gold)]/22 bg-white p-4 shadow-[0_18px_40px_rgba(212,175,55,0.12)]">
              <BrandMark size="xl" className="h-20 w-20" />
            </div>
            <p className="mt-8 brand-kicker text-[var(--brand-gold)]/90">
              Raja Aksesoris
            </p>
            <h1 className="mt-4 max-w-3xl font-display text-5xl font-bold leading-tight tracking-tight text-slate-950">
              Operasional toko terasa lebih ringan saat transaksi, stok, dan laporan jalan dalam satu ritme.
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-8 text-slate-600">
              Dipakai untuk aksesoris, pulsa, kuota, logistik, dan kas harian tanpa bikin kerja
              kasir terasa berlapis.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {[
              {
                icon: "pos",
                title: "Transaksi cepat",
                text: "Cari barang, atur jumlah, simpan, lalu cetak struk tanpa muter terlalu jauh.",
              },
              {
                icon: "box",
                title: "Stok lebih kebaca",
                text: "Barang menipis, stok masuk, dan daftar produk aktif tetap gampang dipantau.",
              },
              {
                icon: "chart",
                title: "Angka lebih jelas",
                text: "Omzet, profit, kas harian, dan channel penjualan langsung terkumpul rapi.",
              },
              {
                icon: "wallet",
                title: "Saldo lebih tenang",
                text: "Dompet, transfer, dan transaksi digital punya catatan yang konsisten.",
              },
            ].map((item) => (
              <div key={item.title} className="border-t border-slate-200 pt-4">
                <div className="brand-badge">
                  <AppIcon name={item.icon} className="h-3.5 w-3.5" />
                  {item.title}
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-700">{item.text}</p>
              </div>
            ))}
          </div>
        </Panel>

        <div className="flex min-w-0 items-center justify-center">
          <Panel className="w-full max-w-[480px] p-6 sm:p-8">
            <div className="mb-8 text-center">
              <div className="mx-auto inline-flex rounded-lg border border-[var(--brand-gold)]/18 bg-[var(--brand-gold)]/8 p-4">
                <BrandMark size="lg" className="h-16 w-16" />
              </div>
              <p className="mt-5 brand-kicker text-[var(--brand-gold)]/90">
                Login
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-950">
                Masuk ke POS Raja Aksesoris
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Login sebagai pemilik toko atau kasir untuk mulai bekerja.
              </p>
              <p className="mt-2 text-xs font-semibold text-slate-500">
                Akun: amri@raja.pos atau sriyati@raja.pos
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="brand-input"
                  placeholder="nama@rajaaksesoris.com"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="brand-input"
                  placeholder="Masukkan password"
                  required
                />
              </div>

              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting || authState !== "signed_out"}
                className="brand-button-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Memproses..." : "Masuk ke Sistem"}
              </button>
              <button
                type="button"
                className="w-full text-center text-xs font-semibold text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline"
                onClick={() => resetBrowserAppStateAndReload({ preserveAuth: false })}
              >
                Bersihkan sesi login
              </button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}

