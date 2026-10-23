import "server-only";
import { createServerClient } from "@supabase/ssr";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { supabaseKey, supabaseUrl } from "./env";

/** A per-request Supabase client bound to the visitor's cookies. Never share one across requests. */
export async function createClient() {
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase is not configured");
  const store = await cookies(); // request data: always the first thing read

  // Building the client reads the clock (token expiry). With Cache Components that must be
  // marked as request-time work, and it has to come after the cookies are read, not before.
  await io();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
