import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import BrandMark from "../components/BrandMark";

export default function Login() {
  const { user, login, authMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      navigate(user.role === "pemilik" ? "/dashboard" : "/kasir", { replace: true });
    }
  }, [navigate, user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const loggedInUser = await login(email, password);
      const fallback = loggedInUser.role === "pemilik" ? "/dashboard" : "/kasir";
      navigate(location.state?.from?.pathname || fallback, { replace: true });
    } catch (err) {
      setError(err.message || "Gagal login.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_42%,#e2e8f0_100%)] px-4 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-2xl lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden bg-[#1e3a5f] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <BrandMark size="xl" className="mb-6 drop-shadow-[0_12px_30px_rgba(15,23,42,0.35)]" />
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-sky-100">
              Raja Aksesoris
            </p>
            <h1 className="mt-4 max-w-md text-4xl font-black leading-tight">
              POS cepat untuk counter HP, aksesoris, dan transaksi digital.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-7 text-slate-200">
              Dibuat mobile-first untuk dipakai kasir harian, tapi tetap punya dashboard yang
              nyaman buat pemilik toko.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              "Transaksi aksesoris dengan pengurangan stok otomatis",
              "Pencatatan pulsa, kuota, voucher, dan token",
              "Cetak struk thermal 58mm langsung dari browser",
              "Filter laporan dan export CSV untuk rekap toko",
            ].map((item) => (
              <div key={item} className="rounded-3xl border border-white/15 bg-white/10 p-4 text-sm">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <BrandMark size="lg" className="mb-4 lg:hidden" />
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                Masuk Sistem
              </p>
              <h2 className="mt-3 text-3xl font-bold text-slate-900">Selamat datang kembali</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Gunakan akun Supabase Anda. Jika env belum diisi, halaman ini tetap bisa dicoba
                dalam mode demo.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
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
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                  placeholder="Masukkan password"
                  required
                />
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-[#1e3a5f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#23466f] disabled:opacity-70"
              >
                {submitting ? "Memproses..." : "Masuk"}
              </button>
            </form>

            <div className="mt-6 rounded-3xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">Mode saat ini: {authMode}</p>
              <p className="mt-2">
                Demo login:
                {" "}
                <span className="font-medium">owner@raja.test</span>
                {" / "}
                <span className="font-medium">kasir@raja.test</span>
                {" "}
                dengan password
                {" "}
                <span className="font-medium">demo123</span>.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
