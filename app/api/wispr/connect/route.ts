import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { startFlow } from "@/lib/wispr/flow";

const OAUTH_COOKIE = "wispr_oauth";

// Starts the Wispr connection: registers this app, remembers the PKCE secret in a short-lived
// encrypted cookie, and sends the browser to Wispr to approve.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  if (!(await getUser())) return NextResponse.redirect(`${origin}/login`);

  try {
    const { authorizeUrl, cookie } = await startFlow({ origin });
    (await cookies()).set(OAUTH_COOKIE, cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/api/wispr",
      maxAge: 600,
    });
    return NextResponse.redirect(authorizeUrl);
  } catch (err) {
    console.error("wispr connect failed", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${origin}/notes?wispr=error`);
  }
}
