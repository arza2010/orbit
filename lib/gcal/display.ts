import type { CalEvent } from "../calendar";
import { addDays, dayKey, fmtTime } from "../time";
import type { GCalendar, GEvent } from "./api";

// Google events -> the CalEvent shape the calendar views already draw.

const MAX_ALL_DAY_SPAN = 31;

/** Hue (0-360) of a #rrggbb colour, so a Google calendar keeps its own colour inside Orbit. */
export function hueOfHex(hex: string | undefined, fallback = 210): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return fallback;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}

const istMidnight = (key: string) => Date.parse(`${key}T00:00:00+05:30`);

export function googleToCal(e: GEvent, cal: Pick<GCalendar, "id" | "summary" | "backgroundColor">): CalEvent[] {
  if (e.status === "cancelled") return [];
  if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) return [];

  const hue = hueOfHex(cal.backgroundColor);
  const base = {
    title: cal.summary,
    course: e.summary?.trim() || "(No title)",
    group: `Google · ${cal.summary}`,
    type: "google",
    room: e.location ?? null,
    instructor: null,
    instructorLinkedIn: null,
    link: e.hangoutLink ?? null,
    attendance: false,
    cancelled: false,
    notes: e.description ?? null,
    attachments: [],
    hue,
    source: "google" as const,
    external: e.htmlLink,
  };

  // All-day: one entry per day it covers (Google's end date is exclusive).
  if (e.start?.date && !e.start.dateTime) {
    const from = e.start.date;
    const to = e.end?.date && e.end.date > from ? e.end.date : addDays(from, 1);
    const out: CalEvent[] = [];
    for (let d = from, i = 0; d < to && i < MAX_ALL_DAY_SPAN; d = addDays(d, 1), i++) {
      out.push({ ...base, id: `g:${cal.id}:${e.id}:${d}`, startMs: istMidnight(d), endMs: istMidnight(d) + 86_400_000, dayKey: d, range: "All day", allDay: true });
    }
    return out;
  }

  if (!e.start?.dateTime) return [];
  const startMs = Date.parse(e.start.dateTime);
  const endMs = e.end?.dateTime ? Date.parse(e.end.dateTime) : startMs + 30 * 60_000;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];
  return [
    {
      ...base,
      id: `g:${cal.id}:${e.id}`,
      startMs,
      endMs: endMs > startMs ? endMs : startMs + 30 * 60_000,
      dayKey: dayKey(new Date(startMs)),
      range: `${fmtTime(new Date(startMs))} – ${fmtTime(new Date(endMs))}`,
      allDay: false,
    },
  ];
}
