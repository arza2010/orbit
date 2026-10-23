import { NextResponse } from "next/server";
import { isAllowedEmail, isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// Only same-site relative paths, so this can't be turned into an open redirect.
const safeNext = (next: string | null) => (next && /^\/(?!\/)/.test(next) ? next : "/");

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { origin } = url;
  if (!isSupabaseConfigured) return NextResponse.redirect(`${origin}/login?error=not_configured`);

  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/login?error=auth_failed`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=auth_failed`);

  const { data } = await supabase.auth.getClaims();
  if (!isAllowedEmail(data?.claims?.email)) {
    // A valid Google account, but not the one this dashboard belongs to.
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=forbidden`);
  }

  return NextResponse.redirect(`${origin}${safeNext(url.searchParams.get("next"))}`);
}
