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
          return { data: null, error: new Error("Supabase belum dikonfigurasi.") };
        },
        async signOut() {
          return { error: null };
        },
      },
      from() {
        throw new Error("Supabase belum dikonfigurasi.");
      },
    };
