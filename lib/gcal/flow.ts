import "server-only";
import { timingSafeEqual } from "node:crypto";
import { decrypt, encrypt } from "@/lib/crypto";
import { buildAuthorizeUrl, exchangeCode, newPkce, redirectUri, type GoogleTokens } from "./oauth";

// Same shape as the Wispr flow: startFlow() builds the redirect plus an encrypted, short-lived cookie
// value holding the PKCE secret; finishFlow() checks everything that comes back before exchanging the code.
// The cookie also records WHICH signed-in user started the flow. Only this server can mint it (it is
// encrypted and authenticated), so the callback can trust it even if the browser's sign-in cookie did not
// make the round trip to Google and back.

export const FLOW_TTL_MS = 10 * 60_000;

type FlowCookie = { state: string; verifier: string; redirectUri: string; uid: string; exp: number };

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function startFlow(args: { origin: string; userId: string; loginHint?: string; now?: number; key?: string; clientId?: string }): { authorizeUrl: string; cookie: string } {
  const pkce = newPkce();
  const data: FlowCookie = { state: pkce.state, verifier: pkce.verifier, redirectUri: redirectUri(args.origin), uid: args.userId, exp: (args.now ?? Date.now()) + FLOW_TTL_MS };
  return {
    authorizeUrl: buildAuthorizeUrl({ origin: args.origin, state: pkce.state, challenge: pkce.challenge, loginHint: args.loginHint, clientId: args.clientId }),
    cookie: encrypt(JSON.stringify(data), args.key),
  };
}

export type FinishResult =
  | { ok: true; tokens: GoogleTokens; userId: string }
  | { ok: false; reason: "denied" | "invalid" | "expired" | "no_refresh" };

export async function finishFlow(args: {
  cookie: string | undefined;
  query: URLSearchParams;
  origin: string;
  now?: number;
  key?: string;
  exchange?: typeof exchangeCode;
}): Promise<FinishResult> {
  const now = args.now ?? Date.now();
  if (args.query.get("error")) return { ok: false, reason: "denied" };

  const code = args.query.get("code");
  const state = args.query.get("state");
  if (!args.cookie || !code || !state) return { ok: false, reason: "invalid" };

  let saved: FlowCookie;
  try {
    saved = JSON.parse(decrypt(args.cookie, args.key)) as FlowCookie;
  } catch {
    return { ok: false, reason: "invalid" }; // tampered, forged, or encrypted with another key
  }
  if (typeof saved.state !== "string" || typeof saved.verifier !== "string" || typeof saved.uid !== "string" || !saved.uid) return { ok: false, reason: "invalid" };
  if (now > saved.exp) return { ok: false, reason: "expired" };
  if (!same(saved.state, state)) return { ok: false, reason: "invalid" }; // not the flow we started
  if (saved.redirectUri !== redirectUri(args.origin)) return { ok: false, reason: "invalid" };

  const tokens = await (args.exchange ?? exchangeCode)({ code, verifier: saved.verifier, origin: args.origin }, now);
  // Background sync needs the refresh token. Google omits it if the grant already existed and prompt=consent was ignored.
  if (!tokens.refreshToken) return { ok: false, reason: "no_refresh" };
  return { ok: true, tokens, userId: saved.uid };
}
