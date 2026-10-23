import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";
import type { CalEvent } from "@/lib/calendar";
import { nexus } from "@/lib/nexus";
import { GoogleApiError, GoogleCalendarApi, type GCalendar } from "./api";
import { isOrbitCalendar } from "./calendars";
import { googleToCal } from "./display";
import { googleClient, GoogleOAuthError, refreshAccessToken, revoke, type GoogleTokens } from "./oauth";
import { DEFAULT_PREFS, parsePrefs, type Prefs, type TaskLite } from "./plan";
import { runGoogleSync, type SyncDeps, type SyncSummary } from "./sync";

// Everything that touches the database for Google Calendar. `db` is either the signed-in user's client
// (row-level security applies) or the admin client used by the scheduler. Every query filters by
// user_id explicitly, so the admin path can never read someone else's row.

export class NotConnectedError extends Error {
  constructor() {
    super("Google Calendar is not connected");
  }
}

export class GoogleAuthExpiredError extends Error {
  constructor() {
    super("Google Calendar access expired. Connect it again.");
  }
}

export class GoogleSetupError extends Error {}

export type LastSync = Omit<SyncSummary, "calendarId"> & { at: string };

export type GoogleMeta = {
  calendarId?: string;
  account?: string;
  prefs?: unknown;
  lastSync?: LastSync;
  needsReconnect?: boolean;
};

type Row = { accessToken: string; refreshToken: string | null; expiresAt: number; meta: GoogleMeta; lastSyncedAt: string | null };

const SKEW_MS = 60_000;

async function loadRow(db: SupabaseClient, userId: string): Promise<Row | null> {
  const { data } = await db
    .from("integration_tokens")
    .select("access_token_enc,refresh_token_enc,expires_at,meta,last_synced_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  if (!data) return null;
  return {
    accessToken: decrypt(data.access_token_enc as string),
    refreshToken: data.refresh_token_enc ? decrypt(data.refresh_token_enc as string) : null,
    expiresAt: data.expires_at ? Date.parse(data.expires_at as string) : 0,
    meta: ((data.meta as GoogleMeta | null) ?? {}) as GoogleMeta,
    lastSyncedAt: (data.last_synced_at as string | null) ?? null,
  };
}

export async function saveNewConnection(db: SupabaseClient, userId: string, t: GoogleTokens, account?: string) {
  const prev = await loadRow(db, userId);
  const meta: GoogleMeta = { ...(prev?.meta ?? {}), needsReconnect: false, ...(account ? { account } : {}) };
  const { error } = await db.from("integration_tokens").upsert(
    {
      user_id: userId,
      provider: "google",
      client_id: googleClient().id,
      access_token_enc: encrypt(t.accessToken),
      refresh_token_enc: t.refreshToken ? encrypt(t.refreshToken) : prev?.refreshToken ? encrypt(prev.refreshToken) : null,
      expires_at: new Date(t.expiresAt).toISOString(),
      scope: t.scope,
      meta,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error("Could not save the Google connection");
}

async function patchMeta(db: SupabaseClient, userId: string, patch: Partial<GoogleMeta>, extra: Record<string, unknown> = {}) {
  const row = await loadRow(db, userId);
  if (!row) return;
  await db
    .from("integration_tokens")
    .update({ meta: { ...row.meta, ...patch }, updated_at: new Date().toISOString(), ...extra })
    .eq("user_id", userId)
    .eq("provider", "google");
}

const refreshing = new Map<string, Promise<string>>();

/** A valid access token, refreshing it first when it is about to expire. */
export async function accessToken(db: SupabaseClient, userId: string, refresh = refreshAccessToken, now = Date.now()): Promise<string> {
  const row = await loadRow(db, userId);
  if (!row) throw new NotConnectedError();
  if (row.meta.needsReconnect) throw new GoogleAuthExpiredError();
  if (row.expiresAt - SKEW_MS > now) return row.accessToken;
  if (!row.refreshToken) throw new GoogleAuthExpiredError();

  const inflight = refreshing.get(userId);
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const t = await refresh(row.refreshToken as string, now);
      await db
        .from("integration_tokens")
        .update({ access_token_enc: encrypt(t.accessToken), expires_at: new Date(t.expiresAt).toISOString(), updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("provider", "google");
      return t.accessToken;
    } catch (err) {
      if (err instanceof GoogleOAuthError && (err.code === "invalid_grant" || err.status === 400 || err.status === 401)) {
        await patchMeta(db, userId, { needsReconnect: true });
        throw new GoogleAuthExpiredError();
      }
      throw err;
    } finally {
      refreshing.delete(userId);
    }
  })();
  refreshing.set(userId, p);
  return p;
}

const apiFor = (db: SupabaseClient, userId: string) => new GoogleCalendarApi(() => accessToken(db, userId));

/** Plain-English version of whatever went wrong, for the UI. */
export function friendlyError(err: unknown): { kind: "reconnect" | "setup" | "error"; message: string } {
  if (err instanceof GoogleAuthExpiredError) return { kind: "reconnect", message: err.message };
  if (err instanceof NotConnectedError) return { kind: "error", message: "Connect Google Calendar first." };
  if (err instanceof GoogleApiError) {
    if (err.status === 403 && (err.reason === "accessNotConfigured" || /has not been used|disabled/i.test(err.message))) {
      return { kind: "setup", message: "The Google Calendar API isn't switched on for your Google Cloud project yet. Enable it, then try again." };
    }
    if (err.status === 401 || err.status === 403) return { kind: "reconnect", message: "Google refused access. Connect Google Calendar again." };
  }
  return { kind: "error", message: "Couldn't reach Google Calendar. Try again in a moment." };
}

// ---- Status -------------------------------------------------------------------

export type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  account: string | null;
  calendarId: string | null;
  prefs: Prefs;
  lastSync: LastSync | null;
  lastSyncedAtMs: number | null;
};

export async function status(db: SupabaseClient, userId: string, configured: boolean): Promise<GoogleStatus> {
  const row = await loadRow(db, userId);
  return {
    configured,
    connected: !!row,
    needsReconnect: !!row?.meta.needsReconnect,
    account: row?.meta.account ?? null,
    calendarId: row?.meta.calendarId ?? null,
    prefs: row ? parsePrefs(row.meta.prefs) : DEFAULT_PREFS,
    lastSync: row?.meta.lastSync ?? null,
    lastSyncedAtMs: row?.lastSyncedAt ? Date.parse(row.lastSyncedAt) : null,
  };
}

export async function savePrefs(db: SupabaseClient, userId: string, prefs: Prefs) {
  await patchMeta(db, userId, { prefs });
}

export async function disconnect(db: SupabaseClient, userId: string) {
  const row = await loadRow(db, userId);
  if (row) await revoke(row.refreshToken ?? row.accessToken); // the Orbit calendar itself is left in place
  await db.from("integration_tokens").delete().eq("user_id", userId).eq("provider", "google");
}

/** The signed-in Google account, for display. Never throws. */
export async function accountOf(accessTokenValue: string): Promise<string | undefined> {
  try {
    const api = new GoogleCalendarApi(async () => accessTokenValue);
    return (await api.calendars()).find((c) => c.primary)?.id;
  } catch {
    return undefined;
  }
}

// ---- Sync ---------------------------------------------------------------------

export type SyncOpts = { nexus?: SyncDeps["nexus"]; now?: number };

async function syncOnce(db: SupabaseClient, userId: string, opts: SyncOpts = {}): Promise<SyncSummary> {
  const now = opts.now ?? Date.now();
  const row = await loadRow(db, userId);
  if (!row) throw new NotConnectedError();
  const prefs = parsePrefs(row.meta.prefs);

  const summary = await runGoogleSync({
    api: apiFor(db, userId),
    calendarId: row.meta.calendarId ?? null,
    prefs,
    now,
    nexus: opts.nexus ?? { schedule: (a, b) => nexus.schedule(a, b), assignments: () => nexus.assignments("all") },
    tasks: {
      async open(fromIso, toIso) {
        const { data, error } = await db
          .from("tasks")
          .select("id,title,notes,due_at,due_has_time,remind_at,course,priority,done_at")
          .eq("user_id", userId)
          .is("done_at", null)
          .gte("due_at", fromIso)
          .lt("due_at", toIso);
        if (error) throw new Error(error.message);
        return (data ?? []) as TaskLite[];
      },
      async applyMoves(rows) {
        for (const t of rows) {
          await db
            .from("tasks")
            .update({ due_at: t.due_at, due_has_time: t.due_has_time, remind_at: t.remind_at, reminded_at: null })
            .eq("id", t.id)
            .eq("user_id", userId);
        }
      },
    },
    async saveCalendarId(id) {
      await patchMeta(db, userId, { calendarId: id });
    },
  });

  const { calendarId, ...counts } = summary;
  await patchMeta(db, userId, { calendarId, needsReconnect: false, lastSync: { ...counts, at: new Date(now).toISOString() } }, { last_synced_at: new Date(now).toISOString() });
  return summary;
}

const running = new Map<string, { again: boolean; p: Promise<SyncSummary> }>();

/** One sync per user at a time. A request that arrives mid-sync makes it run once more, so no change is missed. */
export function syncUser(db: SupabaseClient, userId: string, opts: SyncOpts = {}): Promise<SyncSummary> {
  const cur = running.get(userId);
  if (cur) {
    cur.again = true;
    return cur.p;
  }
  const state = { again: false, p: undefined as unknown as Promise<SyncSummary> };
  state.p = (async () => {
    try {
      let result: SyncSummary;
      do {
        state.again = false;
        result = await syncOnce(db, userId, opts);
      } while (state.again);
      return result;
    } finally {
      running.delete(userId);
    }
  })();
  running.set(userId, state);
  return state.p;
}

/** Scheduler entry: sync everyone who is connected and due. Errors for one user never stop the others. */
export async function syncDueUsers(db: SupabaseClient, olderThanMs = 12 * 60_000, now = Date.now(), opts: SyncOpts = {}): Promise<{ synced: number; failed: number }> {
  const { data } = await db.from("integration_tokens").select("user_id,last_synced_at,meta").eq("provider", "google");
  let synced = 0;
  let failed = 0;
  for (const r of data ?? []) {
    const meta = (r.meta ?? {}) as GoogleMeta;
    const last = r.last_synced_at ? Date.parse(r.last_synced_at as string) : 0;
    if (meta.needsReconnect || now - last < olderThanMs) continue;
    try {
      await syncUser(db, r.user_id as string, { ...opts, now });
      synced++;
    } catch (err) {
      failed++;
      console.error("google sync failed", friendlyError(err).kind, err instanceof Error ? err.message.slice(0, 200) : "");
    }
  }
  return { synced, failed };
}

// ---- Reading your Google calendars into Orbit -------------------------------------

const CAL_TTL = 5 * 60_000;
const EVENT_TTL = 45_000;
const calCache = new Map<string, { at: number; p: Promise<GCalendar[]> }>();
const evCache = new Map<string, { at: number; p: Promise<CalEvent[]> }>();

export async function listCalendars(db: SupabaseClient, userId: string): Promise<GCalendar[]> {
  const hit = calCache.get(userId);
  if (hit && Date.now() - hit.at < CAL_TTL) return hit.p;
  const p = apiFor(db, userId).calendars();
  calCache.set(userId, { at: Date.now(), p });
  p.catch(() => calCache.delete(userId));
  return p;
}

export type GoogleRead = { status: "off" | "ok" | "reconnect" | "error"; events: CalEvent[] };

/** Events from your other Google calendars between two YYYY-MM-DD keys (end exclusive). */
export async function readGoogleEvents(db: SupabaseClient, userId: string, fromKey: string, toKey: string): Promise<GoogleRead> {
  const row = await loadRow(db, userId);
  if (!row) return { status: "off", events: [] };
  if (row.meta.needsReconnect) return { status: "reconnect", events: [] };

  const prefs = parsePrefs(row.meta.prefs);
  const key = `${userId}|${fromKey}|${toKey}|${prefs.hiddenCalendars.join(",")}|${row.meta.calendarId ?? ""}`;
  const hit = evCache.get(key);
  try {
    if (hit && Date.now() - hit.at < EVENT_TTL) return { status: "ok", events: await hit.p };

    const api = apiFor(db, userId);
    const p = (async () => {
      const cals = (await listCalendars(db, userId)).filter(
        (c) => c.id !== row.meta.calendarId && !isOrbitCalendar(c) && c.selected !== false && c.accessRole !== "freeBusyReader" && !prefs.hiddenCalendars.includes(c.id),
      );
      const timeMin = new Date(Date.parse(`${fromKey}T00:00:00+05:30`)).toISOString();
      const timeMax = new Date(Date.parse(`${toKey}T00:00:00+05:30`)).toISOString();
      const lists = await Promise.all(
        cals.slice(0, 12).map(async (c) => (await api.events(c.id, { timeMin, timeMax, maxResults: 500 })).flatMap((e) => googleToCal(e, c))),
      );
      return lists.flat();
    })();
    evCache.set(key, { at: Date.now(), p });
    p.catch(() => evCache.delete(key));
    return { status: "ok", events: await p };
  } catch (err) {
    const kind = friendlyError(err).kind;
    return { status: kind === "reconnect" ? "reconnect" : "error", events: [] };
  }
}

/** Forget cached reads after a sync or a settings change. */
export function dropCaches(userId: string) {
  calCache.delete(userId);
  for (const k of evCache.keys()) if (k.startsWith(`${userId}|`)) evCache.delete(k);
}
