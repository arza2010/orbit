import "server-only";
import type { SessionOption } from "@/components/notes/new-note-form";
import { courseHue, shortCourse } from "@/lib/course";
import { nexus } from "@/lib/nexus";
import { addDays, dayKey, fmtDayLabel, fmtTime } from "@/lib/time";

/** Classes already held in the last three weeks, newest first. Empty if Nexus is unreachable. */
export async function recentSessions(): Promise<SessionOption[]> {
  try {
    const me = await nexus.me();
    const today = dayKey(me.now);
    const nowMs = new Date(me.now).getTime();
    const events = await nexus.scheduleRange(addDays(today, -21), addDays(today, 2));
    return events
      .filter((e) => e.type === "session" && !e.cancelled && new Date(e.start).getTime() <= nowMs && e.course)
      .sort((a, b) => b.start.localeCompare(a.start))
      .map((e) => ({
        id: e.id,
        course: e.course as string,
        short: shortCourse(e.course),
        start: e.start,
        end: e.end,
        label: `${fmtDayLabel(dayKey(e.start))} · ${fmtTime(e.start)}`,
        hue: courseHue(e.course),
      }));
  } catch (err) {
    console.error("recentSessions: Nexus load failed", err);
    return [];
  }
}
