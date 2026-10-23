import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// POST only, so a stray link or prefetch can't sign you out.
export async function POST(request: Request) {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  // 303 turns the POST into a GET on /login.
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
