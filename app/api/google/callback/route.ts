import { cookies } from "next/headers";
import { NextResponse, after } from "next/server";
import { getUser } from "@/lib/auth";
import { finishFlow } from "@/lib/gcal/flow";
import { accountOf, saveNewConnection, syncUser } from "@/lib/gcal/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const OAUTH_COOKIE = "google_oauth";

export const maxDuration = 60;

// Google sends the browser back here with a one-time code. This route is reachable without a session
// (see proxy.ts) because the proof of who is connecting is the encrypted flow cookie from /connect:
// finishFlow() checks it is the flow we started (state, PKCE secret, expiry, address) before anything
// is exchanged or stored, and tells us which user started it.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const to = (flag: string) => NextResponse.redirect(`${origin}/calendar?google=${flag}`);

  const store = await cookies();
  const cookie = store.get(OAUTH_COOKIE)?.value;
  store.delete({ name: OAUTH_COOKIE, path: "/api/google" }); // single use, whatever happens next

  try {
    const result = await finishFlow({ cookie, query: url.searchParams, origin });
    if (!result.ok) {
      console.warn("google callback rejected:", result.reason, "| cookie present:", !!cookie);
      if (result.reason === "invalid" && !cookie) return NextResponse.redirect(`${origin}/login`); // the flow cookie never came back
      return to(result.reason === "denied" ? "denied" : result.reason === "no_refresh" ? "norefresh" : "error");
    }

    // If a session is present it must be the same person who started the flow.
    const user = await getUser();
    if (user && user.id !== result.userId) {
      console.warn("google callback rejected: signed-in user differs from the one who started the flow");
      return to("error");
    }

    // The flow cookie already proved the user; the admin client avoids depending on the session cookie too.
    const db = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : await createClient();
    await saveNewConnection(db, result.userId, result.tokens, await accountOf(result.tokens.accessToken));

    // First fill of the Orbit calendar happens after the redirect, so connecting feels instant.
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      after(async () => {
        try {
          await syncUser(createAdminClient(), result.userId);
        } catch (err) {
          console.error("first google sync failed", err instanceof Error ? err.message.slice(0, 200) : err);
        }
      });
    }
    return to("connected");
  } catch (err) {
    console.error("google callback failed", err instanceof Error ? err.message : err);
    return to("error");
  }
}
