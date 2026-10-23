import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { encrypt } from "../lib/crypto";
import { finishFlow, FLOW_TTL_MS, startFlow } from "../lib/gcal/flow";
import { buildAuthorizeUrl, CALENDAR_SCOPE, exchangeCode, redirectUri, type GoogleTokens } from "../lib/gcal/oauth";

const KEY = randomBytes(32).toString("base64");
const ORIGIN = "https://orbit.example.com";
process.env.GOOGLE_CLIENT_ID = "client-123.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "shh-secret";

const TOKENS: GoogleTokens = { accessToken: "at", refreshToken: "rt", expiresAt: 1, scope: CALENDAR_SCOPE };
const exchange = (async () => TOKENS) as typeof exchangeCode;

function begin(now = 1_000_000) {
  const { authorizeUrl, cookie } = startFlow({ origin: ORIGIN, userId: "user-1", loginHint: "me@school.example", now, key: KEY });
  const state = new URL(authorizeUrl).searchParams.get("state") as string;
  return { authorizeUrl, cookie, state, now };
}

describe("starting the Google Calendar connection", () => {
  it("asks for offline access with PKCE, the calendar scope, and a forced consent screen", () => {
    const u = new URL(begin().authorizeUrl);
    assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    const p = u.searchParams;
    assert.equal(p.get("response_type"), "code");
    assert.equal(p.get("client_id"), process.env.GOOGLE_CLIENT_ID);
    assert.equal(p.get("redirect_uri"), `${ORIGIN}/api/google/callback`);
    assert.equal(p.get("scope"), CALENDAR_SCOPE);
    assert.equal(p.get("access_type"), "offline");
    assert.equal(p.get("prompt"), "consent");
    assert.equal(p.get("code_challenge_method"), "S256");
    assert.ok((p.get("code_challenge") ?? "").length >= 43);
    assert.equal(p.get("login_hint"), "me@school.example");
    assert.ok(!u.search.includes("shh-secret"), "the client secret must never be in the browser URL");
  });

  it("never puts the PKCE verifier in the URL; it travels only in the encrypted cookie", () => {
    const { authorizeUrl, cookie } = begin();
    assert.ok(!authorizeUrl.includes("code_verifier"));
    assert.ok(!cookie.includes("code_verifier") && !cookie.includes("verifier"));
  });

  it("uses a fresh state and challenge every time", () => {
    const a = new URL(begin().authorizeUrl).searchParams;
    const b = new URL(begin().authorizeUrl).searchParams;
    assert.notEqual(a.get("state"), b.get("state"));
    assert.notEqual(a.get("code_challenge"), b.get("code_challenge"));
  });

  it("builds the redirect address from the origin it is served on", () => {
    assert.equal(redirectUri("http://localhost:3000"), "http://localhost:3000/api/google/callback");
    assert.ok(buildAuthorizeUrl({ origin: ORIGIN, state: "s", challenge: "c" }).includes("redirect_uri=https%3A%2F%2Forbit.example.com"));
  });
});

describe("finishing the connection", () => {
  const finish = (cookie: string | undefined, query: Record<string, string>, over: { now?: number; origin?: string } = {}) =>
    finishFlow({ cookie, query: new URLSearchParams(query), origin: over.origin ?? ORIGIN, now: over.now ?? 1_000_100, key: KEY, exchange });

  it("accepts the flow we started and returns the tokens", async () => {
    const f = begin();
    const r = await finish(f.cookie, { code: "abc", state: f.state });
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.tokens.refreshToken, "rt");
    assert.equal(r.ok && r.userId, "user-1", "the flow cookie says who started it");
  });

  it("passes the real verifier to Google (so a stolen code alone is useless)", async () => {
    const f = begin();
    let seen: { code: string; verifier: string; origin: string } | undefined;
    await finishFlow({
      cookie: f.cookie, query: new URLSearchParams({ code: "abc", state: f.state }), origin: ORIGIN, now: f.now + 5, key: KEY,
      exchange: (async (a: { code: string; verifier: string; origin: string }) => ((seen = a), TOKENS)) as typeof exchangeCode,
    });
    assert.equal(seen?.code, "abc");
    assert.ok((seen?.verifier ?? "").length >= 43);
    assert.equal(seen?.origin, ORIGIN);
  });

  it("refuses a callback with the wrong state", async () => {
    const f = begin();
    assert.deepEqual(await finish(f.cookie, { code: "abc", state: "forged" }), { ok: false, reason: "invalid" });
  });

  it("refuses a callback with no cookie, or a forged or foreign cookie", async () => {
    const f = begin();
    assert.deepEqual(await finish(undefined, { code: "abc", state: f.state }), { ok: false, reason: "invalid" });
    assert.deepEqual(await finish("garbage", { code: "abc", state: f.state }), { ok: false, reason: "invalid" });
    const other = encrypt(JSON.stringify({ state: f.state, verifier: "v", redirectUri: redirectUri(ORIGIN), uid: "attacker", exp: 9e12 }), randomBytes(32).toString("base64"));
    assert.deepEqual(await finish(other, { code: "abc", state: f.state }), { ok: false, reason: "invalid" });
  });

  it("refuses a flow cookie that does not name a user", async () => {
    const f = begin();
    const noUser = encrypt(JSON.stringify({ state: f.state, verifier: "v", redirectUri: redirectUri(ORIGIN), exp: 9e12 }), KEY);
    assert.deepEqual(await finish(noUser, { code: "abc", state: f.state }), { ok: false, reason: "invalid" });
    const blank = encrypt(JSON.stringify({ state: f.state, verifier: "v", redirectUri: redirectUri(ORIGIN), uid: "", exp: 9e12 }), KEY);
    assert.deepEqual(await finish(blank, { code: "abc", state: f.state }), { ok: false, reason: "invalid" });
  });

  it("refuses a missing code", async () => {
    const f = begin();
    assert.deepEqual(await finish(f.cookie, { state: f.state }), { ok: false, reason: "invalid" });
  });

  it("expires after ten minutes", async () => {
    const f = begin();
    assert.deepEqual(await finish(f.cookie, { code: "abc", state: f.state }, { now: f.now + FLOW_TTL_MS + 1 }), { ok: false, reason: "expired" });
  });

  it("refuses to complete on a different origin than it started on", async () => {
    const f = begin();
    assert.deepEqual(await finish(f.cookie, { code: "abc", state: f.state }, { origin: "https://evil.example" }), { ok: false, reason: "invalid" });
  });

  it("reports a denied consent screen", async () => {
    const f = begin();
    assert.deepEqual(await finish(f.cookie, { error: "access_denied", state: f.state }), { ok: false, reason: "denied" });
  });

  it("insists on a refresh token, since background sync cannot work without one", async () => {
    const f = begin();
    const r = await finishFlow({
      cookie: f.cookie, query: new URLSearchParams({ code: "abc", state: f.state }), origin: ORIGIN, now: f.now + 5, key: KEY,
      exchange: (async () => ({ ...TOKENS, refreshToken: null })) as typeof exchangeCode,
    });
    assert.deepEqual(r, { ok: false, reason: "no_refresh" });
  });
});
