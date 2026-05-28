import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = supabaseEnabled
  ? createClient(supabaseUrl, supabaseAnonKey)
  : {
      auth: {
        async getSession() {
          return { data: { session: null }, error: null };
        },
        async signInWithPassword() {
          return { data: null, error: new Error("Aplikasi belum terhubung ke data toko.") };
        },
        async signOut() {
          return { error: null };
        },
        onAuthStateChange() {
          return {
            data: {
              subscription: {
                unsubscribe() {},
              },
            },
          };
        },
      },
      from() {
        throw new Error("Aplikasi belum terhubung ke data toko.");
      },
    };
