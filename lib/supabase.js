import "server-only";
import { createClient } from "@supabase/supabase-js";

let client;

export function getSupabase() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function requireSupabase() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Database is not configured");
  return supabase;
}
