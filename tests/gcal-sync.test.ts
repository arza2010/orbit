import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { GoogleApiError, GoogleCalendarApi, pool } from "../lib/gcal/api";
import { CALENDAR_DESCRIPTION } from "../lib/gcal/calendars";
import { DEFAULT_PREFS, eventIdFor, type Prefs, type TaskLite } from "../lib/gcal/plan";
import { runGoogleSync, type SyncDeps } from "../lib/gcal/sync";
import type { Assignment, ScheduleEvent } from "../lib/nexus";
import { startFakeGoogle } from "./support/fake-google";

const ist = (s: string) => Date.parse(`${s.replace(" ", "T")}:00+05:30`);
const NOW = ist("2026-10-21 11:25");

const cls = (id: string, start: string, end: string, over: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  id, title: "AI with Mihirr Sose", type: "session", status: "scheduled", cancelled: false, day: "", time: "",
  start: `${start.replace(" ", "T")}:00+05:30`, end: `${end.replace(" ", "T")}:00+05:30`, course: "AI with Mihirr Sose", term: "Term 2",
  instructor: "Mihirr Sose", instructorLinkedIn: null, room: "Delta Classroom", meetingLink: null, attendanceRequired: true,
  notes: null, attachments: [], ...over,
});
const due = (id: string, at: string): Assignment => ({
  id, title: "Mid-Term Assignment", course: "Data 102", dueAt: `${at.replace(" ", "T")}:00+05:30`, cutoffAt: null, allowLate: false,
  maxMarks: "20", isGroup: false, submissionStatus: "not_submitted",
});
const task = (id: string, over: Partial<TaskLite> = {}): TaskLite => ({
  id, title: "Pay electricity bill", notes: null, due_at: new Date(ist("2026-10-23 17:30")).toISOString(), due_has_time: true,
  remind_at: null, course: null, priority: 0, done_at: null, ...over,
});

describe("Google Calendar sync against a fake Google", () => {
  let google: Awaited<ReturnType<typeof startFakeGoogle>>;
  before(async () => {
    google = await startFakeGoogle();
  });
  after(() => google.close());
  beforeEach(() => google.reset());

  // The world as Nexus and the database currently have it. Tests change these between syncs.
  let schedule: ScheduleEvent[];
  let assignments: Assignment[];
  let tasks: TaskLite[];
  let prefs: Prefs;
  let calendarId: string | null;
  let moved: TaskLite[];

  beforeEach(() => {
    schedule = [cls("c1", "2026-10-22 09:30", "2026-10-22 11:00"), cls("c2", "2026-10-23 09:30", "2026-10-23 11:00")];
    assignments = [due("a1", "2026-10-25 23:59")];
    tasks = [task("t1")];
    prefs = { ...DEFAULT_PREFS };
    calendarId = null;
    moved = [];
  });

  const sync = (extra: Partial<SyncDeps> = {}) =>
    runGoogleSync({
      api: new GoogleCalendarApi(async () => "token", { base: google.base, sleep: async () => {} }),
      calendarId,
      prefs,
      now: NOW,
      nexus: { schedule: async () => schedule, assignments: async () => assignments },
      tasks: {
        open: async () => tasks.filter((t) => !t.done_at),
        async applyMoves(rows) {
          moved.push(...rows);
          for (const r of rows) tasks = tasks.map((t) => (t.id === r.id ? { ...t, due_at: r.due_at, due_has_time: r.due_has_time, remind_at: r.remind_at } : t));
        },
      },
      saveCalendarId: async (id) => {
        calendarId = id;
      },
      ...extra,
    });

  const writes = () => google.calls.filter((c) => ["POST", "PATCH", "DELETE"].includes(c.method) && c.path.includes("/events"));
  const live = () => google.live(calendarId as string);

  it("creates an Orbit calendar and fills it with classes, the deadline and the task", async () => {
    const s = await sync();
    assert.equal(s.created, 4);
    assert.equal(s.errors, 0);
    assert.ok(calendarId);
    assert.equal(google.calendars.get(calendarId as string)?.summary, "Orbit");
    assert.deepEqual(live().map((e) => e.summary).sort(), ["AI with Mihirr Sose", "AI with Mihirr Sose", "Due: Mid-Term Assignment", "Task: Pay electricity bill"]);
  });

  it("is idempotent: a second sync changes nothing and writes nothing", async () => {
    await sync();
    google.calls.length = 0;
    const s = await sync();
    assert.deepEqual([s.created, s.updated, s.removed, s.moved, s.unchanged], [0, 0, 0, 0, 4]);
    assert.equal(writes().length, 0);
    assert.equal(live().length, 4);
  });

  it("a cancelled class disappears from Google, the rest stay", async () => {
    await sync();
    schedule = [schedule[0], { ...schedule[1], cancelled: true }];
    const s = await sync();
    assert.equal(s.removed, 1);
    assert.equal(live().length, 3);
    assert.ok(!live().some((e) => e.id === eventIdFor("class:c2")));
  });

  it("a class that moves is updated in place, not duplicated", async () => {
    await sync();
    schedule = [cls("c1", "2026-10-22 14:00", "2026-10-22 15:30"), schedule[1]];
    const s = await sync();
    assert.equal(s.updated, 1);
    assert.equal(s.created, 0);
    const ev = live().find((e) => e.id === eventIdFor("class:c1"));
    assert.equal((ev?.start as { dateTime: string }).dateTime, "2026-10-22T14:00:00+05:30");
    assert.equal(live().length, 4);
  });

  it("an event you delete in Google stays deleted", async () => {
    await sync();
    google.userDeletes(calendarId as string, eventIdFor("class:c1"));
    const s1 = await sync();
    assert.equal(s1.created, 0);
    assert.equal(s1.deletedInGoogle, 1);
    const s2 = await sync();
    assert.equal(s2.created, 0);
    assert.ok(!live().some((e) => e.id === eventIdFor("class:c1")));
  });

  it("a task you complete in Orbit is removed from Google; a new one is added", async () => {
    await sync();
    tasks = [task("t1", { done_at: "2026-10-21T06:00:00Z" }), task("t2", { title: "Meet Rahul", due_at: new Date(ist("2026-10-24 18:00")).toISOString() })];
    const s = await sync();
    assert.equal(s.removed, 1);
    assert.equal(s.created, 1);
    assert.ok(live().some((e) => e.summary === "Task: Meet Rahul"));
    assert.ok(!live().some((e) => e.summary === "Task: Pay electricity bill"));
  });

  it("dragging a task to a new time in Google updates the task, and Orbit then agrees with Google", async () => {
    await sync();
    const id = eventIdFor("task:t1");
    google.userEdits(calendarId as string, id, { start: { dateTime: "2026-10-24T09:00:00+05:30" }, end: { dateTime: "2026-10-24T09:30:00+05:30" } });
    const s = await sync();
    assert.equal(s.moved, 1);
    assert.equal(moved[0].due_at, "2026-10-24T09:00:00+05:30");
    assert.equal(tasks[0].due_at, "2026-10-24T09:00:00+05:30");
    // The event keeps the new time (Orbit did not drag it back) and now records it as the synced time.
    const ev = live().find((e) => e.id === id) as unknown as { start: { dateTime: string }; extendedProperties: { private: Record<string, string> } };
    assert.equal(Date.parse(ev.start.dateTime), ist("2026-10-24 09:00"));
    assert.equal(ev.extendedProperties.private.orbitStart, String(ist("2026-10-24 09:00")));
    google.calls.length = 0;
    const again = await sync();
    assert.deepEqual([again.moved, again.updated, again.created], [0, 0, 0]);
    assert.equal(writes().length, 0);
  });

  it("changing a task's time in Orbit moves its Google event", async () => {
    await sync();
    tasks = [task("t1", { due_at: new Date(ist("2026-10-23 19:00")).toISOString() })];
    const s = await sync();
    assert.equal(s.updated, 1);
    assert.equal(s.moved, 0);
    const ev = live().find((e) => e.id === eventIdFor("task:t1")) as unknown as { start: { dateTime: string } };
    assert.equal(Date.parse(ev.start.dateTime), ist("2026-10-23 19:00"));
  });

  it("never touches events that are not Orbit's, even inside the Orbit calendar", async () => {
    await sync();
    google.userAdds(calendarId as string, { id: "manual1", status: "confirmed", summary: "Added by hand", start: { dateTime: "2026-10-22T20:00:00+05:30" }, end: { dateTime: "2026-10-22T21:00:00+05:30" } });
    schedule = [];
    assignments = [];
    tasks = [];
    await sync();
    assert.deepEqual(live().map((e) => e.id), ["manual1"]);
  });

  it("an event you dragged far outside the window is left alone, not duplicated", async () => {
    await sync();
    google.userEdits(calendarId as string, eventIdFor("class:c1"), { start: { dateTime: "2027-03-01T09:00:00+05:30" }, end: { dateTime: "2027-03-01T10:00:00+05:30" } });
    const s = await sync();
    assert.equal(s.errors, 0);
    assert.equal(s.created, 0);
    assert.equal(s.deletedInGoogle, 1);
    assert.equal(live().filter((e) => e.id === eventIdFor("class:c1")).length, 1);
  });

  it("recreates the calendar if you deleted it in Google", async () => {
    await sync();
    const old = calendarId;
    google.calendars.delete(old as string);
    const s = await sync();
    assert.notEqual(calendarId, old);
    assert.equal(s.created, 4);
    assert.equal(live().length, 4);
  });

  describe("there is only ever one Orbit calendar", () => {
    const orbitCals = () => [...google.calendars.values()].filter((c) => c.summary === "Orbit");

    it("adopts an existing Orbit calendar instead of making a second one", async () => {
      google.addCalendar({ id: "existing@group.calendar.google.com", summary: "Orbit", description: CALENDAR_DESCRIPTION, selected: true, accessRole: "owner" });
      await sync(); // calendarId is null, as after a reconnect
      assert.equal(orbitCals().length, 1);
      assert.equal(calendarId, "existing@group.calendar.google.com");
      assert.equal(live().length, 4);
    });

    it("two first syncs racing each other end with exactly one calendar and no duplicate events", async () => {
      let idA: string | null = null;
      let idB: string | null = null;
      const [a, b] = await Promise.all([
        sync({ calendarId: null, saveCalendarId: async (id) => void (idA = id) }),
        sync({ calendarId: null, saveCalendarId: async (id) => void (idB = id) }),
      ]);
      assert.equal(a.errors + b.errors, 0);
      assert.equal(orbitCals().length, 1, "the loser removes its own calendar");
      const survivor = orbitCals()[0].id;
      assert.equal(idA, survivor);
      assert.equal(idB, survivor);
      assert.equal(google.live(survivor).length, 4, "each event exists once");
    });

    it("cleans up a stray extra Orbit calendar that holds only Orbit's own events", async () => {
      await sync();
      const real = calendarId as string;
      google.addCalendar({ id: "stray@group.calendar.google.com", summary: "Orbit", description: CALENDAR_DESCRIPTION, selected: true, accessRole: "owner" });
      google.userAdds("stray@group.calendar.google.com", { id: "orbitcopy", status: "confirmed", summary: "AI", start: { dateTime: "2026-10-22T09:30:00+05:30" }, end: { dateTime: "2026-10-22T11:00:00+05:30" }, extendedProperties: { private: { orbit: "1" } } });
      await sync();
      assert.equal(calendarId, real);
      assert.deepEqual(orbitCals().map((c) => c.id), [real]);
    });

    it("never deletes an extra calendar that contains something of yours", async () => {
      await sync();
      google.addCalendar({ id: "mine@group.calendar.google.com", summary: "Orbit", description: CALENDAR_DESCRIPTION, selected: true, accessRole: "owner" });
      google.userAdds("mine@group.calendar.google.com", { id: "handmade", status: "confirmed", summary: "My own thing", start: { dateTime: "2026-10-22T20:00:00+05:30" }, end: { dateTime: "2026-10-22T21:00:00+05:30" } });
      await sync();
      assert.ok(google.calendars.has("mine@group.calendar.google.com"));
      assert.equal(google.live("mine@group.calendar.google.com").length, 1);
    });

    it("does not touch a calendar you named Orbit yourself (no Orbit marker)", async () => {
      google.addCalendar({ id: "yours@group.calendar.google.com", summary: "Orbit", selected: true, accessRole: "owner" });
      await sync();
      assert.ok(google.calendars.has("yours@group.calendar.google.com"));
      assert.notEqual(calendarId, "yours@group.calendar.google.com");
      assert.equal(google.live("yours@group.calendar.google.com").length, 0);
    });
  });

  it("recovers from a burst of 'Rate Limit Exceeded' without losing events", async () => {
    await sync();
    schedule.push(cls("c3", "2026-10-24 09:30", "2026-10-24 11:00"), cls("c4", "2026-10-25 09:30", "2026-10-25 11:00"));
    google.failNext(403, 5, "rateLimitExceeded");
    const s = await sync();
    assert.equal(s.errors, 0);
    assert.equal(s.created, 2);
  });

  it("switching a source off removes its events", async () => {
    await sync();
    prefs = { ...prefs, classes: false };
    const s = await sync();
    assert.equal(s.removed, 2);
    assert.deepEqual(live().map((e) => e.summary).sort(), ["Due: Mid-Term Assignment", "Task: Pay electricity bill"]);
  });

  it("survives Google rate limiting by retrying", async () => {
    google.failNext(429, 2, "rateLimitExceeded");
    const s = await sync();
    assert.equal(s.errors, 0);
    assert.equal(s.created, 4);
  });

  it("reports an event that fails, and still writes the rest", async () => {
    await sync(); // create the calendar first so only inserts are affected
    schedule.push(cls("c3", "2026-10-24 09:30", "2026-10-24 11:00"), cls("c4", "2026-10-25 09:30", "2026-10-25 11:00"));
    // Fail exactly one of the two new inserts (after the calendar get + list calls).
    const api = new GoogleCalendarApi(async () => "token", { base: google.base, sleep: async () => {}, retries: 0 });
    const real = api.insertEvent.bind(api);
    let n = 0;
    api.insertEvent = async (cal, ev) => {
      if (n++ === 0) throw new GoogleApiError("boom", 500);
      return real(cal, ev);
    };
    const s = await sync({ api });
    assert.equal(s.errors, 1);
    assert.equal(s.created, 1);
    assert.match(s.firstError ?? "", /boom/);
  });

  it("fails loudly (not silently) when Google rejects the request", async () => {
    await assert.rejects(
      async () => {
        google.failNext(403, 1, "accessNotConfigured");
        await sync();
      },
      (e: unknown) => e instanceof GoogleApiError && e.status === 403 && e.reason === "accessNotConfigured",
    );
  });

  it("window: classes more than 45 days away are not pushed", async () => {
    schedule = [cls("far", "2026-12-30 09:30", "2026-12-30 11:00")];
    assignments = [];
    tasks = [];
    const s = await sync();
    assert.equal(s.created, 0);
  });
});

describe("the concurrency helper", () => {
  it("never runs more than n at once and reports each failure", async () => {
    let running = 0;
    let peak = 0;
    const failures = await pool([1, 2, 3, 4, 5, 6, 7, 8], 3, async (i) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      if (i % 4 === 0) throw new Error(`bad ${i}`);
    });
    assert.ok(peak <= 3 && peak >= 2);
    assert.deepEqual(failures.map((f) => f.item).sort(), [4, 8]);
  });
});
