import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase, supabaseEnabled } from "../lib/supabase";

const AuthContext = createContext(null);

const DEMO_USERS = {
  "owner@raja.test": {
    id: "demo-owner",
    nama: "Pemilik Raja Aksesoris",
    role: "pemilik",
    email: "owner@raja.test",
  },
  "kasir@raja.test": {
    id: "demo-kasir",
    nama: "Kasir Raja Aksesoris",
    role: "kasir",
    email: "kasir@raja.test",
  },
};

async function fetchProfile(userId) {
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const authMode = supabaseEnabled ? "supabase" : "demo";

  useEffect(() => {
    let alive = true;

    async function init() {
      try {
        if (supabaseEnabled) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.user && alive) {
            const profile = await fetchProfile(session.user.id);
            if (alive) {
              setUser({
                id: session.user.id,
                email: session.user.email,
                nama: profile.nama,
                role: profile.role,
              });
            }
          }
        } else {
          const raw = localStorage.getItem("raja-auth-demo");
          if (raw && alive) setUser(JSON.parse(raw));
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    init();

    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    if (supabaseEnabled) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const profile = await fetchProfile(data.user.id);
      const nextUser = {
        id: data.user.id,
        email: data.user.email,
        nama: profile.nama,
        role: profile.role,
      };
      setUser(nextUser);
      return nextUser;
    }

    const demoUser = DEMO_USERS[email.trim().toLowerCase()];
    if (!demoUser || password !== "demo123") {
      throw new Error("Email atau password tidak valid.");
    }
    localStorage.setItem("raja-auth-demo", JSON.stringify(demoUser));
    setUser(demoUser);
    return demoUser;
  }, []);

  const logout = useCallback(async () => {
    if (supabaseEnabled) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem("raja-auth-demo");
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, authMode, login, logout }),
    [authMode, loading, login, logout, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth harus dipakai di dalam AuthProvider.");
  return context;
}
