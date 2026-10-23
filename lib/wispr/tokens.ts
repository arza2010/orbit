import "server-only";
import { McpClient } from "./mcp";
import { discover, OAuthError, refreshTokens, WISPR_MCP_URL, type AuthServerMeta } from "./oauth";

// Keeps a stored Wispr connection usable. Wispr rotates refresh tokens (each works once), so two
// refreshes at the same moment would lock the connection out. This serialises refreshes inside a
// process, and recovers if another process refreshed first.

export type StoredConnection = {
  clientId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // epoch ms
};

export interface ConnectionStore {
  /** Stable key for locking (the user id). */
  readonly key: string;
  load(): Promise<StoredConnection | null>;
  save(conn: StoredConnection): Promise<void>;
}

export class NotConnectedError extends Error {
  constructor() {
    super("Wispr is not connected");
  }
}

/** The stored connection can no longer be refreshed; the user has to connect again. */
export class WisprAuthExpiredError extends Error {
  constructor() {
    super("The Wispr connection expired. Connect Wispr again.");
  }
}

const SKEW_MS = 60_000;
const inflight = new Map<string, Promise<StoredConnection>>();

let metaCache: { url: string; at: number; meta: Promise<AuthServerMeta> } | null = null;
function authMeta(mcpUrl: string): Promise<AuthServerMeta> {
  if (!metaCache || metaCache.url !== mcpUrl || Date.now() - metaCache.at > 3_600_000) {
    const meta = discover(mcpUrl);
    meta.catch(() => (metaCache = null));
    metaCache = { url: mcpUrl, at: Date.now(), meta };
  }
  return metaCache.meta;
}

async function doRefresh(store: ConnectionStore, mcpUrl: string, now: () => number): Promise<StoredConnection> {
  const current = await store.load();
  if (!current) throw new NotConnectedError();
  if (!current.refreshToken) throw new WisprAuthExpiredError();

  const meta = await authMeta(mcpUrl);
  try {
    const t = await refreshTokens({ meta, clientId: current.clientId, refreshToken: current.refreshToken }, now());
    const next: StoredConnection = {
      clientId: current.clientId,
      accessToken: t.accessToken,
      // Some servers omit a new refresh token; keep the old one then.
      refreshToken: t.refreshToken ?? current.refreshToken,
      expiresAt: t.expiresAt,
    };
    await store.save(next);
    return next;
  } catch (err) {
    if (err instanceof OAuthError && (err.status === 400 || err.status === 401)) {
      // Another process may have rotated the token first. If the store now holds a newer pair, use it.
      const latest = await store.load();
      if (latest && latest.refreshToken !== current.refreshToken && latest.expiresAt > now()) return latest;
      throw new WisprAuthExpiredError();
    }
    throw err;
  }
}

/** One refresh at a time per user, however many callers ask. */
function refreshOnce(store: ConnectionStore, mcpUrl: string, now: () => number): Promise<StoredConnection> {
  const existing = inflight.get(store.key);
  if (existing) return existing;
  const p = doRefresh(store, mcpUrl, now).finally(() => inflight.delete(store.key));
  inflight.set(store.key, p);
  return p;
}

/** An MCP client with a valid token, refreshing before use and again if the server says 401. */
export async function getWisprClient(
  store: ConnectionStore,
  opts: { mcpUrl?: string; now?: () => number } = {},
): Promise<McpClient> {
  const mcpUrl = opts.mcpUrl ?? WISPR_MCP_URL;
  const now = opts.now ?? Date.now;

  let conn = await store.load();
  if (!conn) throw new NotConnectedError();
  if (conn.expiresAt - SKEW_MS <= now()) conn = await refreshOnce(store, mcpUrl, now);

  return new McpClient(mcpUrl, conn.accessToken, async () => (await refreshOnce(store, mcpUrl, now)).accessToken);
}
