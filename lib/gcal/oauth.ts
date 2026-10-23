import "server-only";
import { createHash, randomBytes } from "node:crypto";

// Google OAuth 2.0 (authorization code + PKCE) for the Calendar API. Orbit asks for offline access so
// it can sync in the background, and for the one scope that lets it create its own calendar and read
// the others. Google refresh tokens do not rotate, so a refresh is simply "ask again".

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export class GoogleOAuthError extends Error {
  status?: number;
  /** Google's error code, e.g. "invalid_grant" when the refresh token was revoked or expired. */
  code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // epoch ms
  scope: string | null;
};

export const googleClient = () => {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new GoogleOAuthError("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set");
  return { id, secret };
};

export const isGoogleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const redirectUri = (origin: string) => `${origin}/api/google/callback`;

export function newPkce() {
  const verifier = randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: randomBytes(16).toString("base64url"),
  };
}

export function buildAuthorizeUrl(args: { origin: string; state: string; challenge: string; loginHint?: string; clientId?: string }): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: args.clientId ?? googleClient().id,
    redirect_uri: redirectUri(args.origin),
    scope: CALENDAR_SCOPE,
    state: args.state,
    code_challenge: args.challenge,
    code_challenge_method: "S256",
    access_type: "offline", // gives a refresh token
    prompt: "consent", // without this Google only returns the refresh token the first time ever
    include_granted_scopes: "true",
    ...(args.loginHint ? { login_hint: args.loginHint } : {}),
  }).toString();
  return url.toString();
}

const redact = (s: string) => s.replace(/(access_token|refresh_token|code|code_verifier|client_secret)=[^&\s"']+/gi, "$1=…");

async function tokenRequest(params: Record<string, string>, now: number, tokenUrl = TOKEN_URL): Promise<GoogleTokens> {
  const { id, secret } = googleClient();
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...params }).toString(),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new GoogleOAuthError(redact(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}`), res.status, body.error);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: now + (body.expires_in ?? 3600) * 1000,
    scope: body.scope ?? null,
  };
}

export const exchangeCode = (a: { code: string; verifier: string; origin: string }, now = Date.now()) =>
  tokenRequest({ grant_type: "authorization_code", code: a.code, redirect_uri: redirectUri(a.origin), code_verifier: a.verifier }, now);

export const refreshAccessToken = (refreshToken: string, now = Date.now()) =>
  tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, now);

/** Best effort: tells Google to forget the grant. Never throws. */
export async function revoke(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
      cache: "no-store",
    });
  } catch {
    /* the local connection is removed either way */
  }
}
