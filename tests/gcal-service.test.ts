import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { startFakeSupabase } from "../scripts/fake-supabase.mjs";

// Set before the app code is imported, because some of it reads the environment when loaded.
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.GOOGLE_CLIENT_ID = "client.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "secret";

import { CALENDAR_DESCRIPTION } from "../lib/gcal/calendars";
import { eventIdFor } from "../lib/gcal/plan";
import { GoogleOAuthError, type GoogleTokens } from "../lib/gcal/oauth";
import {
  accessToken, disconnect, dropCaches, friendlyError, GoogleAuthExpiredError, NotConnectedError, readGoogleEvents,
  saveNewConnection, savePrefs, status, syncDueUsers, syncUser,
} from "../lib/gcal/service";
import { GoogleApiError } from "../lib/gcal/api";
import type { Assignment, ScheduleEvent } from "../lib/nexus";
import { createAdminClient } from "../lib/supabase/admin";
import { startFakeGoogle } from "./support/fake-google";

const ist = (s: string) => Date.parse(`${s.replace(" ", "T")}:00+05:30`);
const NOW = ist("2026-10-21 11:25");
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

const cls = (id: string, start: string, end: string): ScheduleEvent => ({
  id, title: "AI with Mihirr Sose", type: "session", status: "scheduled", cancelled: false, day: "", time: "",
  start: `${start.replace(" ", "T")}:00+05:30`, end: `${end.replace(" ", "T")}:00+05:30`, course: "AI with Mihirr Sose", term: "Term 2",
  instructor: null, instructorLinkedIn: null, room: null, meetingLink: null, attendanceRequired: true, notes: null, attachments: [],
});
const NEXUS = {
  schedule: async () => [cls("c1", "2026-10-22 09:30", "2026-10-22 11:00")],
  assignments: async (): Promise<Assignment[]> => [],
};

const fresh = (over: Partial<GoogleTokens> = {}): GoogleTokens => ({ accessToken: "access-1", refreshToken: "refresh-1", expiresAt: NOW + 3_600_000, scope: "cal", ...over });

describe("Google Calendar service against a real database over HTTP", () => {
  let db: Awaited<ReturnType<typeof startFakeSupabase>>;
  let google: Awaited<ReturnType<typeof startFakeGoogle>>;
  let admin: ReturnType<typeof createAdminClient>;

  before(async () => {
    db = await startFakeSupabase({ port: 0 });
    google = await startFakeGoogle();
    process.env.GOOGLE_CALENDAR_API_BASE = google.base;
    admin = createAdminClient(db.url, "service-role-key");
  });
  after(async () => {
    await db.close();
    await google.close();
  });
  beforeEach(async () => {
    await fetch(`${db.url}/debug/reset`);
    google.reset();
    dropCaches(A);
    dropCaches(B);
  });

  const rows = async (table: string) => ((await admin.from(table).select("*")).data ?? []) as Record<string, unknown>[];
  const tokenRow = async (userId = A) => (await rows("integration_tokens")).find((r) => r.user_id === userId && r.provider === "google");
  const addTask = (userId: string, id: string, title: string, at: string) =>
    admin.from("tasks").insert({ id, user_id: userId, title, due_at: new Date(ist(at)).toISOString(), due_has_time: true, remind_at: null, priority: 0, done_at: null, notes: null, course: null });

  describe("storing the connection", () => {
    it("keeps tokens encrypted, never in plain text", async () => {
      await saveNewConnection(admin, A, fresh(), "me@example.com");
      const row = await tokenRow();
      assert.ok(row);
      const dump = JSON.stringify(row);
      assert.ok(!dump.includes("access-1") && !dump.includes("refresh-1"), "tokens must not be stored in the clear");
      assert.equal((row?.meta as { account: string }).account, "me@example.com");
    });

    it("reports status, with sensible default preferences", async () => {
      assert.equal((await status(admin, A, true)).connected, false);
      await saveNewConnection(admin, A, fresh(), "me@example.com");
      const st = await status(admin, A, true);
      assert.equal(st.connected, true);
      assert.equal(st.account, "me@example.com");
      assert.equal(st.prefs.classes, true);
      assert.equal(st.prefs.classReminder, 15);
      assert.equal(st.needsReconnect, false);
    });

    it("saves preferences, and rejects nonsense by falling back to defaults", async () => {
      await saveNewConnection(admin, A, fresh());
      await savePrefs(admin, A, { classes: false, deadlines: true, tasks: true, classReminder: 30, hiddenCalendars: ["x"] });
      let st = await status(admin, A, true);
      assert.equal(st.prefs.classes, false);
      assert.equal(st.prefs.classReminder, 30);
      assert.deepEqual(st.prefs.hiddenCalendars, ["x"]);
      st = await status(admin, A, true);
      assert.equal(st.account, null);
    });

    it("a reconnect keeps the old refresh token if Google sent no new one, and clears the reconnect flag", async () => {
      await saveNewConnection(admin, A, fresh());
      await admin.from("integration_tokens").update({ meta: { needsReconnect: true } }).eq("user_id", A);
      await saveNewConnection(admin, A, fresh({ refreshToken: null, accessToken: "access-2" }));
      assert.equal((await status(admin, A, true)).needsReconnect, false);
      const t = await accessToken(admin, A, async () => {
        throw new Error("should not refresh");
      }, NOW);
      assert.equal(t, "access-2");
    });
  });

  describe("access tokens", () => {
    it("uses the stored token while it is still valid", async () => {
      await saveNewConnection(admin, A, fresh());
      let called = 0;
      const t = await accessToken(admin, A, async () => (called++, fresh()), NOW);
      assert.equal(t, "access-1");
      assert.equal(called, 0);
    });

    it("refreshes an expired token once, however many callers ask at the same moment", async () => {
      await saveNewConnection(admin, A, fresh({ expiresAt: NOW - 1000 }));
      let called = 0;
      const refresh = async () => {
        called++;
        await new Promise((r) => setTimeout(r, 20));
        return fresh({ accessToken: "access-NEW", expiresAt: NOW + 3_600_000 });
      };
      const got = await Promise.all(Array.from({ length: 5 }, () => accessToken(admin, A, refresh, NOW)));
      assert.deepEqual([...new Set(got)], ["access-NEW"]);
      assert.equal(called, 1);
      assert.ok(!JSON.stringify(await tokenRow()).includes("access-NEW"), "the refreshed token is stored encrypted too");
      assert.equal(await accessToken(admin, A, refresh, NOW), "access-NEW"); // now served from storage
      assert.equal(called, 1);
    });

    it("when Google says the grant is gone, it flags a reconnect and stops asking", async () => {
      await saveNewConnection(admin, A, fresh({ expiresAt: NOW - 1000 }));
      let called = 0;
      const dead = async () => {
        called++;
        throw new GoogleOAuthError("revoked", 400, "invalid_grant");
      };
      await assert.rejects(() => accessToken(admin, A, dead, NOW), GoogleAuthExpiredError);
      assert.equal((await status(admin, A, true)).needsReconnect, true);
      await assert.rejects(() => accessToken(admin, A, dead, NOW), GoogleAuthExpiredError);
      assert.equal(called, 1, "no hammering Google with a dead token");
    });

    it("a temporary Google outage is not mistaken for a revoked grant", async () => {
      await saveNewConnection(admin, A, fresh({ expiresAt: NOW - 1000 }));
      await assert.rejects(() => accessToken(admin, A, async () => { throw new GoogleOAuthError("down", 503, "backend_error"); }, NOW), GoogleOAuthError);
      assert.equal((await status(admin, A, true)).needsReconnect, false);
    });

    it("is not connected when there is no row", async () => {
      await assert.rejects(() => accessToken(admin, A, async () => fresh(), NOW), NotConnectedError);
    });
  });

  describe("syncing for a user", () => {
    it("creates the Orbit calendar, fills it, and records the result", async () => {
      await saveNewConnection(admin, A, fresh({ expiresAt: Date.now() + 3_600_000 }), "me@example.com");
      await addTask(A, "11111111-aaaa-4aaa-8aaa-000000000001", "Pay bill", "2026-10-23 17:30");
      const s = await syncUser(admin, A, { nexus: NEXUS, now: NOW });
      assert.equal(s.created, 2);
      const st = await status(admin, A, true);
      assert.ok(st.calendarId);
      assert.equal(st.lastSync?.created, 2);
      assert.ok(st.lastSyncedAtMs);
      assert.equal(google.live(st.calendarId as string).length, 2);
    });

    it("a second sync is a no-op", async () => {
      await saveNewConnection(admin, A, fresh({ expiresAt: Date.now() + 3_600_000 }));
      await syncUser(admin, A, { nexus: NEXUS, now: NOW });
      const s = await syncUser(admin, A, { nexus: NEXUS, now: NOW });
      assert.deepEqual([s.created, s.updated, s.removed], [0, 0, 0]);
    });

    it("a task moved in Google is written back to the database", async () => {
      await saveNewConnection(admin, A, fresh({ expiresAt: Date.now() + 3_600_000 }));
      const tid = "11111111-aaaa-4aaa-8aaa-000000000002";
      await addTask(A, tid, "Meet Rahul", "2026-10-23 17:30");
      await syncUser(admin, A, { nexus: NEXUS, now: NOW });
      const cal = (await status(admin, A, true)).calendarId as string;
      google.userEdits(cal, eventIdFor(`task:${tid}`), { start: { dateTime: "2026-10-25T10:00:00+05:30" }, end: { dateTime: "2026-10-25T10:30:00+05:30" } });
      const s = await syncUser(admin, A, { nexus: NEXUS, now: NOW });
      assert.equal(s.moved, 1);
      const task = (await rows("tasks")).find((t) => t.id === tid);
      assert.equal(Date.parse(task?.due_at as string), ist("2026-10-25 10:00"));
    });

    it("only ever touches the signed-in user's own tasks", async () => {
      await saveNewConnection(admin, A, fresh({ expiresAt: Date.now() + 3_600_000 }));
      await addTask(B, "22222222-bbbb-4bbb-8bbb-000000000001", "Someone else's secret task", "2026-10-23 17:30");
      await syncUser(admin, A, { nexus: NEXUS, now: NOW });
      const cal = (await status(admin, A, true)).calendarId as string;
      assert.ok(!google.live(cal).some((e) => String(e.summary).includes("secret")));
    });

    it("surfaces a clear, friendly failure when the Calendar API is switched off", async () => {
      await saveNewConnection(admin, A, fresh({ expiresAt: Date.now() + 3_600_000 }));
      google.failNext(403, 1, "accessNotConfigured");
      const err = await syncUser(admin, A, { nexus: NEXUS, now: NOW }).catch((e) => e);
      assert.ok(err instanceof GoogleApiError);
      assert.equal(friendlyError(err).kind, "setup");
      assert.match(friendlyError(err).message, /Google Calendar API/);
    });

    it("never echoes tokens in an error message", () => {
      const f = friendlyError(new GoogleOAuthError("Google sign-in failed: invalid_grant", 400, "invalid_grant"));
      assert.ok(!/token|secret/i.test(f.message));
    });
  });

  describe("the scheduler", () => {
    it("syncs users who are due, skips recent and reconnect-needed ones, and isolates failures", async () => {
      // A: never synced. B: synced a minute ago. C: needs reconnect.
      const C = "33333333-3333-3333-3333-333333333333";
      await saveNewConnection(admin, A, fresh({ expiresAt: Date.now() + 3_600_000 }));
      await saveNewConnection(admin, B, fresh({ expiresAt: Date.now() + 3_600_000 }));
      await saveNewConnection(admin, C, fresh({ expiresAt: Date.now() + 3_600_000 }));
      await admin.from("integration_tokens").update({ last_synced_at: new Date(NOW - 60_000).toISOString() }).eq("user_id", B);
      await admin.from("integration_tokens").update({ meta: { needsReconnect: true } }).eq("user_id", C);
      const r = await syncDueUsers(admin, 12 * 60_000, NOW, { nexus: NEXUS });
      assert.deepEqual(r, { synced: 1, failed: 0 });
      assert.ok((await status(admin, A, true)).lastSyncedAtMs);
      assert.equal((await status(admin, B, true)).lastSync, null);
    });

    it("one user's failure does not stop the next", async () => {
      await saveNewConnection(admin, A, fresh({ expiresAt: Date.now() + 3_600_000 }));
      await saveNewConnection(admin, B, fresh({ expiresAt: Date.now() + 3_600_000 }));
      google.failNext(500, 5); // exhausts the retries of whichever user goes first
      const r = await syncDueUsers(admin, 0, NOW, { nexus: NEXUS });
      assert.equal(r.failed + r.synced, 2);
      assert.ok(r.synced >= 1, "the other user still synced");
    });
  });

  describe("reading your other Google calendars", () => {
    const setup = async () => {
      await saveNewConnection(admin, A, fresh({ expiresAt: Date.now() + 3_600_000 }));
      await syncUser(admin, A, { nexus: NEXUS, now: NOW }); // creates the Orbit calendar
      google.addCalendar({ id: "work@example.com", summary: "Work", selected: true, backgroundColor: "#0000ff", accessRole: "owner" });
      google.userAdds("me@example.com", { id: "p1", status: "confirmed", summary: "Dentist", start: { dateTime: "2026-10-22T16:00:00+05:30" }, end: { dateTime: "2026-10-22T17:00:00+05:30" } });
      google.userAdds("work@example.com", { id: "w1", status: "confirmed", summary: "Standup", start: { dateTime: "2026-10-22T10:00:00+05:30" }, end: { dateTime: "2026-10-22T10:15:00+05:30" } });
    };

    it("returns events from other calendars, but not Orbit's own copies", async () => {
      await setup();
      const r = await readGoogleEvents(admin, A, "2026-10-19", "2026-11-30");
      assert.equal(r.status, "ok");
      assert.deepEqual(r.events.map((e) => e.course).sort(), ["Dentist", "Standup"]);
      assert.ok(r.events.every((e) => e.source === "google"));
    });

    it("never shows an Orbit-managed calendar back to you, even a stray copy that isn't the stored one", async () => {
      await setup();
      google.addCalendar({ id: "orbit-copy@group.calendar.google.com", summary: "Orbit", description: CALENDAR_DESCRIPTION, selected: true, accessRole: "owner" });
      google.userAdds("orbit-copy@group.calendar.google.com", { id: "dup1", status: "confirmed", summary: "AI with Mihirr Sose", start: { dateTime: "2026-10-22T09:30:00+05:30" }, end: { dateTime: "2026-10-22T11:00:00+05:30" } });
      dropCaches(A);
      const r = await readGoogleEvents(admin, A, "2026-10-19", "2026-11-30");
      assert.ok(!r.events.some((e) => e.course === "AI with Mihirr Sose"));
      assert.deepEqual(r.events.map((e) => e.course).sort(), ["Dentist", "Standup"]);
    });

    it("hides calendars you switch off", async () => {
      await setup();
      await savePrefs(admin, A, { classes: true, deadlines: true, tasks: true, classReminder: 15, hiddenCalendars: ["work@example.com"] });
      const r = await readGoogleEvents(admin, A, "2026-10-19", "2026-11-30");
      assert.deepEqual(r.events.map((e) => e.course), ["Dentist"]);
    });

    it("caches briefly, so flicking between weeks doesn't hammer Google", async () => {
      await setup();
      await readGoogleEvents(admin, A, "2026-10-19", "2026-11-30");
      google.calls.length = 0;
      await readGoogleEvents(admin, A, "2026-10-19", "2026-11-30");
      assert.equal(google.calls.length, 0);
    });

    it("says 'off' when not connected and 'reconnect' when the grant is dead", async () => {
      assert.equal((await readGoogleEvents(admin, A, "2026-10-19", "2026-11-30")).status, "off");
      await saveNewConnection(admin, A, fresh());
      await admin.from("integration_tokens").update({ meta: { needsReconnect: true } }).eq("user_id", A);
      assert.equal((await readGoogleEvents(admin, A, "2026-10-19", "2026-11-30")).status, "reconnect");
    });

    it("a Google failure becomes a status, not an exception", async () => {
      await saveNewConnection(admin, A, fresh({ expiresAt: Date.now() + 3_600_000 }));
      google.failNext(500, 10);
      const r = await readGoogleEvents(admin, A, "2026-10-19", "2026-11-30");
      assert.equal(r.status, "error");
      assert.deepEqual(r.events, []);
    });
  });

  describe("disconnecting", () => {
    it("removes the stored connection and leaves the Orbit calendar in Google", async () => {
      await saveNewConnection(admin, A, fresh({ expiresAt: Date.now() + 3_600_000 }));
      await syncUser(admin, A, { nexus: NEXUS, now: NOW });
      const cal = (await status(admin, A, true)).calendarId as string;
      await disconnect(admin, A);
      assert.equal(await tokenRow(), undefined);
      assert.equal((await status(admin, A, true)).connected, false);
      assert.ok(google.calendars.has(cal), "the calendar and its events are left for you");
    });
  });
});
