import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { finishFlow } from "@/lib/wispr/flow";
import { saveNewConnection } from "@/lib/wispr/service";

const OAUTH_COOKIE = "wispr_oauth";

// Wispr sends the browser back here with a one-time code. finishFlow() checks it is the flow we
// started (state + PKCE secret from the cookie); only then are the tokens stored, encrypted.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const to = (flag: string) => NextResponse.redirect(`${origin}/notes?wispr=${flag}`);

  const user = await getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const store = await cookies();
  const cookie = store.get(OAUTH_COOKIE)?.value;
  store.delete({ name: OAUTH_COOKIE, path: "/api/wispr" }); // single use, whatever happens next

  try {
    const result = await finishFlow({ cookie, query: url.searchParams, origin });
    if (!result.ok) return to(result.reason === "denied" ? "denied" : "error");
    await saveNewConnection(user.id, result.clientId, result.tokens);
    return to("connected");
  } catch (err) {
    console.error("wispr callback failed", err instanceof Error ? err.message : err);
    return to("error");
  }
}
