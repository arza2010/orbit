import assert from "node:assert/strict";
import { test } from "node:test";
import { advice, analyse, buildAttendance, termSummary, termsOf } from "../lib/attendance";
import type { AttendanceRow, MissedSession, ScheduleEvent } from "../lib/nexus";

test("75.0% exactly is a pass, with no rounding games", () => {
  const a = analyse({ attended: 6, total: 8 }, 0); // Business Frameworks
  assert.equal(a.pct, 75);
  assert.equal(a.standing, "passed");
});

test("69.2% with the term over is a shortfall, not recoverable", () => {
  const a = analyse({ attended: 9, total: 13 }, 0); // The Art of Selling
  assert.equal(a.pct, 69.2);
  assert.equal(a.standing, "short");
  assert.match(advice(a), /5\.8 points under/);
});

test("how many classes can still be missed", () => {
  // 1/1 now, 10 left: finish needs ceil(0.75 * 11) = 9 of the total, so attend 8 of the 10, miss 2.
  const a = analyse({ attended: 1, total: 1 }, 10);
  assert.equal(a.mustAttend, 8);
  assert.equal(a.canMiss, 2);
  assert.equal(a.standing, "safe");
});

test("on the line: no spare class", () => {
  // 3/4 now, 4 left: need ceil(0.75 * 8) = 6, so attend 3 of 4, miss 1 -> tight
  const a = analyse({ attended: 3, total: 4 }, 4);
  assert.equal(a.canMiss, 1);
  assert.equal(a.standing, "tight");
  // 3/4 now, 1 left: need ceil(0.75*5)=4 -> must attend the one, miss 0
  const b = analyse({ attended: 3, total: 4 }, 1);
  assert.equal(b.canMiss, 0);
  assert.equal(b.standing, "tight");
  assert.match(advice(b), /Don't miss any/);
});

test("below 75 but still recoverable", () => {
  // 9/13 with 8 left: need ceil(0.75*21)=16 -> attend 7 of 8
  const a = analyse({ attended: 9, total: 13 }, 8);
  assert.equal(a.standing, "recover");
  assert.equal(a.mustAttend, 7);
  assert.equal(a.canMiss, 1);
  assert.match(advice(a), /at least 7 of the 8/);
});

test("out of reach when even perfect attendance cannot get there", () => {
  const a = analyse({ attended: 9, total: 20 }, 3); // 12/23 = 52%
  assert.equal(a.standing, "lost");
  assert.equal(a.canMiss, 0);
  assert.equal(a.bestFinal, 52.2);
});

test("what happens if you skip or attend the next class", () => {
  const a = analyse({ attended: 18, total: 22 }, 5);
  assert.equal(a.ifMissNext, 78.3); // 18/23
  assert.equal(a.ifAttendNext, 82.6); // 19/23
});

test("classes in a row needed to climb back, and the buffer above the line", () => {
  assert.equal(analyse({ attended: 9, total: 13 }, 9).climbBack, 3 * 13 - 4 * 9); // 3
  assert.equal(analyse({ attended: 18, total: 22 }, 0).buffer, 2); // 18/24 = 75 exactly
  assert.equal(analyse({ attended: 9, total: 13 }, 0).buffer, 0);
});

test("handles an empty record", () => {
  const a = analyse({ attended: 0, total: 0 }, 6);
  assert.equal(a.pct, 100);
  assert.equal(a.mustAttend, 5); // ceil(0.75 * 6)
  assert.equal(a.canMiss, 1);
});

const row = (course: string, attended: number, total: number, term = "Term 2"): AttendanceRow => ({
  course, term, attended, total, percentage: 0, participationAvg: 0, quizAvg: null, quizSessions: 0,
});
const ev = (id: string, course: string, start: string, over: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  id, title: course, type: "session", status: "scheduled", cancelled: false, day: start.slice(0, 10), time: "", start,
  end: start, course, term: "Term 2", instructor: null, instructorLinkedIn: null, room: null, meetingLink: null,
  attendanceRequired: true, notes: null, attachments: [], ...over,
});
const now = Date.parse("2026-10-21T12:00:00+05:30");

test("remaining counts only future, required, uncancelled sessions of that course", () => {
  const schedule = [
    ev("1", "AI", "2026-10-20T09:30:00+05:30"), // past
    ev("2", "AI", "2026-10-22T09:30:00+05:30"),
    ev("3", "AI", "2026-10-23T09:30:00+05:30", { cancelled: true }),
    ev("4", "AI", "2026-10-24T09:30:00+05:30", { attendanceRequired: false }),
    ev("5", "AI", "2026-10-25T09:30:00+05:30", { type: "event" }),
    ev("6", "Other", "2026-10-22T11:30:00+05:30"),
    ev("7", "AI", "2026-10-26T09:30:00+05:30"),
  ];
  const [c] = buildAttendance([row("AI", 1, 1)], [], schedule, now);
  assert.equal(c.analysis.remaining, 2);
  assert.equal(c.next?.startMs, Date.parse("2026-10-22T09:30:00+05:30"));
});

test("the dot strip appears only when it reproduces Nexus's totals", () => {
  const schedule = [
    ev("1", "AI", "2026-10-14T09:30:00+05:30"),
    ev("2", "AI", "2026-10-15T09:30:00+05:30"),
    ev("3", "AI", "2026-10-16T09:30:00+05:30"),
  ];
  const missed: MissedSession[] = [
    { session: "AI", course: "AI", term: "Term 2", day: "Wed", date: "2026-10-15T09:30:00+05:30", status: "absent" },
  ];
  const [ok] = buildAttendance([row("AI", 2, 3)], missed, schedule, now);
  assert.deepEqual(ok.dots?.map((d) => d.present), [true, false, true]);
  const [bad] = buildAttendance([row("AI", 5, 6)], missed, schedule, now); // totals disagree
  assert.equal(bad.dots, null);
  assert.equal(bad.missed.length, 1);
});

test("term summary and ordering", () => {
  const list = buildAttendance([row("A", 1, 1), row("B", 9, 13, "Term 1"), row("C", 18, 22, "Term 1")], [], [], now);
  assert.deepEqual(termsOf(list), ["Term 2", "Term 1"]);
  const t1 = termSummary(list.filter((c) => c.term === "Term 1"));
  assert.equal(t1.attended, 27);
  assert.equal(t1.total, 35);
  assert.equal(t1.pct, 77.1);
  assert.equal(t1.trouble, 1); // B finished under the line
});
