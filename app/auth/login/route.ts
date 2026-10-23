import { NextResponse } from "next/server";
import { allowedEmail, isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// Starts Google sign-in. Done server-side so the PKCE verifier lands in a cookie.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  if (!isSupabaseConfigured) return NextResponse.redirect(`${origin}/login?error=not_configured`);

  const supabase = await createClient();
  const domain = allowedEmail.split("@")[1];

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      // "hd" only nudges Google's account picker to the right Workspace domain.
      // Access is enforced by the allow-list in the callback and proxy, not by this hint.
      queryParams: { prompt: "select_account", ...(domain ? { hd: domain } : {}) },
    },
  });

  if (error || !data.url) return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  return NextResponse.redirect(data.url);
}
