import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { getWisprClient, NotConnectedError, WisprAuthExpiredError, type ConnectionStore, type StoredConnection } from "../lib/wispr/tokens";
import { startMock } from "./support/mock-wispr";

const meetings = [{ id: "m1", title: "Class", start: "2026-10-19T04:05:00Z", end: "2026-10-19T05:59:00Z" }];

class MemoryStore implements ConnectionStore {
  saves = 0;
  constructor(
    readonly key: string,
    public conn: StoredConnection | null,
  ) {}
  async load() {
    return this.conn ? { ...this.conn } : null;
  }
  async save(c: StoredConnection) {
    this.saves++;
    this.conn = { ...c };
  }
}

describe("keeping the Wispr connection alive", () => {
  const closers: (() => Promise<void>)[] = [];
  after(async () => {
    for (const c of closers) await c();
  });

  async function boot(opts: Parameters<typeof startMock>[0] = {}) {
    const mock = await startMock({ meetings, ...opts });
    closers.push(mock.close);
    const { access, refresh } = mock.mintTokens("client_x");
    const conn = (over: Partial<StoredConnection> = {}): StoredConnection => ({
      clientId: "client_x",
      accessToken: access,
      refreshToken: refresh,
      expiresAt: Date.now() + 3_600_000,
      ...over,
    });
    return { mock, conn, access, refresh };
  }

  it("uses a still-valid token without refreshing", async () => {
    const { mock, conn } = await boot();
    const store = new MemoryStore("u-valid", conn());
    const client = await getWisprClient(store, { mcpUrl: mock.mcpUrl });
    await client.callTool("search_meetings", {});
    assert.equal(mock.state.refreshCount, 0);
    assert.equal(store.saves, 0);
  });

  it("refreshes an expired token before use and saves the new pair", async () => {
    const { mock, conn, refresh } = await boot();
    const store = new MemoryStore("u-expired", conn({ expiresAt: Date.now() - 1000 }));
    const client = await getWisprClient(store, { mcpUrl: mock.mcpUrl });
    const res = await client.callTool<{ meetings: unknown[] }>("search_meetings", {});
    assert.equal(res.meetings.length, 1);
    assert.equal(mock.state.refreshCount, 1);
    assert.equal(store.saves, 1);
    assert.notEqual(store.conn?.refreshToken, refresh, "the rotated refresh token was stored");
  });

  it("refreshes slightly early so a token never expires mid-sync", async () => {
    const { mock, conn } = await boot();
    const store = new MemoryStore("u-early", conn({ expiresAt: Date.now() + 30_000 })); // inside the 60s margin
    await getWisprClient(store, { mcpUrl: mock.mcpUrl });
    assert.equal(mock.state.refreshCount, 1);
  });

  it("refreshes only once when many syncs ask at the same moment", async () => {
    const { mock, conn } = await boot();
    const store = new MemoryStore("u-race", conn({ expiresAt: Date.now() - 1000 }));
    const clients = await Promise.all(Array.from({ length: 12 }, () => getWisprClient(store, { mcpUrl: mock.mcpUrl })));
    assert.equal(mock.state.refreshCount, 1, "rotating tokens would be burned by a second refresh");
    for (const c of clients) await c.callTool("search_meetings", {});
  });

  it("refreshes and carries on when the server rejects a token we thought was valid", async () => {
    const { mock, conn } = await boot();
    const store = new MemoryStore("u-revoked", conn({ accessToken: "revoked-token" }));
    const client = await getWisprClient(store, { mcpUrl: mock.mcpUrl });
    const res = await client.callTool<{ meetings: unknown[] }>("search_meetings", {});
    assert.equal(res.meetings.length, 1);
    assert.equal(mock.state.refreshCount, 1);
    assert.equal(store.saves, 1);
  });

  it("recovers when another process refreshed first", async () => {
    const { mock, conn } = await boot();
    const other = mock.mintTokens("client_x"); // what the other process ends up with
    const stale = conn({ expiresAt: Date.now() - 1000, refreshToken: "rt_already_used_elsewhere" });
    // Our first read sees the stale pair; by the time the refresh fails, the other process has saved a new one.
    let loads = 0;
    const store: ConnectionStore & { saves: number } = {
      key: "u-other",
      saves: 0,
      async load() {
        loads++;
        return loads <= 2 ? { ...stale } : { clientId: "client_x", accessToken: other.access, refreshToken: other.refresh, expiresAt: Date.now() + 3_600_000 };
      },
      async save() {
        this.saves++;
      },
    };
    const client = await getWisprClient(store, { mcpUrl: mock.mcpUrl });
    const res = await client.callTool<{ meetings: unknown[] }>("search_meetings", {});
    assert.equal(res.meetings.length, 1);
    assert.equal(store.saves, 0, "adopted the other process's tokens without overwriting them");
  });

  it("asks the user to reconnect when the refresh token is dead", async () => {
    const { mock, conn } = await boot();
    const store = new MemoryStore("u-dead", conn({ expiresAt: Date.now() - 1000, refreshToken: "rt_dead" }));
    await assert.rejects(() => getWisprClient(store, { mcpUrl: mock.mcpUrl }), WisprAuthExpiredError);
  });

  it("asks the user to reconnect when there is no refresh token at all", async () => {
    const { mock, conn } = await boot();
    const store = new MemoryStore("u-norefresh", conn({ expiresAt: Date.now() - 1000, refreshToken: null }));
    await assert.rejects(() => getWisprClient(store, { mcpUrl: mock.mcpUrl }), WisprAuthExpiredError);
  });

  it("reports not connected when nothing is stored", async () => {
    const { mock } = await boot();
    await assert.rejects(() => getWisprClient(new MemoryStore("u-none", null), { mcpUrl: mock.mcpUrl }), NotConnectedError);
  });

  it("keeps the old refresh token if the server does not send a new one", async () => {
    const { mock, conn } = await boot();
    // Patch the fake so refresh responses omit refresh_token.
    const store = new MemoryStore("u-norotate", conn({ expiresAt: Date.now() - 1000 }));
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const res = await original(input, init);
      if (String(input).endsWith("/oauth2/token")) {
        const body = (await res.json()) as Record<string, unknown>;
        delete body.refresh_token;
        return new Response(JSON.stringify(body), { status: res.status, headers: { "Content-Type": "application/json" } });
      }
      return res;
    };
    try {
      const before = store.conn?.refreshToken;
      await getWisprClient(store, { mcpUrl: mock.mcpUrl });
      assert.equal(store.conn?.refreshToken, before);
    } finally {
      globalThis.fetch = original;
    }
  });
});
