import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseKey, supabaseUrl } from "./env";

/**
 * Refreshes the Supabase session cookies for this request and returns the verified
 * JWT claims (or null when signed out). Must run in the proxy so refreshed tokens
 * reach both the server render and the browser.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl as string, supabaseKey as string, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims() verifies the JWT signature, unlike reading the session straight from the cookie.
  const { data } = await supabase.auth.getClaims();
  return { response, claims: data?.claims ?? null };
}
