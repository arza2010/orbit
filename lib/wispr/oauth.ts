import "server-only";
import { createHash, randomBytes } from "node:crypto";

// OAuth 2.1 + PKCE for Wispr Flow's MCP server, following the standard MCP flow:
// discover the auth server, register this app, send the user to approve, exchange the code.

export const WISPR_MCP_URL = process.env.WISPR_MCP_URL || "https://api.wisprflow.ai/connect/mcp";
export const SCOPE = "openid offline_access";

export class OAuthError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export type AuthServerMeta = {
  resource: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
};

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // epoch ms
  scope: string | null;
};

const redact = (s: string) => s.replace(/(access_token|refresh_token|code|code_verifier|client_secret)=[^&\s"']+/gi, "$1=…");

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return null;
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Finds the authorization server for an MCP URL (RFC 9728, then RFC 8414). */
export async function discover(mcpUrl: string = WISPR_MCP_URL): Promise<AuthServerMeta> {
  const u = new URL(mcpUrl);
  const protectedResource =
    (await getJson(`${u.origin}/.well-known/oauth-protected-resource${u.pathname === "/" ? "" : u.pathname}`)) ??
    (await getJson(`${u.origin}/.well-known/oauth-protected-resource`));
  const issuer = (protectedResource?.authorization_servers as string[] | undefined)?.[0];
  if (!issuer) throw new OAuthError("Wispr's sign-in server could not be found");

  const base = issuer.replace(/\/$/, "");
  const meta =
    (await getJson(`${base}/.well-known/oauth-authorization-server`)) ??
    (await getJson(`${base}/.well-known/openid-configuration`));
  const authorizationEndpoint = meta?.authorization_endpoint as string | undefined;
  const tokenEndpoint = meta?.token_endpoint as string | undefined;
  const registrationEndpoint = meta?.registration_endpoint as string | undefined;
  if (!authorizationEndpoint || !tokenEndpoint) throw new OAuthError("Wispr's sign-in server is missing endpoints");
  if (!registrationEndpoint) throw new OAuthError("Wispr's sign-in server does not allow automatic app registration");

  return {
    resource: (protectedResource?.resource as string | undefined) ?? mcpUrl,
    authorizationEndpoint,
    tokenEndpoint,
    registrationEndpoint,
  };
}

/** Registers this app as a public client (no secret) for one redirect URI. */
export async function registerClient(meta: AuthServerMeta, redirectUri: string): Promise<string> {
  const res = await fetch(meta.registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "Orbit (personal dashboard)",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SCOPE,
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { client_id?: string; error_description?: string; error?: string };
  if (!res.ok || !body.client_id) {
    throw new OAuthError(`Wispr refused to register the app: ${body.error_description ?? body.error ?? res.status}`, res.status);
  }
  return body.client_id;
}

export function newPkce(): { verifier: string; challenge: string; state: string } {
  const verifier = randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: randomBytes(16).toString("base64url"),
  };
}

export function buildAuthorizeUrl(args: {
  meta: AuthServerMeta;
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const url = new URL(args.meta.authorizationEndpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    scope: SCOPE,
    state: args.state,
    code_challenge: args.challenge,
    code_challenge_method: "S256",
    resource: args.meta.resource,
  }).toString();
  return url.toString();
}

async function tokenRequest(tokenEndpoint: string, params: Record<string, string>, now: number): Promise<TokenSet> {
  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(params).toString(),
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
    throw new OAuthError(redact(`Wispr sign-in failed: ${body.error_description ?? body.error ?? res.status}`), res.status);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: now + (body.expires_in ?? 3600) * 1000,
    scope: body.scope ?? null,
  };
}

export const exchangeCode = (
  a: { meta: AuthServerMeta; clientId: string; redirectUri: string; code: string; verifier: string },
  now = Date.now(),
) =>
  tokenRequest(
    a.meta.tokenEndpoint,
    {
      grant_type: "authorization_code",
      code: a.code,
      redirect_uri: a.redirectUri,
      client_id: a.clientId,
      code_verifier: a.verifier,
      resource: a.meta.resource,
    },
    now,
  );

export const refreshTokens = (
  a: { meta: AuthServerMeta; clientId: string; refreshToken: string },
  now = Date.now(),
) =>
  tokenRequest(
    a.meta.tokenEndpoint,
    { grant_type: "refresh_token", refresh_token: a.refreshToken, client_id: a.clientId, resource: a.meta.resource },
    now,
  );
