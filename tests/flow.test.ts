import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, describe, it } from "node:test";
import { encrypt } from "../lib/crypto";
import { callbackUri, finishFlow, FLOW_TTL_MS, startFlow } from "../lib/wispr/flow";
import { McpClient } from "../lib/wispr/mcp";
import { startMock } from "./support/mock-wispr";

const ORIGIN = "http://localhost:3100";
const KEY = randomBytes(32).toString("base64");

describe("connecting Wispr end to end (start, approve, finish)", () => {
  const closers: (() => Promise<void>)[] = [];
  after(async () => {
    for (const c of closers) await c();
  });

  async function boot() {
    const mock = await startMock({ meetings: [{ id: "m1", title: "Class", start: "2026-10-19T04:05:00Z", end: "2026-10-19T05:59:00Z" }] });
    closers.push(mock.close);
    const start = (over: { origin?: string; now?: number } = {}) => startFlow({ origin: over.origin ?? ORIGIN, mcpUrl: mock.mcpUrl, key: KEY, now: over.now });
    /** The browser: follow the authorize URL, get sent back to our callback address. */
    const approve = async (authorizeUrl: string) => new URL((await fetch(authorizeUrl, { redirect: "manual" })).headers.get("location") as string);
    const finish = (cookie: string | undefined, back: URL, over: { origin?: string; now?: number } = {}) =>
      finishFlow({ cookie, query: back.searchParams, origin: over.origin ?? ORIGIN, mcpUrl: mock.mcpUrl, key: KEY, now: over.now });
    return { mock, start, approve, finish };
  }

  it("works start to finish and yields tokens that can read meetings", async () => {
    const { mock, start, approve, finish } = await boot();
    const { authorizeUrl, cookie } = await start();
    const back = await approve(authorizeUrl);
    assert.equal(back.origin + back.pathname, callbackUri(ORIGIN));

    const r = await finish(cookie, back);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.ok(r.tokens.refreshToken, "offline access gives a refresh token");
    const res = await new McpClient(mock.mcpUrl, r.tokens.accessToken).callTool<{ meetings: unknown[] }>("search_meetings", {});
    assert.equal(res.meetings.length, 1);
  });

  it("treats the user clicking Deny as denied, not an error", async () => {
    const { start, finish } = await boot();
    const { cookie } = await start();
    assert.deepEqual(await finish(cookie, new URL(`${ORIGIN}/api/wispr/callback?error=access_denied`)), { ok: false, reason: "denied" });
  });

  it("rejects a callback with no cookie (someone opened the link cold)", async () => {
    const { start, approve, finish } = await boot();
    const { authorizeUrl } = await start();
    const back = await approve(authorizeUrl);
    assert.deepEqual(await finish(undefined, back), { ok: false, reason: "invalid" });
  });

  it("rejects a missing code or state", async () => {
    const { start, finish } = await boot();
    const { cookie } = await start();
    assert.deepEqual(await finish(cookie, new URL(`${ORIGIN}/api/wispr/callback?state=x`)), { ok: false, reason: "invalid" });
    assert.deepEqual(await finish(cookie, new URL(`${ORIGIN}/api/wispr/callback?code=x`)), { ok: false, reason: "invalid" });
  });

  it("rejects a forged state (cross-site request forgery)", async () => {
    const { start, approve, finish } = await boot();
    const { authorizeUrl, cookie } = await start();
    const back = await approve(authorizeUrl);
    back.searchParams.set("state", "attacker-chosen");
    assert.deepEqual(await finish(cookie, back), { ok: false, reason: "invalid" });
  });

  it("rejects a callback that belongs to a different flow (state from another session)", async () => {
    const { start, approve, finish } = await boot();
    const mine = await start();
    const theirs = await start();
    const theirBack = await approve(theirs.authorizeUrl);
    assert.deepEqual(await finish(mine.cookie, theirBack), { ok: false, reason: "invalid" });
  });

  it("rejects an expired flow", async () => {
    const { start, approve, finish } = await boot();
    const t0 = Date.now();
    const { authorizeUrl, cookie } = await start({ now: t0 });
    const back = await approve(authorizeUrl);
    assert.deepEqual(await finish(cookie, back, { now: t0 + FLOW_TTL_MS + 1 }), { ok: false, reason: "expired" });
  });

  it("rejects a tampered cookie, a garbage cookie, and a cookie made with another key", async () => {
    const { start, approve, finish } = await boot();
    const { authorizeUrl, cookie } = await start();
    const back = await approve(authorizeUrl);
    const parts = cookie.split(".");
    const tampered = [...parts.slice(0, 3), Buffer.from("tampered").toString("base64url")].join(".");
    assert.deepEqual(await finish(tampered, back), { ok: false, reason: "invalid" });
    assert.deepEqual(await finish("not-a-cookie", back), { ok: false, reason: "invalid" });
    const otherKey = encrypt(JSON.stringify({ state: "s", verifier: "v", clientId: "c", redirectUri: callbackUri(ORIGIN), exp: Date.now() + 1e6 }), randomBytes(32).toString("base64"));
    assert.deepEqual(await finish(otherKey, back), { ok: false, reason: "invalid" });
  });

  it("rejects a cookie whose contents are the wrong shape", async () => {
    const { start, approve, finish } = await boot();
    const { authorizeUrl } = await start();
    const back = await approve(authorizeUrl);
    const odd = encrypt(JSON.stringify({ state: 1, verifier: null }), KEY);
    assert.deepEqual(await finish(odd, back), { ok: false, reason: "invalid" });
  });

  it("rejects a callback arriving on a different origin than the flow started on", async () => {
    const { start, approve, finish } = await boot();
    const { authorizeUrl, cookie } = await start();
    const back = await approve(authorizeUrl);
    assert.deepEqual(await finish(cookie, back, { origin: "http://evil.example" }), { ok: false, reason: "invalid" });
  });

  it("a code can be used once: replaying the same callback fails", async () => {
    const { start, approve, finish } = await boot();
    const { authorizeUrl, cookie } = await start();
    const back = await approve(authorizeUrl);
    assert.ok((await finish(cookie, back)).ok);
    await assert.rejects(() => finish(cookie, back));
  });

  it("each start registers a client for the right redirect address", async () => {
    const { mock, start } = await boot();
    await start({ origin: "https://orbit.example.com" });
    const uris = [...mock.state.clients.values()].map((c) => c.redirectUris[0]);
    assert.deepEqual(uris, ["https://orbit.example.com/api/wispr/callback"]);
  });
});
