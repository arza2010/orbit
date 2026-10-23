// Reference the NEXT_PUBLIC_ vars literally so Next can inline them for the browser bundle.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

/** The only Google account allowed in. Empty means nobody is (fail closed). */
export const allowedEmail = (process.env.ALLOWED_EMAIL ?? "").trim().toLowerCase();

export function isAllowedEmail(email: unknown): boolean {
  return typeof email === "string" && allowedEmail !== "" && email.toLowerCase() === allowedEmail;
}
