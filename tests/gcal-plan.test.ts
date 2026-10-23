import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Assignment, ScheduleEvent } from "../lib/nexus";
import type { GEvent } from "../lib/gcal/api";
import {
  applyMove,
  buildDesired,
  colorForHue,
  DEFAULT_PREFS,
  detectMoves,
  diff,
  eventIdFor,
  istIso,
  parsePrefs,
  toExisting,
  type Prefs,
  type TaskLite,
} from "../lib/gcal/plan";

const ist = (s: string) => Date.parse(`${s.replace(" ", "T")}:00+05:30`);
const NOW = ist("2026-10-21 11:25");
const FROM = ist("2026-10-21 00:00");
const TO = FROM + 45 * 86_400_000;

const cls = (id: string, start: string, end: string, over: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  id, title: "AI with Mihirr Sose", type: "session", status: "scheduled", cancelled: false, day: "", time: "",
  start: `${start.replace(" ", "T")}:00+05:30`, end: `${end.replace(" ", "T")}:00+05:30`, course: "AI with Mihirr Sose", term: "Term 2",
  instructor: "Mihirr Sose", instructorLinkedIn: null, room: "Delta Classroom", meetingLink: null, attendanceRequired: true,
  notes: null, attachments: [], ...over,
});
const due = (id: string, at: string, over: Partial<Assignment> = {}): Assignment => ({
  id, title: "Mid-Term Assignment", course: "Data 102", dueAt: `${at.replace(" ", "T")}:00+05:30`, cutoffAt: null, allowLate: false,
  maxMarks: "20", isGroup: false, submissionStatus: "not_submitted", ...over,
});
const task = (id: string, over: Partial<TaskLite> = {}): TaskLite => ({
  id, title: "Pay electricity bill", notes: null, due_at: new Date(ist("2026-10-23 17:30")).toISOString(), due_has_time: true,
  remind_at: new Date(ist("2026-10-23 16:30")).toISOString(), course: null, priority: 0, done_at: null, ...over,
});

const build = (o: { schedule?: ScheduleEvent[]; assignments?: Assignment[]; tasks?: TaskLite[]; prefs?: Partial<Prefs> } = {}) =>
  buildDesired({ schedule: o.schedule ?? [], assignments: o.assignments ?? [], tasks: o.tasks ?? [], prefs: { ...DEFAULT_PREFS, ...o.prefs }, fromMs: FROM, toMs: TO });

describe("event ids", () => {
  it("are valid for Google (a-v and 0-9 only), stable, and different per item", () => {
    const a = eventIdFor("class:1");
    assert.match(a, /^[a-v0-9]{5,1024}$/);
    assert.equal(a, eventIdFor("class:1"));
    assert.notEqual(a, eventIdFor("class:2"));
    assert.ok(a.startsWith("orbit"));
  });
});

describe("what should exist in Google", () => {
  it("turns a class into a timed event in India time, with room, instructor and a reminder", () => {
    const [d] = build({ schedule: [cls("c1", "2026-10-22 09:30", "2026-10-22 11:00")] });
    assert.equal(d.kind, "class");
    assert.equal(d.body.summary, "AI with Mihirr Sose");
    assert.equal(d.body.location, "Delta Classroom");
    assert.equal(d.body.start?.dateTime, "2026-10-22T09:30:00+05:30");
    assert.equal(d.body.end?.dateTime, "2026-10-22T11:00:00+05:30");
    assert.equal(d.body.start?.timeZone, "Asia/Kolkata");
    assert.match(d.body.description ?? "", /Mihirr Sose/);
    assert.match(d.body.description ?? "", /Attendance required/);
    assert.deepEqual(d.body.reminders, { useDefault: false, overrides: [{ method: "popup", minutes: 15 }] });
    assert.equal(d.body.extendedProperties?.private?.orbit, "1");
    assert.equal(d.body.extendedProperties?.private?.orbitRef, "class:c1");
    assert.equal(d.body.extendedProperties?.private?.orbitStart, String(ist("2026-10-22 09:30")));
  });

  it("skips cancelled classes, holidays, and anything outside the window", () => {
    const out = build({
      schedule: [
        cls("a", "2026-10-22 09:30", "2026-10-22 11:00", { cancelled: true }),
        cls("b", "2026-10-22 09:30", "2026-10-22 11:00", { type: "holiday" }),
        cls("c", "2026-10-20 09:30", "2026-10-20 11:00"), // yesterday
        cls("d", "2026-12-30 09:30", "2026-12-30 11:00"), // beyond 45 days
        cls("e", "2026-10-22 09:30", "2026-10-22 11:00"),
      ],
    });
    assert.deepEqual(out.map((d) => d.ref), ["class:e"]);
  });

  it("includes non-class events like exams and building time", () => {
    const out = build({ schedule: [cls("x", "2026-10-22 16:00", "2026-10-22 20:00", { type: "event", title: "ILS Building Time", attendanceRequired: false })] });
    assert.equal(out[0].body.summary, "ILS Building Time");
    assert.ok(!(out[0].body.description ?? "").includes("Attendance required"));
  });

  it("class reminder is configurable, and can be off", () => {
    const s = [cls("c1", "2026-10-22 09:30", "2026-10-22 11:00")];
    assert.deepEqual(build({ schedule: s, prefs: { classReminder: 30 } })[0].body.reminders?.overrides, [{ method: "popup", minutes: 30 }]);
    assert.deepEqual(build({ schedule: s, prefs: { classReminder: null } })[0].body.reminders?.overrides, []);
  });

  it("assignments become 'Due:' events with reminders, unless already submitted", () => {
    const out = build({ assignments: [due("a1", "2026-10-25 23:59"), due("a2", "2026-10-25 23:59", { submissionStatus: "submitted" }), due("a3", "2026-10-25 23:59", { dueAt: null })] });
    assert.equal(out.length, 1);
    assert.equal(out[0].body.summary, "Due: Mid-Term Assignment");
    assert.equal(out[0].body.start?.dateTime, "2026-10-25T23:59:00+05:30");
    assert.deepEqual(out[0].body.reminders?.overrides?.map((r) => r.minutes), [180, 60]);
  });

  it("a task with a time is a 30-minute event, its reminder carried over", () => {
    const [d] = build({ tasks: [task("t1")] });
    assert.equal(d.body.summary, "Task: Pay electricity bill");
    assert.equal(d.body.start?.dateTime, "2026-10-23T17:30:00+05:30");
    assert.equal(d.body.end?.dateTime, "2026-10-23T18:00:00+05:30");
    assert.deepEqual(d.body.reminders?.overrides, [{ method: "popup", minutes: 60 }]);
    assert.equal(d.taskId, "t1");
  });

  it("a task with only a date is an all-day event on that day", () => {
    const [d] = build({ tasks: [task("t2", { due_has_time: false, due_at: "2026-10-23T23:59:00+05:30", remind_at: null })] });
    assert.deepEqual(d.body.start, { date: "2026-10-23" });
    assert.deepEqual(d.body.end, { date: "2026-10-24" });
    assert.equal(d.startKey, "2026-10-23");
  });

  it("done tasks, undated tasks and switched-off sources produce nothing", () => {
    assert.equal(build({ tasks: [task("t", { done_at: "2026-10-21T00:00:00Z" })] }).length, 0);
    assert.equal(build({ tasks: [task("t", { due_at: null })] }).length, 0);
    const all = { schedule: [cls("c", "2026-10-22 09:30", "2026-10-22 10:00")], assignments: [due("a", "2026-10-25 12:00")], tasks: [task("t")] };
    assert.equal(build({ ...all, prefs: { classes: false } }).filter((d) => d.kind === "class").length, 0);
    assert.equal(build({ ...all, prefs: { deadlines: false } }).filter((d) => d.kind === "deadline").length, 0);
    assert.equal(build({ ...all, prefs: { tasks: false } }).filter((d) => d.kind === "task").length, 0);
    assert.equal(build(all).length, 3);
  });

  it("the hash changes when what we write changes, and not otherwise", () => {
    const a = build({ schedule: [cls("c", "2026-10-22 09:30", "2026-10-22 11:00")] })[0];
    const same = build({ schedule: [cls("c", "2026-10-22 09:30", "2026-10-22 11:00")] })[0];
    const moved = build({ schedule: [cls("c", "2026-10-22 10:30", "2026-10-22 12:00")] })[0];
    const room = build({ schedule: [cls("c", "2026-10-22 09:30", "2026-10-22 11:00", { room: "Beta" })] })[0];
    assert.equal(a.hash, same.hash);
    assert.notEqual(a.hash, moved.hash);
    assert.notEqual(a.hash, room.hash);
    assert.equal(a.id, moved.id); // same event, so it is updated rather than duplicated
  });
});

const asEvent = (d: ReturnType<typeof build>[number], over: Partial<GEvent> = {}): GEvent => ({ id: d.id, status: "confirmed", ...d.body, ...over });

describe("the difference between what exists and what should", () => {
  const c1 = build({ schedule: [cls("c1", "2026-10-22 09:30", "2026-10-22 11:00")] })[0];
  const c2 = build({ schedule: [cls("c2", "2026-10-23 09:30", "2026-10-23 11:00")] })[0];

  it("creates what is missing and leaves what is current", () => {
    const ops = diff([c1, c2], [toExisting(asEvent(c1))]);
    assert.deepEqual(ops.create.map((d) => d.ref), ["class:c2"]);
    assert.equal(ops.unchanged, 1);
    assert.equal(ops.update.length + ops.remove.length, 0);
  });

  it("updates an event whose content changed", () => {
    const changed = build({ schedule: [cls("c1", "2026-10-22 10:00", "2026-10-22 11:30")] })[0];
    const ops = diff([changed], [toExisting(asEvent(c1))]);
    assert.equal(ops.update.length, 1);
    assert.equal(ops.update[0].id, c1.id);
  });

  it("removes Orbit events that should no longer exist", () => {
    const ops = diff([c1], [toExisting(asEvent(c1)), toExisting(asEvent(c2))]);
    assert.deepEqual(ops.remove, [c2.id]);
  });

  it("never touches events Orbit did not create", () => {
    const foreign: GEvent = { id: "someoneelse", status: "confirmed", summary: "Dentist", start: { dateTime: "2026-10-22T10:00:00+05:30" } };
    assert.deepEqual(diff([], [toExisting(foreign)]).remove, []);
  });

  it("respects an event you deleted in Google: it is not recreated", () => {
    const ops = diff([c1], [toExisting({ id: c1.id, status: "cancelled" })]);
    assert.equal(ops.create.length, 0);
    assert.equal(ops.deletedInGoogle, 1);
  });

  it("does not try to remove an event that is already deleted", () => {
    assert.deepEqual(diff([], [toExisting({ id: c1.id, status: "cancelled" })]).remove, []);
  });
});

describe("two-way: moving a task in Google", () => {
  const t = task("t1");
  const d = build({ tasks: [t] })[0];

  it("is detected when the event's start differs from where Orbit put it", () => {
    const ev = asEvent(d, { start: { dateTime: "2026-10-24T09:00:00+05:30" }, end: { dateTime: "2026-10-24T09:30:00+05:30" } });
    const moves = detectMoves([t], [toExisting(ev)]);
    assert.equal(moves.length, 1);
    assert.equal(moves[0].taskId, "t1");
    assert.equal(moves[0].dueAt, "2026-10-24T09:00:00+05:30");
    assert.equal(moves[0].hasTime, true);
  });

  it("is not detected when nothing moved, or the event was deleted", () => {
    assert.equal(detectMoves([t], [toExisting(asEvent(d))]).length, 0);
    assert.equal(detectMoves([t], [toExisting({ id: d.id, status: "cancelled" })]).length, 0);
    assert.equal(detectMoves([t], []).length, 0);
  });

  it("moving an all-day event to another day moves the date, keeping it date-only", () => {
    const day = task("t2", { due_has_time: false, due_at: "2026-10-23T23:59:00+05:30", remind_at: null });
    const dd = build({ tasks: [day] })[0];
    const ev = asEvent(dd, { start: { date: "2026-10-26" }, end: { date: "2026-10-27" } });
    const [m] = detectMoves([day], [toExisting(ev)]);
    assert.equal(m.dueAt, "2026-10-26T23:59:00+05:30");
    assert.equal(m.hasTime, false);
  });

  it("the reminder shifts with the task, and a reminder that would be in the past is dropped", () => {
    const ev = asEvent(d, { start: { dateTime: "2026-10-24T09:00:00+05:30" }, end: { dateTime: "2026-10-24T09:30:00+05:30" } });
    const [m] = detectMoves([t], [toExisting(ev)]);
    const moved = applyMove(t, m, NOW);
    assert.equal(moved.due_at, "2026-10-24T09:00:00+05:30");
    assert.equal(Date.parse(moved.remind_at as string), ist("2026-10-24 08:00")); // still one hour before
    assert.equal(moved.reminded_at, null);

    const early = applyMove(t, { ...m, dueAt: "2026-10-21T11:30:00+05:30" }, NOW); // 5 minutes from now
    assert.equal(early.remind_at, null);
  });
});

describe("preferences", () => {
  it("fall back to defaults and ignore garbage", () => {
    assert.deepEqual(parsePrefs(undefined), DEFAULT_PREFS);
    assert.deepEqual(parsePrefs("nope"), DEFAULT_PREFS);
    const p = parsePrefs({ classes: false, classReminder: 99999, hiddenCalendars: ["a", 5, "b"], tasks: "yes" });
    assert.equal(p.classes, false);
    assert.equal(p.tasks, true);
    assert.equal(p.classReminder, 15);
    assert.deepEqual(p.hiddenCalendars, ["a", "b"]);
    assert.equal(parsePrefs({ classReminder: null }).classReminder, null);
  });
});

describe("small helpers", () => {
  it("writes India time", () => assert.equal(istIso(ist("2026-10-21 14:00")), "2026-10-21T14:00:00+05:30"));
  it("maps hues onto Google's colour ids", () => {
    for (const h of [0, 28, 45, 150, 190, 210, 258, 290, 330, 355, 719, -10]) assert.match(colorForHue(h), /^([1-9]|1[01])$/);
    assert.equal(colorForHue(355), "11");
    assert.equal(colorForHue(258), "3");
  });
});
