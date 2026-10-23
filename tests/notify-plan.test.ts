import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isQuiet, MAX_PER_RUN, planNotifications, remindAtFor, type AnnouncementIn, type AssignmentIn, type Settings, type TaskIn } from "../lib/notify/plan";

/** India time, e.g. ist("2026-10-21 14:30") */
const ist = (s: string) => Date.parse(s.replace(" ", "T") + ":00+05:30");
const iso = (s: string) => new Date(ist(s)).toISOString();

const SETTINGS: Settings = {
  enabled: { assignment: true, task: true, announcement: true, digest: true },
  quietStart: 23,
  quietEnd: 7,
  announcementsCursor: "2026-10-20T00:00:00.000Z",
};
const settings = (over: Partial<Settings> = {}): Settings => ({ ...SETTINGS, ...over, enabled: { ...SETTINGS.enabled, ...(over.enabled ?? {}) } });

const assignment = (id: string, due: string | null, over: Partial<AssignmentIn> = {}): AssignmentIn => ({
  id, title: `Assignment ${id}`, course: "Data 102", dueAt: due ? iso(due) : null, submitted: false, ...over,
});
const task = (id: string, over: Partial<TaskIn> = {}): TaskIn => ({
  id, title: `Task ${id}`, due_at: null, due_has_time: false, remind_at: null, reminded_at: null, done_at: null, ...over,
});

const plan = (nowStr: string, a: Partial<Parameters<typeof planNotifications>[0]> = {}) =>
  planNotifications({
    nowMs: ist(nowStr), assignments: [], tasks: [], announcements: [], settings: SETTINGS, sentRefs: new Set(), ...a,
  });

describe("quiet hours", () => {
  it("wraps past midnight", () => {
    for (const t of ["2026-10-21 23:00", "2026-10-21 23:59", "2026-10-22 00:30", "2026-10-22 06:59"]) assert.equal(isQuiet(ist(t), 23, 7), true, t);
    for (const t of ["2026-10-22 07:00", "2026-10-21 12:00", "2026-10-21 22:59"]) assert.equal(isQuiet(ist(t), 23, 7), false, t);
  });
  it("handles a same-day range and an empty one", () => {
    assert.equal(isQuiet(ist("2026-10-21 14:00"), 13, 15), true);
    assert.equal(isQuiet(ist("2026-10-21 15:00"), 13, 15), false);
    assert.equal(isQuiet(ist("2026-10-21 03:00"), 5, 5), false);
  });
  it("sends nothing while quiet, and keeps the announcement cursor where it was", () => {
    const r = plan("2026-10-22 02:00", {
      assignments: [assignment("a", "2026-10-22 03:00")],
      tasks: [task("t", { remind_at: iso("2026-10-22 01:00") })],
      announcements: [{ id: "n", title: "x", postedAt: iso("2026-10-22 01:30") }],
    });
    assert.deepEqual(r.notifications, []);
    assert.equal(r.quiet, true);
    assert.equal(r.announcementsCursor, SETTINGS.announcementsCursor);
  });
  it("sends what is still relevant once quiet hours end", () => {
    const r = plan("2026-10-22 07:00", { assignments: [assignment("a", "2026-10-22 08:00")] });
    assert.equal(r.notifications.length, 1);
    assert.match(r.notifications[0].title, /^Due in 1h:/);
  });
});

describe("assignment alerts", () => {
  const one = (now: string, due: string, sent: string[] = [], over: Partial<AssignmentIn> = {}) =>
    // The morning digest may legitimately fire too; these tests are about the assignment alerts only.
    plan(now, { assignments: [assignment("a", due, over)], sentRefs: new Set(sent) }).notifications.filter((n) => n.kind === "assignment");

  it("stays silent until 24 hours before", () => {
    assert.equal(one("2026-10-20 10:00", "2026-10-21 23:59").length, 0);
  });
  it("sends the day-before alert", () => {
    const n = one("2026-10-20 23:00", "2026-10-21 23:59");
    // 23:00 is quiet; use the morning instead
    assert.equal(n.length, 0);
    const m = one("2026-10-21 08:00", "2026-10-22 07:59");
    assert.equal(m.length, 1);
    assert.equal(m[0].ref, "assignment:a:24h");
  });
  it("sends the 3 hour and 1 hour alerts as the deadline closes in", () => {
    assert.equal(one("2026-10-21 21:30", "2026-10-21 23:59", ["assignment:a:24h"])[0].ref, "assignment:a:3h");
    assert.equal(one("2026-10-21 22:59", "2026-10-21 23:59", ["assignment:a:24h", "assignment:a:3h"])[0].ref, "assignment:a:1h");
  });
  it("sends only the most urgent alert, not three at once, if the app was offline", () => {
    const n = one("2026-10-21 22:30", "2026-10-21 23:00");
    assert.equal(n.length, 1);
    assert.equal(n[0].ref, "assignment:a:1h");
  });
  it("never repeats an alert that already went out", () => {
    assert.equal(one("2026-10-21 21:30", "2026-10-21 23:59", ["assignment:a:3h"]).length, 0);
  });
  it("never sends a looser alert after a tighter one", () => {
    assert.equal(one("2026-10-21 21:30", "2026-10-21 23:59", ["assignment:a:1h"]).length, 0);
  });
  it("ignores submitted, overdue and undated assignments", () => {
    assert.equal(one("2026-10-21 21:30", "2026-10-21 23:59", [], { submitted: true }).length, 0);
    assert.equal(one("2026-10-22 10:00", "2026-10-21 23:59").length, 0);
    assert.equal(plan("2026-10-21 21:30", { assignments: [assignment("a", null)] }).notifications.length, 0);
  });
  it("can be switched off", () => {
    const r = plan("2026-10-21 21:30", { assignments: [assignment("a", "2026-10-21 23:59")], settings: settings({ enabled: { assignment: false } as Settings["enabled"] }) });
    assert.equal(r.notifications.length, 0);
  });
  it("words the title with the real time left and includes course and deadline", () => {
    const n = one("2026-10-21 21:30", "2026-10-21 23:59")[0];
    assert.equal(n.title, "Due in 2h 29m: Assignment a");
    assert.equal(n.body, "Data 102 · Wed, 21 Oct, 11:59 pm");
    assert.equal(n.kind, "assignment");
  });
  it("handles several assignments independently", () => {
    const r = plan("2026-10-21 21:30", { assignments: [assignment("a", "2026-10-21 23:59"), assignment("b", "2026-10-21 22:30"), assignment("c", "2026-10-25 12:00")] });
    assert.deepEqual(r.notifications.map((n) => n.ref).sort(), ["assignment:a:3h", "assignment:b:1h"]);
  });
});

describe("personal task reminders", () => {
  const NOW = "2026-10-21 17:00";
  it("fires a due reminder once and reports which task to stamp", () => {
    const r = plan(NOW, { tasks: [task("t", { remind_at: iso("2026-10-21 16:55"), due_at: iso("2026-10-21 17:00"), due_has_time: true })] });
    assert.equal(r.notifications.length, 1);
    assert.equal(r.notifications[0].title, "Task t");
    assert.equal(r.notifications[0].body, "Due Wed, 21 Oct, 5:00 pm");
    assert.deepEqual(r.remindedTaskIds, ["t"]);
  });
  it("waits for a reminder in the future", () => {
    assert.equal(plan(NOW, { tasks: [task("t", { remind_at: iso("2026-10-21 17:30") })] }).notifications.length, 0);
  });
  it("skips done, already-reminded and stale tasks", () => {
    const r = plan(NOW, {
      tasks: [
        task("done", { remind_at: iso("2026-10-21 16:00"), done_at: iso("2026-10-21 16:30") }),
        task("sent", { remind_at: iso("2026-10-21 16:00"), reminded_at: iso("2026-10-21 16:01") }),
        task("stale", { remind_at: iso("2026-10-18 16:00") }),
      ],
    });
    assert.equal(r.notifications.length, 0);
  });
  it("shows only the date for an all-day task", () => {
    const r = plan(NOW, { tasks: [task("t", { remind_at: iso("2026-10-21 09:00"), due_at: iso("2026-10-21 23:59") })] });
    assert.equal(r.notifications[0].body, "Due Wed, 21 Oct");
  });
  it("says just Reminder when there is no due date", () => {
    assert.equal(plan(NOW, { tasks: [task("t", { remind_at: iso("2026-10-21 16:00") })] }).notifications[0].body, "Reminder");
  });
  it("can be switched off", () => {
    assert.equal(plan(NOW, { tasks: [task("t", { remind_at: iso("2026-10-21 16:00") })], settings: settings({ enabled: { task: false } as Settings["enabled"] }) }).notifications.length, 0);
  });
});

describe("Nexus announcements", () => {
  const ann = (id: string, at: string, title = `Announcement ${id}`): AnnouncementIn => ({ id, title, postedAt: iso(at) });

  it("on the very first run only sets the cursor, so old posts never flood the phone", () => {
    const r = plan("2026-10-21 10:00", { settings: settings({ announcementsCursor: null }), announcements: [ann("1", "2026-10-19 10:00"), ann("2", "2026-10-20 10:00")] });
    assert.equal(r.notifications.length, 0);
    assert.equal(r.announcementsCursor, iso("2026-10-20 10:00"));
  });
  it("still handles assignments and tasks on that first run", () => {
    const r = plan("2026-10-21 21:30", { settings: settings({ announcementsCursor: null }), assignments: [assignment("a", "2026-10-21 23:59")] });
    assert.equal(r.notifications.length, 1);
  });
  it("sends only posts newer than the cursor and advances it", () => {
    const r = plan("2026-10-21 10:00", {
      settings: settings({ announcementsCursor: iso("2026-10-20 12:00") }),
      announcements: [ann("old", "2026-10-20 09:00"), ann("new", "2026-10-21 09:30")],
    });
    assert.deepEqual(r.notifications.map((n) => n.title), ["Announcement new"]);
    assert.equal(r.announcementsCursor, iso("2026-10-21 09:30"));
  });
  it("groups a burst into one notification", () => {
    const r = plan("2026-10-21 10:00", {
      settings: settings({ announcementsCursor: iso("2026-10-20 12:00") }),
      announcements: ["1", "2", "3", "4", "5"].map((i, n) => ann(i, `2026-10-21 0${n + 1}:00`)),
    });
    assert.equal(r.notifications.length, 1);
    assert.equal(r.notifications[0].title, "5 new announcements on Nexus");
  });
  it("does not resend one already logged", () => {
    const r = plan("2026-10-21 10:00", {
      settings: settings({ announcementsCursor: iso("2026-10-20 12:00") }),
      announcements: [ann("x", "2026-10-21 09:00")],
      sentRefs: new Set(["announcement:x"]),
    });
    assert.equal(r.notifications.length, 0);
  });
  it("keeps the cursor when the cap pushes an announcement out", () => {
    const start = iso("2026-10-20 12:00");
    const r = plan("2026-10-21 21:30", {
      settings: settings({ announcementsCursor: start }),
      assignments: ["a", "b", "c", "d", "e"].map((id) => assignment(id, "2026-10-21 23:30")),
      announcements: [ann("late", "2026-10-21 21:00")],
    });
    assert.equal(r.notifications.length, MAX_PER_RUN);
    assert.ok(r.notifications.every((n) => n.kind === "assignment"));
    assert.equal(r.announcementsCursor, start, "the dropped announcement must still be sent next run");
  });
});

describe("morning digest", () => {
  const tasks = [task("t1", { due_at: iso("2026-10-21 18:00"), due_has_time: true }), task("t2", { due_at: iso("2026-10-21 23:59") })];
  it("summarises tasks due today and assignments due within 48 hours", () => {
    const r = plan("2026-10-21 08:15", { tasks, assignments: [assignment("a", "2026-10-22 18:00")] });
    const d = r.notifications.find((n) => n.kind === "digest");
    assert.equal(d?.ref, "digest:2026-10-21");
    assert.equal(d?.title, "Today: 2 tasks and 1 assignment due soon");
  });
  it("only sends in the morning window, and only once a day", () => {
    assert.equal(plan("2026-10-21 07:30", { tasks }).notifications.length, 0);
    assert.equal(plan("2026-10-21 12:00", { tasks }).notifications.length, 0);
    assert.equal(plan("2026-10-21 09:00", { tasks, sentRefs: new Set(["digest:2026-10-21"]) }).notifications.length, 0);
  });
  it("stays quiet when there is nothing to say", () => {
    assert.equal(plan("2026-10-21 09:00", { tasks: [task("later", { due_at: iso("2026-10-30 12:00") })], assignments: [assignment("a", "2026-10-30 12:00")] }).notifications.length, 0);
  });
  it("counts overdue open tasks, not done ones", () => {
    const r = plan("2026-10-21 09:00", { tasks: [task("old", { due_at: iso("2026-10-18 12:00") }), task("fin", { due_at: iso("2026-10-21 12:00"), done_at: iso("2026-10-21 08:00") })] });
    assert.equal(r.notifications[0].title, "Today: 1 task");
  });
  it("can be switched off", () => {
    assert.equal(plan("2026-10-21 09:00", { tasks, settings: settings({ enabled: { digest: false } as Settings["enabled"] }) }).notifications.length, 0);
  });
});

describe("working out a task's reminder time", () => {
  const NOW = ist("2026-10-20 12:00");
  it("uses 9 am India time for an all-day task", () => {
    assert.equal(remindAtFor({ dueAt: iso("2026-10-22 23:59"), hasTime: false, lead: "at", nowMs: NOW }), iso("2026-10-22 09:00"));
    assert.equal(remindAtFor({ dueAt: iso("2026-10-22 23:59"), hasTime: false, lead: "1d", nowMs: NOW }), iso("2026-10-21 09:00"));
  });
  it("counts back from the exact time for a timed task", () => {
    const due = iso("2026-10-21 17:00");
    assert.equal(remindAtFor({ dueAt: due, hasTime: true, lead: "at", nowMs: NOW }), due);
    assert.equal(remindAtFor({ dueAt: due, hasTime: true, lead: "15m", nowMs: NOW }), iso("2026-10-21 16:45"));
    assert.equal(remindAtFor({ dueAt: due, hasTime: true, lead: "1h", nowMs: NOW }), iso("2026-10-21 16:00"));
    assert.equal(remindAtFor({ dueAt: due, hasTime: true, lead: "1d", nowMs: NOW }), iso("2026-10-20 17:00"));
  });
  it("returns nothing for no reminder, no due date, or a moment already past", () => {
    assert.equal(remindAtFor({ dueAt: iso("2026-10-22 12:00"), hasTime: true, lead: "none", nowMs: NOW }), null);
    assert.equal(remindAtFor({ dueAt: null, hasTime: false, lead: "at", nowMs: NOW }), null);
    assert.equal(remindAtFor({ dueAt: iso("2026-10-20 11:00"), hasTime: true, lead: "at", nowMs: NOW }), null);
    assert.equal(remindAtFor({ dueAt: iso("2026-10-21 17:00"), hasTime: true, lead: "1d", nowMs: ist("2026-10-20 18:00") }), null);
  });
});
