import "server-only";
import { buildAttendance, type CourseAttendance } from "./attendance";
import { nexus } from "./nexus";
import { addDays, dayKey } from "./time";

/** Attendance for every class Nexus tracks, joined with the schedule so "classes left" is exact. */
export async function loadAttendance(): Promise<{ items: CourseAttendance[]; nowMs: number }> {
  const me = await nexus.me();
  const nowMs = new Date(me.now).getTime();
  const today = dayKey(me.now);
  // Back far enough to cover Term 1 for the history strip, forward far enough to cover Term 2's end.
  const [detail, schedule] = await Promise.all([
    nexus.attendanceDetail(),
    nexus.scheduleRange(addDays(today, -110), addDays(today, 80)),
  ]);
  return { items: buildAttendance(detail.courses, detail.missedSessions, schedule, nowMs), nowMs };
}
