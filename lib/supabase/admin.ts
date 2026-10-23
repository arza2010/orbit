import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

/**
 * A client that bypasses row-level security. It exists only for the scheduler, which runs with nobody
 * signed in. Every query made with it MUST filter by user_id explicitly: the database will not do it.
 * The key lives only in the server environment and must never be prefixed NEXT_PUBLIC_.
 */
export function createAdminClient(url: string | undefined = supabaseUrl, key: string | undefined = process.env.SUPABASE_SERVICE_ROLE_KEY): SupabaseClient {
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
