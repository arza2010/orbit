import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { McpClient } from "../lib/wispr/mcp";
import {
  buildAuthorizeUrl,
  discover,
  exchangeCode,
  newPkce,
  OAuthError,
  refreshTokens,
  registerClient,
  type AuthServerMeta,
} from "../lib/wispr/oauth";
import { startMock } from "./support/mock-wispr";

const REDIRECT = "http://localhost:3100/api/wispr/callback";

describe("Wispr OAuth against a faithful fake server", () => {
  const closers: (() => Promise<void>)[] = [];
  after(async () => {
    for (const c of closers) await c();
  });

  async function boot() {
    const mock = await startMock({ meetings: [{ id: "m1", title: "Class", start: "2026-10-19T04:05:00Z", end: "2026-10-19T05:59:00Z" }] });
    closers.push(mock.close);
    const meta = await discover(mock.mcpUrl);
    return { mock, meta };
  }

  /** Plays the browser: opens the authorize URL, takes the redirect back to the app. */
  async function approve(meta: AuthServerMeta, clientId: string, redirectUri = REDIRECT) {
    const pkce = newPkce();
    const url = buildAuthorizeUrl({ meta, clientId, redirectUri, state: pkce.state, challenge: pkce.challenge });
    const res = await fetch(url, { redirect: "manual" });
    return { pkce, url, res, location: res.headers.get("location") };
  }

  it("discovers the sign-in server from the MCP address", async () => {
    const { mock, meta } = await boot();
    assert.equal(meta.authorizationEndpoint, `${mock.base}/auth/oauth2/authorize`);
    assert.equal(meta.tokenEndpoint, `${mock.base}/auth/oauth2/token`);
    assert.equal(meta.registrationEndpoint, `${mock.base}/auth/oauth2/register`);
    assert.equal(meta.resource, `${mock.base}/connect/mcp`);
  });

  it("registers a public client for our redirect address", async () => {
    const { mock, meta } = await boot();
    const clientId = await registerClient(meta, REDIRECT);
    assert.match(clientId, /^client_/);
    assert.deepEqual(mock.state.clients.get(clientId)?.redirectUris, [REDIRECT]);
  });

  it("builds an authorize URL with PKCE (S256), state, scope and the resource", async () => {
    const { meta } = await boot();
    const clientId = await registerClient(meta, REDIRECT);
    const { url, pkce } = await approve(meta, clientId);
    const q = new URL(url).searchParams;
    assert.equal(q.get("response_type"), "code");
    assert.equal(q.get("code_challenge_method"), "S256");
    assert.equal(q.get("code_challenge"), pkce.challenge);
    assert.equal(q.get("state"), pkce.state);
    assert.equal(q.get("redirect_uri"), REDIRECT);
    assert.equal(q.get("scope"), "openid offline_access");
    assert.equal(q.get("resource"), meta.resource);
    assert.notEqual(pkce.verifier, pkce.challenge);
    assert.ok(pkce.verifier.length >= 43, "verifier must be at least 43 characters");
  });

  it("completes the whole flow and the token then works against the MCP endpoint", async () => {
    const { mock, meta } = await boot();
    const clientId = await registerClient(meta, REDIRECT);
    const { pkce, location } = await approve(meta, clientId);

    const back = new URL(location as string);
    assert.equal(back.origin + back.pathname, REDIRECT);
    assert.equal(back.searchParams.get("state"), pkce.state, "state must round-trip unchanged");

    const tokens = await exchangeCode({ meta, clientId, redirectUri: REDIRECT, code: back.searchParams.get("code") as string, verifier: pkce.verifier });
    assert.ok(tokens.accessToken && tokens.refreshToken);
    assert.ok(tokens.expiresAt > Date.now() + 3_000_000, "expiry should be about an hour out");

    const res = await new McpClient(mock.mcpUrl, tokens.accessToken).callTool<{ meetings: { id: string }[] }>("search_meetings", {});
    assert.equal(res.meetings[0].id, "m1");
  });

  it("rejects a code replay", async () => {
    const { meta } = await boot();
    const clientId = await registerClient(meta, REDIRECT);
    const { pkce, location } = await approve(meta, clientId);
    const code = new URL(location as string).searchParams.get("code") as string;
    await exchangeCode({ meta, clientId, redirectUri: REDIRECT, code, verifier: pkce.verifier });
    await assert.rejects(() => exchangeCode({ meta, clientId, redirectUri: REDIRECT, code, verifier: pkce.verifier }), OAuthError);
  });

  it("rejects the wrong PKCE verifier (a stolen code is useless without it)", async () => {
    const { meta } = await boot();
    const clientId = await registerClient(meta, REDIRECT);
    const { location } = await approve(meta, clientId);
    const code = new URL(location as string).searchParams.get("code") as string;
    await assert.rejects(
      () => exchangeCode({ meta, clientId, redirectUri: REDIRECT, code, verifier: newPkce().verifier }),
      /PKCE/,
    );
  });

  it("refuses an unregistered redirect address", async () => {
    const { meta } = await boot();
    const clientId = await registerClient(meta, REDIRECT);
    const { res } = await approve(meta, clientId, "http://evil.example/callback");
    assert.equal(res.status, 400);
  });

  it("rotates refresh tokens: each works once, the old one dies", async () => {
    const { meta } = await boot();
    const clientId = await registerClient(meta, REDIRECT);
    const { pkce, location } = await approve(meta, clientId);
    const first = await exchangeCode({
      meta, clientId, redirectUri: REDIRECT, code: new URL(location as string).searchParams.get("code") as string, verifier: pkce.verifier,
    });

    const second = await refreshTokens({ meta, clientId, refreshToken: first.refreshToken as string });
    assert.notEqual(second.accessToken, first.accessToken);
    assert.notEqual(second.refreshToken, first.refreshToken);
    await assert.rejects(() => refreshTokens({ meta, clientId, refreshToken: first.refreshToken as string }), OAuthError);

    const third = await refreshTokens({ meta, clientId, refreshToken: second.refreshToken as string });
    assert.ok(third.accessToken);
  });

  it("does not leak tokens or codes into error messages", async () => {
    const { meta } = await boot();
    const clientId = await registerClient(meta, REDIRECT);
    try {
      await refreshTokens({ meta, clientId, refreshToken: "rt_supersecretvalue" });
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e instanceof OAuthError);
      assert.ok(!e.message.includes("supersecretvalue"));
    }
  });

  it("fails clearly when the server has no sign-in metadata", async () => {
    await assert.rejects(() => discover("http://127.0.0.1:1/connect/mcp"));
  });
});

// Talks to the real Wispr servers. Off by default so tests stay offline: run with LIVE_WISPR=1.
describe("Wispr OAuth against the real server", { skip: process.env.LIVE_WISPR !== "1" }, () => {
  it("discovers the real sign-in server and registers this app", async () => {
    const meta = await discover("https://api.wisprflow.ai/connect/mcp");
    assert.equal(new URL(meta.authorizationEndpoint).hostname, "mcp-auth.wisprflow.com");
    assert.equal(meta.resource, "https://api.wisprflow.ai/connect/mcp");

    const clientId = await registerClient(meta, REDIRECT);
    assert.ok(clientId.length > 8);

    // The authorize endpoint should accept our request and send us to a sign-in page (not an error).
    const pkce = newPkce();
    const url = buildAuthorizeUrl({ meta, clientId, redirectUri: REDIRECT, state: pkce.state, challenge: pkce.challenge });
    const res = await fetch(url, { redirect: "manual" });
    assert.ok([200, 302, 303].includes(res.status), `authorize returned ${res.status}`);
    const where = res.headers.get("location") ?? "";
    assert.ok(!/error=/.test(where), `authorize redirected to an error: ${where.replace(/state=[^&]+/, "state=…")}`);
  });

  it("the real MCP endpoint rejects a bad token with 401", async () => {
    await assert.rejects(
      () => new McpClient("https://api.wisprflow.ai/connect/mcp", "not-a-real-token").callTool("search_meetings", {}),
      (e: { status?: number }) => e.status === 401,
    );
  });
});
