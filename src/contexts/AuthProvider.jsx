import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase, supabaseEnabled } from "../lib/supabase";
import { toClientMessage } from "../utils/clientMessages";
import { hashSecret } from "../utils/security";
import { AuthContext } from "./auth-context";
import { AUTH_STATUS } from "./auth-status";

const SESSION_TIMEOUT_MS = 6_000;
const LOGIN_TIMEOUT_MS = 8_000;
const PROFILE_TIMEOUT_MS = 8_000;
const VALID_ROLES = new Set(["pemilik", "kasir"]);
const AUTH_SNAPSHOT_KEY = "__RAJA_AKSESORIS_AUTH_SNAPSHOT__";
const AUTH_USER_CACHE_KEY = "raja_pos_last_auth_user";

function readCachedUser() {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage?.getItem(AUTH_USER_CACHE_KEY);
    if (!rawValue) return null;

    const cachedUser = JSON.parse(rawValue);
    const role = normalizeRole(cachedUser?.role);
    if (!cachedUser?.id || !role) return null;

    return {
      id: String(cachedUser.id),
      email: String(cachedUser.email || ""),
      name: String(cachedUser.name || cachedUser.email || "Pengguna"),
      role,
      profile: cachedUser.profile || { id: cachedUser.id, role },
      pinHash: null,
      recheckingSession: true,
    };
  } catch {
    return null;
  }
}

function writeCachedUser(nextUser) {
  if (typeof window === "undefined") return;

  try {
    if (!nextUser?.id) {
      window.localStorage?.removeItem(AUTH_USER_CACHE_KEY);
      return;
    }

    window.localStorage?.setItem(
      AUTH_USER_CACHE_KEY,
      JSON.stringify({
        id: nextUser.id,
        email: nextUser.email || "",
        name: nextUser.name || nextUser.email || "Pengguna",
        role: nextUser.role,
        profile: {
          id: nextUser.profile?.id || nextUser.id,
          email: nextUser.profile?.email || nextUser.email || "",
          nama: nextUser.profile?.nama || nextUser.name || "",
          role: nextUser.role,
        },
      })
    );
  } catch {
    // Auth cache is an optimization only; Supabase remains the source of truth.
  }
}

function getAuthSnapshotStore() {
  if (typeof globalThis === "undefined") {
    return {
      authState: AUTH_STATUS.CHECKING_SESSION,
      user: null,
      profileError: "",
      session: null,
    };
  }

  globalThis[AUTH_SNAPSHOT_KEY] ||= {
    authState: AUTH_STATUS.CHECKING_SESSION,
    user: null,
    profileError: "",
    session: null,
  };

  return globalThis[AUTH_SNAPSHOT_KEY];
}

function getInitialAuthSnapshot() {
  const snapshot = getAuthSnapshotStore();
  const hasAuthenticatedUser =
    snapshot.authState === AUTH_STATUS.AUTHENTICATED && snapshot.user?.id;

  if (hasAuthenticatedUser) {
    return snapshot;
  }

  const cachedUser = readCachedUser();
  if (cachedUser) {
    return {
      authState: AUTH_STATUS.AUTHENTICATED,
      user: cachedUser,
      profileError: "",
      session: snapshot.session || null,
    };
  }

  return {
    authState: AUTH_STATUS.CHECKING_SESSION,
    user: null,
    profileError: "",
    session: snapshot.session || null,
  };
}

function updateAuthSnapshot(patch) {
  Object.assign(getAuthSnapshotStore(), patch);
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}

function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return VALID_ROLES.has(normalized) ? normalized : "";
}

function getUserName(profile, fallbackEmail = "") {
  return String(profile?.nama || profile?.name || profile?.email || fallbackEmail || "Pengguna").trim();
}

function toReadableError(error, fallback) {
  const message = error?.message || error?.error_description || "";
  const lowered = message.toLowerCase();

  if (lowered.includes("invalid login") || lowered.includes("invalid credentials")) {
    return "Email atau password tidak sesuai.";
  }

  if (lowered.includes("email not confirmed")) {
    return "Email belum dikonfirmasi.";
  }

  if (lowered.includes("too many requests")) {
    return "Terlalu banyak percobaan login. Tunggu sebentar lalu coba lagi.";
  }

  return toClientMessage(message, fallback);
}

function isMissingVerifyPinRpc(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST202" ||
    error?.code === "42883" ||
    message.includes("could not find the function")
  );
}

function buildUser(session, profile) {
  const role = normalizeRole(profile?.role);

  if (!role) {
    throw new Error("Role akun tidak valid. Gunakan role pemilik atau kasir.");
  }

  return {
    id: session.user.id,
    email: profile?.email || session.user.email || "",
    name: getUserName(profile, session.user.email),
    role,
    profile,
    pinHash: profile?.pin_hash || null,
  };
}

function AuthProvider({ children }) {
  const initialSnapshotRef = useRef(null);
  if (!initialSnapshotRef.current) {
    initialSnapshotRef.current = getInitialAuthSnapshot();
  }

  const [authState, setAuthState] = useState(initialSnapshotRef.current.authState);
  const [user, setUserState] = useState(initialSnapshotRef.current.user);
  const [profileError, setProfileErrorState] = useState(initialSnapshotRef.current.profileError);
  const sessionRef = useRef(initialSnapshotRef.current.session);
  const authStateRef = useRef(initialSnapshotRef.current.authState);
  const userRef = useRef(initialSnapshotRef.current.user);

  const setState = useCallback((nextState) => {
    const previousState = authStateRef.current;
    authStateRef.current = nextState;
    updateAuthSnapshot({ authState: nextState });
    if (previousState !== nextState && import.meta.env.DEV) {
      console.info("Auth transition", { from: previousState, to: nextState });
    }
    setAuthState(nextState);
  }, []);

  const commitUser = useCallback((nextUser) => {
    userRef.current = nextUser;
    updateAuthSnapshot({ user: nextUser });
    writeCachedUser(nextUser);
    setUserState(nextUser);
  }, []);

  const commitProfileError = useCallback((nextError) => {
    const safeError = nextError || "";
    updateAuthSnapshot({ profileError: safeError });
    setProfileErrorState(safeError);
  }, []);

  const goSignedOut = useCallback(() => {
    sessionRef.current = null;
    updateAuthSnapshot({ session: null });
    commitUser(null);
    commitProfileError("");
    setState(AUTH_STATUS.SIGNED_OUT);
  }, [commitProfileError, commitUser, setState]);

  const verifySession = useCallback(
    async (session, { keepExistingUser = false } = {}) => {
      const userId = session?.user?.id;

      if (!userId || !session?.access_token) {
        goSignedOut();
        return null;
      }

      sessionRef.current = session;
      updateAuthSnapshot({ session });
      commitProfileError("");
      if (!keepExistingUser) {
        commitUser(null);
        setState(AUTH_STATUS.VERIFYING_PROFILE);
      }

      try {
        const { data: profile, error } = await withTimeout(
          supabase
            .from("users")
            .select("*")
            .eq("id", userId)
            .maybeSingle(),
          PROFILE_TIMEOUT_MS,
          "Verifikasi profil pengguna terlalu lama. Coba lagi atau logout."
        );

        if (error) {
          throw error;
        }

        if (!profile) {
          throw new Error("Profil pengguna tidak ditemukan di tabel users.");
        }

        const nextUser = buildUser(session, profile);
        commitUser(nextUser);
        commitProfileError("");
        setState(AUTH_STATUS.AUTHENTICATED);
        return nextUser;
      } catch (error) {
        const message = toReadableError(error, "Gagal memverifikasi profil pengguna.");
        console.warn("Gagal memverifikasi profil pengguna:", error);
        commitUser(null);
        commitProfileError(message);
        setState(AUTH_STATUS.PROFILE_ERROR);
        return null;
      }
    },
    [commitProfileError, commitUser, goSignedOut, setState]
  );

  useEffect(() => {
    let alive = true;

    async function boot() {
      if (!supabaseEnabled) {
        if (alive) goSignedOut();
        return;
      }

      const cachedUser = userRef.current;
      const cachedAuthState = authStateRef.current;
      const hasUsableCachedAuth =
        cachedAuthState === AUTH_STATUS.AUTHENTICATED && cachedUser?.id;

      if (!hasUsableCachedAuth) {
        setState(AUTH_STATUS.CHECKING_SESSION);
      }

      try {
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          SESSION_TIMEOUT_MS,
          "Memuat sesi terlalu lama."
        );

        if (error) {
          throw error;
        }

        const session = data?.session || null;

        if (!alive) return;

        if (!session) {
          goSignedOut();
          return;
        }

        if (hasUsableCachedAuth && cachedUser.id === session.user?.id) {
          sessionRef.current = session;
          updateAuthSnapshot({ session });
          setState(AUTH_STATUS.AUTHENTICATED);
          void verifySession(session, { keepExistingUser: true });
          return;
        }

        await verifySession(session);
      } catch (error) {
        if (!alive) return;

        console.warn("Gagal memuat sesi login:", error);
        commitUser(null);
        commitProfileError(toReadableError(error, "Gagal memuat sesi login."));
        setState(AUTH_STATUS.PROFILE_ERROR);
      }
    }

    void boot();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        goSignedOut();
        return;
      }

      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        sessionRef.current = session || sessionRef.current;
        updateAuthSnapshot({ session: sessionRef.current });
      }
    });

    return () => {
      alive = false;
      data?.subscription?.unsubscribe?.();
    };
  }, [commitProfileError, commitUser, goSignedOut, setState, verifySession]);

  const login = useCallback(
    async (email, password) => {
      const normalizedEmail = String(email || "").trim().toLowerCase();

      if (!normalizedEmail || !password) {
        throw new Error("Email dan password wajib diisi.");
      }

      commitProfileError("");

      try {
        const { data, error } = await withTimeout(
          supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          }),
          LOGIN_TIMEOUT_MS,
          "Login terlalu lama. Periksa koneksi internet lalu coba lagi."
        );

        if (error) {
          throw error;
        }

        const session = data?.session || null;

        if (!session) {
          throw new Error("Login berhasil, tetapi sesi tidak tersedia.");
        }

        return verifySession(session);
      } catch (error) {
        const message = toReadableError(error, "Gagal login.");
        goSignedOut();
        throw new Error(message);
      }
    },
    [commitProfileError, goSignedOut, verifySession]
  );

  const logout = useCallback(async () => {
    goSignedOut();

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.warn("Gagal logout dari Supabase", error);
      }
    } catch (error) {
      console.warn("Gagal logout dari Supabase", error);
    }
  }, [goSignedOut]);

  const retryProfileVerification = useCallback(async () => {
    let session = sessionRef.current;

    if (!session) {
      const { data, error } = await withTimeout(
        supabase.auth.getSession(),
        SESSION_TIMEOUT_MS,
        "Memuat sesi terlalu lama."
      );

      if (error) {
        commitProfileError(toReadableError(error, "Gagal memuat sesi login."));
        setState(AUTH_STATUS.PROFILE_ERROR);
        return null;
      }

      session = data?.session || null;
    }

    if (!session) {
      goSignedOut();
      return null;
    }

    return verifySession(session);
  }, [commitProfileError, goSignedOut, setState, verifySession]);

  const verifyPin = useCallback(
    async (pin) => {
      const safePin = String(pin || "").trim();
      if (!/^[0-9]{4,8}$/.test(safePin)) {
        throw new Error("PIN harus berisi 4 sampai 8 digit angka.");
      }

      if (supabaseEnabled) {
        const { data, error } = await supabase.rpc("verify_user_pin", {
          p_pin: safePin,
        });

        if (!error) {
          return Boolean(data);
        }

        if (!isMissingVerifyPinRpc(error)) {
          throw new Error(toReadableError(error, "Gagal memverifikasi PIN."));
        }
      }

      const storedHash = user?.pinHash || user?.profile?.pin_hash;
      if (!storedHash) {
        throw new Error("PIN kasir belum disiapkan.");
      }

      return (await hashSecret(safePin)) === storedHash;
    },
    [user]
  );

  const value = useMemo(
    () => ({
      user,
      authState,
      status: authState,
      loading: authState === AUTH_STATUS.CHECKING_SESSION && !user,
      profileLoading: authState === AUTH_STATUS.VERIFYING_PROFILE && !user,
      authReady: authState !== AUTH_STATUS.CHECKING_SESSION,
      profileError,
      login,
      logout,
      retryProfileVerification,
      verifyPin,
    }),
    [authState, login, logout, profileError, retryProfileVerification, user, verifyPin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { AuthProvider };
