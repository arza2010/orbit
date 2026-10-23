import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { startFlow } from "@/lib/gcal/flow";
import { isGoogleConfigured } from "@/lib/gcal/oauth";

const OAUTH_COOKIE = "google_oauth";

// Starts connecting Google Calendar: remembers the PKCE secret in a short-lived encrypted cookie
// (never in the URL) and sends the browser to Google's consent screen.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const user = await getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);
  if (!isGoogleConfigured()) return NextResponse.redirect(`${origin}/calendar?google=unconfigured`);

  try {
    const { authorizeUrl, cookie } = startFlow({ origin, userId: user.id, loginHint: user.email });
    (await cookies()).set(OAUTH_COOKIE, cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/api/google",
      maxAge: 600,
    });
    return NextResponse.redirect(authorizeUrl);
  } catch (err) {
    console.error("google connect failed", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${origin}/calendar?google=error`);
  }
}
