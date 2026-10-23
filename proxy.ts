import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail, isSupabaseConfigured } from "@/lib/supabase/env";
import { updateSession } from "@/lib/supabase/proxy";

// Everything except these needs a signed-in, allow-listed user.
// The cron route does its own secret check. The manifest, icons and service worker are fetched by the
// browser without your session cookie, so they must be reachable (they contain nothing private).
const PUBLIC_FILES = new Set(["/login", "/manifest.webmanifest", "/icon", "/apple-icon", "/sw.js"]);
// The Google callback has no session requirement of its own: it only acts on the encrypted, single-use
// flow cookie that /api/google/connect issued to a signed-in user (see the route).
const isPublic = (path: string) =>
  PUBLIC_FILES.has(path) || path.startsWith("/auth/") || path.startsWith("/api/cron/") || path === "/api/google/callback";

// Endpoints a person lands on by clicking a link. Signed out, they should be sent to the login page,
// not shown a raw JSON error.
const BROWSER_ROUTES = new Set(["/api/google/connect", "/api/wispr/connect", "/api/wispr/callback"]);

export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured) {
    // Until Supabase is set up, local development stays open. Production fails closed.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Authentication is not configured.", { status: 503 });
    }
    return NextResponse.next();
  }

  const { response, claims } = await updateSession(request);
  const path = request.nextUrl.pathname;
  const allowed = claims !== null && isAllowedEmail(claims.email);

  if (isPublic(path)) {
    if (allowed && path === "/login") return redirectTo(request, "/", response);
    return response;
  }

  if (!allowed) {
    if (path.startsWith("/api/") && !BROWSER_ROUTES.has(path)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return redirectTo(request, "/login", response);
  }

  return response;
}

function redirectTo(request: NextRequest, pathname: string, from: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  // Keep any session cookies the refresh just wrote.
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
