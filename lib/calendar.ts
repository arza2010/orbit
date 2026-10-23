import type { ScheduleEvent } from "./nexus";
import { courseHue, shortCourse } from "./course";
import { addDays, dayKey, fmtTime } from "./time";

export type View = "month" | "week" | "day";

export type CalAttachment = { name: string; url?: string };

export type CalEvent = {
  id: string;
  title: string;
  course: string; // short display name
  type: string;
  startMs: number;
  endMs: number;
  dayKey: string;
  range: string;
  room: string | null;
  instructor: string | null;
  instructorLinkedIn: string | null;
  link: string | null;
  attendance: boolean;
  cancelled: boolean;
  notes: string | null;
  attachments: CalAttachment[];
  hue: number;
  /** Where it came from. Missing means Nexus. */
  source?: "nexus" | "google";
  /** Filter-chip name when it differs from `course` (Google events share one chip per calendar). */
  group?: string;
  allDay?: boolean;
  /** "Open in Google Calendar" and similar. */
  external?: string;
};

const DAY = 86_400_000;
const IST_OFFSET = 330 * 60_000;

function toAttachment(a: unknown): CalAttachment {
  if (typeof a === "string") return { name: a };
  if (a && typeof a === "object") {
    const o = a as Record<string, unknown>;
    const name = [o.name, o.title, o.fileName, o.filename].find((v) => typeof v === "string") as string | undefined;
    const url = [o.url, o.link, o.href].find((v) => typeof v === "string") as string | undefined;
    return { name: name ?? "Attachment", url };
  }
  return { name: "Attachment" };
}

export function toCalEvent(e: ScheduleEvent): CalEvent {
  const startMs = new Date(e.start).getTime();
  const endMs = new Date(e.end).getTime();
  return {
    id: e.id,
    title: e.title,
    course: shortCourse(e.course) || e.title,
    type: e.type,
    startMs,
    endMs,
    dayKey: dayKey(e.start),
    range: `${fmtTime(e.start)} – ${fmtTime(e.end)}`,
    room: e.room,
    instructor: e.instructor,
    instructorLinkedIn: e.instructorLinkedIn,
    link: e.meetingLink,
    attendance: e.attendanceRequired,
    cancelled: e.cancelled,
    notes: e.notes,
    attachments: (e.attachments ?? []).map(toAttachment),
    hue: courseHue(e.course ?? e.title),
  };
}

// ---- Date keys (YYYY-MM-DD, Mesa calendar days) ----------------------------

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

export function mondayOf(key: string): string {
  return addDays(key, -((weekdayOf(key) + 6) % 7));
}

export function addMonths(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, dim)).padStart(2, "0")}`;
}

export const monthKeyOf = (key: string) => key.slice(0, 7);

/** The 42 days (6 Mon-first weeks) shown for the month containing `key`. */
export function monthGrid(key: string): string[] {
  const start = mondayOf(`${monthKeyOf(key)}-01`);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function weekDays(key: string): string[] {
  const start = mondayOf(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Months (as keys like "2026-10") whose grids are needed to render the visible days. */
export function monthsCovering(days: string[]): string[] {
  return [...new Set(days.map(monthKeyOf))];
}

export function visibleDays(view: View, key: string): string[] {
  if (view === "month") return monthGrid(key);
  if (view === "week") return weekDays(key);
  return [key];
}

/** Minutes since midnight IST for an epoch-ms timestamp. */
export function minutesIntoDay(ms: number): number {
  return ((((ms + IST_OFFSET) % DAY) + DAY) % DAY) / 60_000;
}

// ---- Overlap layout for time grids -----------------------------------------

export type Placed = { ev: CalEvent; col: number; cols: number };

export function layoutDay(events: CalEvent[]): Placed[] {
  const sorted = [...events].sort((a, b) => a.startMs - b.startMs || b.endMs - a.endMs);
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -Infinity;
  let colEnds: number[] = [];

  const flush = () => {
    const cols = colEnds.length || 1;
    for (const c of cluster) c.cols = cols;
    out.push(...cluster);
    cluster = [];
    colEnds = [];
    clusterEnd = -Infinity;
  };

  for (const ev of sorted) {
    if (cluster.length && ev.startMs >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= ev.startMs);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(ev.endMs);
    } else {
      colEnds[col] = ev.endMs;
    }
    cluster.push({ ev, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, ev.endMs);
  }
  if (cluster.length) flush();
  return out;
}

// ---- Labels ----------------------------------------------------------------

const monthFmt = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLongFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const dayNumMonthFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const weekdayShortFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" });

const asUtc = (key: string) => new Date(`${key}T12:00:00Z`);

export const monthLabel = (key: string) => monthFmt.format(asUtc(key));
export const dayLongLabel = (key: string) => dayLongFmt.format(asUtc(key));
export const weekdayShort = (key: string) => weekdayShortFmt.format(asUtc(key));
export const dayNum = (key: string) => Number(key.slice(8, 10));

export function periodLabel(view: View, key: string): { main: string; sub?: string } {
  if (view === "month") {
    const [month, year] = monthLabel(key).split(" ");
    return { main: month, sub: year };
  }
  if (view === "week") {
    const days = weekDays(key);
    const a = dayNumMonthFmt.format(asUtc(days[0]));
    const b = dayNumMonthFmt.format(asUtc(days[6]));
    return { main: `${a} – ${b}`, sub: days[6].slice(0, 4) };
  }
  return { main: dayLongLabel(key), sub: key.slice(0, 4) };
}

export const isDateKey = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
