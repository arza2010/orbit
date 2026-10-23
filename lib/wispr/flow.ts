import "server-only";
import { timingSafeEqual } from "node:crypto";
import { decrypt, encrypt } from "@/lib/crypto";
import {
  buildAuthorizeUrl,
  discover,
  exchangeCode,
  newPkce,
  registerClient,
  WISPR_MCP_URL,
  type TokenSet,
} from "./oauth";

// The two halves of connecting Wispr, kept free of cookies and HTTP so they can be tested hard.
// startFlow() prepares the redirect and an encrypted cookie value; finishFlow() checks everything
// that comes back before any code is exchanged.

export const FLOW_TTL_MS = 10 * 60_000;

type FlowCookie = { state: string; verifier: string; clientId: string; redirectUri: string; exp: number };

export const callbackUri = (origin: string) => `${origin}/api/wispr/callback`;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function startFlow(args: {
  origin: string;
  mcpUrl?: string;
  now?: number;
  key?: string;
}): Promise<{ authorizeUrl: string; cookie: string }> {
  const mcpUrl = args.mcpUrl ?? WISPR_MCP_URL;
  const redirectUri = callbackUri(args.origin);
  const meta = await discover(mcpUrl);
  const clientId = await registerClient(meta, redirectUri);
  const pkce = newPkce();

  const data: FlowCookie = { state: pkce.state, verifier: pkce.verifier, clientId, redirectUri, exp: (args.now ?? Date.now()) + FLOW_TTL_MS };
  return {
    authorizeUrl: buildAuthorizeUrl({ meta, clientId, redirectUri, state: pkce.state, challenge: pkce.challenge }),
    cookie: encrypt(JSON.stringify(data), args.key),
  };
}

export type FinishResult =
  | { ok: true; clientId: string; tokens: TokenSet }
  | { ok: false; reason: "denied" | "invalid" | "expired" };

export async function finishFlow(args: {
  cookie: string | undefined;
  query: URLSearchParams;
  origin: string;
  mcpUrl?: string;
  now?: number;
  key?: string;
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
  if (typeof saved.state !== "string" || typeof saved.verifier !== "string" || typeof saved.clientId !== "string") return { ok: false, reason: "invalid" };
  if (now > saved.exp) return { ok: false, reason: "expired" };
  if (!same(saved.state, state)) return { ok: false, reason: "invalid" }; // not the flow we started
  if (saved.redirectUri !== callbackUri(args.origin)) return { ok: false, reason: "invalid" };

  const meta = await discover(args.mcpUrl ?? WISPR_MCP_URL);
  const tokens = await exchangeCode({ meta, clientId: saved.clientId, redirectUri: saved.redirectUri, code, verifier: saved.verifier }, now);
  return { ok: true, clientId: saved.clientId, tokens };
}
