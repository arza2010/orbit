import type { Assignment, Me, ScheduleEvent } from "./nexus";
import { addDays, dayKey, fmtDayLabel, fmtTime, istHour } from "./time";
import { courseHue, shortCourse } from "./course";

export type DayEvent = {
  id: string;
  title: string;
  course: string;
  type: string;
  start: string;
  end: string;
  range: string;
  room: string | null;
  instructor: string | null;
  link: string | null;
  attendance: boolean;
  cancelled: boolean;
  hue: number;
  /** Where it came from. Missing means Nexus. */
  source?: "nexus" | "google" | "task";
  /** Set on a personal event that overlaps a class: the class it clashes with. */
  clash?: string | null;
};

/** Your own side of the day: Google Calendar events, timed tasks, and what is due. */
export type Personal = {
  events: DayEvent[];
  /** All-day Google events (holidays, trips), by the day they cover. */
  allDay: { dayKey: string; title: string; hue: number }[];
  /** Open tasks that are overdue or due today. */
  tasksDue: number;
};

export type FreeWindow = { start: string; end: string; minutes: number };

export type Deadline = {
  id: string;
  title: string;
  course: string;
  hue: number;
  dueAt: string | null;
  dueLabel: string;
  tone: "overdue" | "soon" | "later" | "undated";
  group: boolean;
  late: boolean;
};

export type UpcomingDay = { key: string; label: string; events: DayEvent[] };

export type TodayData = {
  firstName: string;
  now: string;
  todayKey: string;
  todayLabel: string;
  greeting: string;
  events: DayEvent[];
  upcoming: UpcomingDay[];
  deadlines: Deadline[];
  stats: { classes: number; hoursInClass: number; open: number; overdue: number; thisWeek: number; personal: number; tasksDue: number };
  allDay: { title: string; hue: number }[];
  /** Stretches of today with nothing on, from now until evening. */
  free: FreeWindow[];
};

const DAY_START_H = 8;
const DAY_END_H = 21;
const MIN_FREE_MIN = 45;
const MAX_FREE_SHOWN = 4;

function toEvent(e: ScheduleEvent): DayEvent {
  const course = shortCourse(e.course) || e.title;
  return {
    id: e.id,
    title: e.title,
    course,
    type: e.type,
    start: e.start,
    end: e.end,
    range: `${fmtTime(e.start)} – ${fmtTime(e.end)}`,
    room: e.room,
    instructor: e.instructor,
    link: e.meetingLink,
    attendance: e.attendanceRequired,
    cancelled: e.cancelled,
    hue: courseHue(e.course ?? e.title),
  };
}

function greetingFor(hour: number): string {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function relativeDue(dueMs: number, nowMs: number): { label: string; tone: Deadline["tone"] } {
  const diff = dueMs - nowMs;
  const day = 86_400_000;
  if (diff < 0) {
    const days = Math.max(1, Math.round(-diff / day));
    return { label: `Overdue ${days}d`, tone: "overdue" };
  }
  const hours = diff / 3_600_000;
  if (hours < 1) return { label: "Due within the hour", tone: "soon" };
  if (hours < 24) return { label: `Due in ${Math.round(hours)}h`, tone: "soon" };
  const days = Math.round(diff / day);
  return { label: `Due in ${days}d`, tone: days <= 3 ? "soon" : "later" };
}

export function toDeadline(a: Assignment, nowMs: number): Deadline {
  const base = {
    id: a.id,
    title: a.title.replace(/^Important:\s*/i, ""),
    course: shortCourse(a.course) || "General",
    hue: courseHue(a.course),
    dueAt: a.dueAt,
    group: a.isGroup,
    late: a.allowLate,
  };
  if (!a.dueAt) return { ...base, dueLabel: "No date yet", tone: "undated" };
  const { label, tone } = relativeDue(new Date(a.dueAt).getTime(), nowMs);
  return { ...base, dueLabel: label, tone };
}

/** Upcoming soonest-first, then overdue (most recent first), undated last. */
export function sortDeadlines(list: Deadline[], nowMs: number): Deadline[] {
  return [...list].sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return 0;
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    const at = new Date(a.dueAt).getTime();
    const bt = new Date(b.dueAt).getTime();
    const an = at >= nowMs;
    const bn = bt >= nowMs;
    if (an !== bn) return an ? -1 : 1;
    return an ? at - bt : bt - at;
  });
}

const startMs = (e: DayEvent) => new Date(e.start).getTime();
const endMs = (e: DayEvent) => new Date(e.end).getTime();
const overlaps = (a: DayEvent, b: DayEvent) => startMs(a) < endMs(b) && startMs(b) < endMs(a);

/** Stretches of the day (8 am to 9 pm, from now on) not covered by any event. */
export function freeWindows(events: DayEvent[], todayKey: string, nowMs: number): FreeWindow[] {
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00:00+05:30`;
  const dayStart = Date.parse(`${todayKey}T${hh(DAY_START_H)}`);
  const dayEnd = Date.parse(`${todayKey}T${hh(DAY_END_H)}`);
  let cursor = Math.max(dayStart, nowMs);
  if (cursor >= dayEnd) return [];

  const busy = events
    .filter((e) => !e.cancelled)
    .map((e) => [startMs(e), endMs(e)] as const)
    .sort((a, b) => a[0] - b[0]);

  const out: FreeWindow[] = [];
  const push = (from: number, to: number) => {
    const minutes = Math.round((to - from) / 60_000);
    if (minutes >= MIN_FREE_MIN) out.push({ start: new Date(from).toISOString(), end: new Date(to).toISOString(), minutes });
  };
  for (const [s, e] of busy) {
    if (e <= cursor) continue;
    if (s > cursor) push(cursor, Math.min(s, dayEnd));
    cursor = Math.max(cursor, e);
    if (cursor >= dayEnd) break;
  }
  if (cursor < dayEnd) push(cursor, dayEnd);
  return out.slice(0, MAX_FREE_SHOWN);
}

export function buildToday(me: Me, schedule: ScheduleEvent[], assignments: Assignment[], personal?: Personal): TodayData {
  const todayKey = dayKey(me.now);
  const nowMs = new Date(me.now).getTime();

  const fromNexus = schedule.filter((e) => e.type !== "holiday").map(toEvent);
  const all = [...fromNexus, ...(personal?.events ?? [])].sort((a, b) => startMs(a) - startMs(b));

  const events = all.filter((e) => dayKey(e.start) === todayKey);

  // A personal event that overlaps a class is worth a warning.
  const classesToday = events.filter((e) => (e.source ?? "nexus") === "nexus" && !e.cancelled);
  for (const e of events) {
    if ((e.source ?? "nexus") === "nexus" || e.cancelled) continue;
    const hit = classesToday.find((c) => overlaps(e, c));
    if (hit) e.clash = hit.course;
  }

  const upcoming: UpcomingDay[] = [];
  for (let i = 1; i <= 3; i++) {
    const key = addDays(todayKey, i);
    const evs = all.filter((e) => dayKey(e.start) === key);
    if (evs.length) upcoming.push({ key, label: fmtDayLabel(key), events: evs });
  }

  const deadlines = sortDeadlines(
    assignments.filter((a) => a.submissionStatus !== "submitted").map((a) => toDeadline(a, nowMs)),
    nowMs,
  );

  const sessionsToday = events.filter((e) => e.type === "session" && !e.cancelled && (e.source ?? "nexus") === "nexus");
  const hoursInClass =
    sessionsToday.reduce((s, e) => s + (new Date(e.end).getTime() - new Date(e.start).getTime()), 0) /
    3_600_000;

  const weekEnd = addDays(todayKey, 7);
  const thisWeek = all.filter(
    (e) => e.type === "session" && !e.cancelled && (e.source ?? "nexus") === "nexus" && dayKey(e.start) >= todayKey && dayKey(e.start) < weekEnd,
  ).length;

  return {
    firstName: me.name.split(" ")[0],
    now: me.now,
    todayKey,
    todayLabel: fmtDayLabel(todayKey),
    greeting: greetingFor(istHour(me.now)),
    events,
    upcoming,
    deadlines,
    stats: {
      classes: sessionsToday.length,
      hoursInClass: Math.round(hoursInClass * 10) / 10,
      open: deadlines.filter((d) => d.tone !== "overdue").length,
      overdue: deadlines.filter((d) => d.tone === "overdue").length,
      thisWeek,
      personal: events.filter((e) => (e.source ?? "nexus") !== "nexus" && !e.cancelled).length,
      tasksDue: personal?.tasksDue ?? 0,
    },
    allDay: (personal?.allDay ?? []).filter((a) => a.dayKey === todayKey).map(({ title, hue }) => ({ title, hue })),
    free: freeWindows(events, todayKey, nowMs),
  };
}
