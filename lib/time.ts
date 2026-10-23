// Everything in this app is shown in Mesa's timezone.
export const TZ = "Asia/Kolkata";

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: TZ,
});
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const dayLabelFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: TZ,
});

/** "9:30 am" */
export function fmtTime(iso: string | Date): string {
  return timeFmt.format(new Date(iso)).toLowerCase().replace(/\s+/g, " ");
}

/** "2026-10-21" in IST */
export function dayKey(iso: string | Date): string {
  return dayKeyFmt.format(new Date(iso));
}

/** Add whole days to a YYYY-MM-DD key. */
export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00+05:30`);
  d.setTime(d.getTime() + n * 86_400_000);
  return dayKey(d);
}

/** "Thu, 22 Oct" */
export function fmtDayLabel(key: string): string {
  return dayLabelFmt.format(new Date(`${key}T12:00:00+05:30`));
}

/** Hour (0-23) in IST for an ISO string. */
export function istHour(iso: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: TZ }).format(new Date(iso))) % 24;
}

/** 135 minutes -> "2h 15m", 40 -> "40m" */
export function fmtDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
