import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import BrandMark from "../components/BrandMark";
import Panel from "../components/app/Panel";
import { useAuth } from "../contexts/AuthContext";
import { getDefaultRoute } from "../config/navigation";

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
      navigate(getDefaultRoute(user.role), { replace: true });
    }
  }, [navigate, user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const loggedInUser = await login(email, password);
      navigate(location.state?.from?.pathname || getDefaultRoute(loggedInUser.role), {
        replace: true,
      });
    } catch (err) {
      setError(err.message || "Gagal login.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--brand-bg)] px-4 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <Panel variant="strong" className="brand-glow hidden overflow-hidden p-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex rounded-[28px] border border-[var(--brand-gold)]/16 bg-[var(--brand-gold)]/10 p-4">
              <BrandMark size="xl" className="h-24 w-24" />
            </div>
            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.36em] text-[var(--brand-gold)]/80">
              Raja Aksesoris
            </p>
            <h1 className="mt-4 max-w-xl font-display text-5xl font-bold tracking-tight text-slate-950">
              POS counter yang terasa seperti software premium.
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-8 text-slate-600">
              Dibuat untuk pulsa, paket data, top up game, aksesoris HP, dan operasional toko
              dengan alur cepat, visual elegan, dan fokus ke profit.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              "Alur kasir super cepat tanpa popup berlebihan",
              "Dashboard owner fokus ke omzet, profit, dan operasional",
              "Tracking stok, saldo, dan laporan dalam satu workspace",
              "Brand dark premium dengan aksen gold elegan",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-[var(--brand-gold)]/12 bg-[var(--brand-gold)]/8 px-4 py-4 text-sm leading-7 text-slate-600"
              >
                {item}
              </div>
            ))}
          </div>
        </Panel>

        <div className="flex items-center justify-center">
          <Panel className="w-full max-w-[480px] p-6 sm:p-8">
            <div className="mb-8 text-center">
              <div className="mx-auto inline-flex rounded-[28px] border border-[var(--brand-gold)]/18 bg-[var(--brand-gold)]/8 p-4">
                <BrandMark size="lg" className="h-16 w-16" />
              </div>
              <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.34em] text-[var(--brand-gold)]/80">
                Sign In
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-950">
                Masuk ke workspace toko
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Login sebagai owner atau kasir untuk mulai mengelola operasional Raja Aksesoris.
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
                <div className="rounded-2xl border border-[var(--brand-gold)]/24 bg-[var(--brand-gold)]/10 px-4 py-3 text-sm text-slate-700">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="brand-button-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Memproses..." : "Masuk ke Sistem"}
              </button>
            </form>

            <div className="mt-6 rounded-2xl border border-[var(--brand-gold)]/12 bg-[var(--brand-gold)]/8 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Mode aktif: {authMode}</p>
              <p className="mt-2 leading-7">
                Demo login:
                {" "}
                <span className="text-slate-700">owner@raja.test</span>
                {" / "}
                <span className="text-slate-700">kasir@raja.test</span>
                {" "}
                dengan password
                {" "}
                <span className="text-slate-700">demo123</span>.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
