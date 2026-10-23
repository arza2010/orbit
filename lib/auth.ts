import "server-only";
import { redirect } from "next/navigation";
import { isAllowedEmail, isSupabaseConfigured } from "./supabase/env";
import { createClient } from "./supabase/server";

export type User = {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
};

const DEV_USER: User = { id: "local-dev", email: "local@dev", name: "Local dev", avatar: null };

/** The verified, allow-listed user, or null. Reads cookies, so call it behind <Suspense>. */
export async function getUser(): Promise<User | null> {
  if (!isSupabaseConfigured) return process.env.NODE_ENV === "production" ? null : DEV_USER;

  const supabase = await createClient(); // reads the cookies, then marks the clock reads as request-time
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims || !isAllowedEmail(claims.email)) return null;

  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: claims.sub,
    email: String(claims.email),
    name: typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null,
    avatar: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
  };
}

/**
 * Data-access guard. The proxy already blocks signed-out visitors; this re-checks close to the
 * data, so a routing mistake can never expose it.
 */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
