import { useEffect, useState } from "react";
import { LockKeyhole, LogIn, Mail, RefreshCcw, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import BrandMark from "../components/BrandMark";
import LoadingState from "../components/LoadingState";
import Panel from "../components/app/Panel";
import { useAuth } from "../contexts/useAuth";
import { getDefaultRoute } from "../core/navigation/navigation";
import { resetBrowserAppStateAndReload } from "../utils/browserRecovery";

const OPERATIONAL_POINTS = [
  ["Kasir", "Transaksi cepat"],
  ["Stok", "Inventory aktif"],
  ["Saldo", "Kas & dompet"],
  ["Digital", "Layanan harian"],
];

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
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-4 py-8">
        <Panel className="w-full max-w-[440px] p-7 text-center shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
          <div className="mx-auto inline-flex rounded-lg border border-red-200 bg-red-50 p-3">
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
    <div className="login-os-shell min-h-screen overflow-hidden text-slate-950">
      <main className="login-os-main relative z-10">
        <section className="login-os-console" aria-label="Login POS Raja Aksesoris">
          <div className="login-os-brand-panel">
            <div className="login-brand-mark flex items-center justify-center bg-white">
              <BrandMark size="xl" className="h-[96px] w-[96px]" />
            </div>

            <h1 className="mt-7 font-display text-[38px] font-black leading-[1.02] text-slate-950">
              Raja Aksesoris
            </h1>
            <p className="login-brand-system mt-2 text-sm font-black uppercase tracking-[0.14em] text-[var(--brand-gold-strong)]">
              Retail Operating System
            </p>
            <p className="login-brand-subtitle mt-5 max-w-[320px] text-[15px] font-medium leading-7 text-slate-600">
              Kelola kasir, stok, saldo, dan layanan digital dalam satu sistem.
            </p>

            <div className="login-operation-grid" aria-label="Area operasional">
              {OPERATIONAL_POINTS.map(([label, value]) => (
                <div key={label} className="login-operation-item">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            <p className="login-os-footnote">Retail Operations Platform</p>
          </div>

          <div className="login-os-form-panel">
            <form onSubmit={handleSubmit} className="login-os-form">
              <div className="mb-7 flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-[30px] font-black leading-tight text-slate-950">
                    Masuk ke POS
                  </h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                    Akses aman untuk operasional toko hari ini.
                  </p>
                </div>
                <span className="login-security-mark">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                    Email
                  </label>
                  <div className="login-input-wrap">
                    <Mail className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="login-input brand-login-input"
                      placeholder="nama@rajaaksesoris.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                    Password
                  </label>
                  <div className="login-input-wrap">
                    <LockKeyhole className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="login-input brand-login-input"
                      placeholder="Masukkan password"
                      autoComplete="current-password"
                      required
                    />
                  </div>
                </div>

                {error ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting || authState !== "signed_out"}
                  className="login-primary-button mt-2 w-full disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  {submitting ? "Memproses..." : "Masuk ke POS"}
                </button>
              </div>

              <button
                type="button"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 text-xs font-bold text-slate-400 transition hover:text-slate-700"
                onClick={() => resetBrowserAppStateAndReload({ preserveAuth: false })}
              >
                <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Bersihkan sesi login
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}

