import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { googleToDayEvent, taskToDayEvent } from "../lib/today-personal";
import { buildToday, freeWindows, type DayEvent, type Personal } from "../lib/today";
import type { Assignment, Me, ScheduleEvent } from "../lib/nexus";

const ist = (s: string) => `${s.replace(" ", "T")}:00+05:30`;
const ms = (s: string) => Date.parse(ist(s));
const ME = (now: string): Me => ({ name: "Sam Student", email: "h@x", enrollmentNo: "1", program: "PGP", batch: "IV", timezone: "Asia/Kolkata", now: ist(now), today: now.slice(0, 10) });

const cls = (id: string, course: string, start: string, end: string, over: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  id, title: course, type: "session", status: "scheduled", cancelled: false, day: "", time: "", start: ist(start), end: ist(end),
  course, term: "Term 2", instructor: null, instructorLinkedIn: null, room: "Delta", meetingLink: null, attendanceRequired: true, notes: null, attachments: [], ...over,
});
const ev = (id: string, source: "google" | "task", start: string, end: string, course = "Dentist"): DayEvent => ({
  id, title: "Personal", course, type: source, start: ist(start), end: ist(end), range: "", room: null, instructor: null, link: null,
  attendance: false, cancelled: false, hue: 200, source,
});
const NO_ASSIGNMENTS: Assignment[] = [];
const empty: Personal = { events: [], allDay: [], tasksDue: 0 };

describe("one day, two worlds: Mesa and your own calendar", () => {
  const schedule = [
    cls("a", "AI with Mihirr Sose", "2026-10-21 09:30", "2026-10-21 11:00"),
    cls("b", "Business Metrics", "2026-10-21 11:30", "2026-10-21 13:00"),
  ];

  it("with no personal data it behaves exactly as before", () => {
    const d = buildToday(ME("2026-10-21 08:00"), schedule, NO_ASSIGNMENTS);
    assert.equal(d.events.length, 2);
    assert.equal(d.stats.classes, 2);
    assert.equal(d.stats.personal, 0);
    assert.deepEqual(d.allDay, []);
  });

  it("puts Google events and timed tasks in the same timeline, in time order", () => {
    const personal: Personal = { events: [ev("g1", "google", "2026-10-21 16:00", "2026-10-21 17:00"), ev("t1", "task", "2026-10-21 10:00", "2026-10-21 10:30", "Pay bill")], allDay: [], tasksDue: 2 };
    const d = buildToday(ME("2026-10-21 08:00"), schedule, NO_ASSIGNMENTS, personal);
    assert.deepEqual(d.events.map((e) => e.id), ["a", "t1", "b", "g1"]);
    assert.equal(d.stats.personal, 2);
    assert.equal(d.stats.tasksDue, 2);
  });

  it("personal events never count as classes or class hours", () => {
    const personal: Personal = { events: [ev("g1", "google", "2026-10-21 14:00", "2026-10-21 17:00")], allDay: [], tasksDue: 0 };
    const d = buildToday(ME("2026-10-21 08:00"), schedule, NO_ASSIGNMENTS, personal);
    assert.equal(d.stats.classes, 2);
    assert.equal(d.stats.hoursInClass, 3);
  });

  it("warns when a personal event overlaps a class, naming the class", () => {
    const personal: Personal = { events: [ev("g1", "google", "2026-10-21 10:30", "2026-10-21 11:30", "Dentist"), ev("g2", "google", "2026-10-21 15:00", "2026-10-21 16:00", "Call")], allDay: [], tasksDue: 0 };
    const d = buildToday(ME("2026-10-21 08:00"), schedule, NO_ASSIGNMENTS, personal);
    assert.equal(d.events.find((e) => e.id === "g1")?.clash, "AI");
    assert.equal(d.events.find((e) => e.id === "g2")?.clash, undefined);
  });

  it("ignores a cancelled class when looking for clashes", () => {
    const sched = [cls("a", "AI with Mihirr Sose", "2026-10-21 09:30", "2026-10-21 11:00", { cancelled: true })];
    const personal: Personal = { events: [ev("g1", "google", "2026-10-21 10:00", "2026-10-21 10:30")], allDay: [], tasksDue: 0 };
    assert.equal(buildToday(ME("2026-10-21 08:00"), sched, NO_ASSIGNMENTS, personal).events.find((e) => e.id === "g1")?.clash, undefined);
  });

  it("shows only today's all-day items, and feeds tomorrow's personal events to 'coming up'", () => {
    const personal: Personal = {
      events: [ev("g9", "google", "2026-10-22 18:00", "2026-10-22 19:00", "Dinner")],
      allDay: [{ dayKey: "2026-10-21", title: "Diwali", hue: 30 }, { dayKey: "2026-10-23", title: "Trip", hue: 120 }],
      tasksDue: 0,
    };
    const d = buildToday(ME("2026-10-21 08:00"), schedule, NO_ASSIGNMENTS, personal);
    assert.deepEqual(d.allDay.map((a) => a.title), ["Diwali"]);
    assert.ok(d.upcoming.some((u) => u.events.some((e) => e.id === "g9")));
  });
});

describe("free windows", () => {
  const block = (s: string, e: string, cancelled = false): DayEvent => ({ ...ev(`${s}${e}`, "google", `2026-10-21 ${s}`, `2026-10-21 ${e}`), cancelled });
  const free = (events: DayEvent[], now: string) => freeWindows(events, "2026-10-21", ms(`2026-10-21 ${now}`)).map((w) => [new Date(w.start).getTime(), new Date(w.end).getTime(), w.minutes]);

  it("finds the gaps between events, from now until 9 pm", () => {
    const w = free([block("09:30", "11:00"), block("11:30", "13:00"), block("16:00", "17:00")], "11:05");
    assert.deepEqual(w, [
      [ms("2026-10-21 13:00"), ms("2026-10-21 16:00"), 180],
      [ms("2026-10-21 17:00"), ms("2026-10-21 21:00"), 240],
    ]);
  });

  it("drops gaps shorter than 45 minutes", () => {
    assert.deepEqual(free([block("09:00", "10:00"), block("10:30", "12:00")], "08:00").map((x) => x[2]), [60, 540]);
  });

  it("starts at 8 am when it's earlier, and is empty after 9 pm", () => {
    assert.equal(free([], "06:00")[0][0], ms("2026-10-21 08:00"));
    assert.deepEqual(free([], "21:30"), []);
  });

  it("overlapping events don't invent free time, and cancelled ones don't block it", () => {
    assert.deepEqual(free([block("09:00", "12:00"), block("10:00", "11:00")], "08:00").map((x) => [x[0], x[1]]), [
      [ms("2026-10-21 08:00"), ms("2026-10-21 09:00")], [ms("2026-10-21 12:00"), ms("2026-10-21 21:00")],
    ]);
    assert.equal(free([block("09:00", "20:00", true)], "08:00").length, 1);
  });
});

describe("turning your data into timeline items", () => {
  it("maps a Google event", () => {
    const d = googleToDayEvent({ id: "g:1", title: "Sam", course: "Dentist", group: "Google · Sam", type: "google", startMs: ms("2026-10-22 16:00"), endMs: ms("2026-10-22 17:00"), dayKey: "2026-10-22", range: "4:00 pm – 5:00 pm", room: "MG Road", instructor: null, instructorLinkedIn: null, link: null, attendance: false, cancelled: false, notes: null, attachments: [], hue: 190 });
    assert.equal(d.source, "google");
    assert.equal(d.course, "Dentist");
    assert.equal(d.room, "MG Road");
    assert.equal(Date.parse(d.end) - Date.parse(d.start), 3_600_000);
  });

  it("maps a timed task to a 30-minute block", () => {
    const d = taskToDayEvent({ id: "abc", title: "Pay electricity bill", due_at: new Date(ms("2026-10-21 17:30")).toISOString() });
    assert.equal(d.source, "task");
    assert.equal(d.course, "Pay electricity bill");
    assert.equal(d.range, "5:30 pm – 6:00 pm");
    assert.equal(Date.parse(d.end) - Date.parse(d.start), 1_800_000);
  });
});
