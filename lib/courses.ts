import type { Announcement, Assignment, AssignmentMark, AttendanceRow, Course, ScheduleEvent } from "./nexus";
import { courseHue, shortCourse } from "./course";
import { toCalEvent, type CalEvent } from "./calendar";
import { sortDeadlines, toDeadline, type Deadline } from "./today";
import { dayKey, fmtDayLabel, fmtTime } from "./time";

export type CourseCard = {
  id: string;
  title: string;
  short: string;
  instructor: string | null;
  instructorLinkedIn: string | null;
  term: string;
  hue: number;
  attendance: { attended: number; total: number; pct: number } | null;
  open: number;
  overdue: number;
  submitted: number;
  total: number;
  nextDeadline: { title: string; label: string; tone: Deadline["tone"] } | null;
  nextSession: { day: string; range: string; room: string | null } | null;
  latest: { name: string; marks: number; max: number | null } | null;
};

export type MarkRow = {
  id: string;
  assignment: string;
  marks: number | null;
  max: number | null;
  feedback: string | null;
  released: string | null;
};

export type CourseDetail = {
  card: CourseCard;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  open: Deadline[];
  submitted: Deadline[];
  upcoming: CalEvent[];
  recent: CalEvent[];
  marks: MarkRow[];
  avgPct: number | null;
};

const num = (v: string | null | undefined) => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function termOrder(courses: Course[]): string[] {
  const latest = new Map<string, string>();
  for (const c of courses) {
    const d = c.startDate ?? "";
    if (!latest.has(c.term) || d > (latest.get(c.term) ?? "")) latest.set(c.term, d);
  }
  return [...latest.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([t]) => t);
}

function cardFor(
  c: Course,
  assignments: Assignment[],
  marks: AssignmentMark[],
  attendance: AttendanceRow[],
  events: ScheduleEvent[],
  nowMs: number,
): CourseCard {
  const mine = assignments.filter((a) => a.course === c.title);
  const unsubmitted = mine.filter((a) => a.submissionStatus !== "submitted");
  const ds = sortDeadlines(unsubmitted.map((a) => toDeadline(a, nowMs)), nowMs);
  const nextD = ds.find((d) => d.tone !== "overdue" && d.dueAt) ?? ds.find((d) => d.tone === "undated") ?? ds[0] ?? null;

  const att = attendance.find((a) => a.course === c.title && a.term === c.term);
  const next = events
    .filter((e) => e.course === c.title && !e.cancelled && new Date(e.start).getTime() >= nowMs)
    .sort((a, b) => a.start.localeCompare(b.start))[0];

  const scored = marks
    .filter((m) => m.course === c.title && num(m.marks) !== null)
    .sort((a, b) => (b.releasedAt ?? "").localeCompare(a.releasedAt ?? ""))[0];

  return {
    id: c.id,
    title: c.title,
    short: shortCourse(c.title),
    instructor: c.instructor,
    instructorLinkedIn: c.instructorLinkedIn,
    term: c.term,
    hue: courseHue(c.title),
    attendance: att ? { attended: att.attended, total: att.total, pct: att.percentage } : null,
    open: ds.filter((d) => d.tone !== "overdue").length,
    overdue: ds.filter((d) => d.tone === "overdue").length,
    submitted: mine.length - unsubmitted.length,
    total: mine.length,
    nextDeadline: nextD ? { title: nextD.title, label: nextD.dueLabel, tone: nextD.tone } : null,
    nextSession: next
      ? { day: fmtDayLabel(dayKey(next.start)), range: `${fmtTime(next.start)} – ${fmtTime(next.end)}`, room: next.room }
      : null,
    latest: scored ? { name: scored.assignment, marks: num(scored.marks) as number, max: num(scored.maxMarks) } : null,
  };
}

export function buildCourseCards(
  courses: Course[],
  assignments: Assignment[],
  marks: AssignmentMark[],
  attendance: AttendanceRow[],
  events: ScheduleEvent[],
  nowMs: number,
): CourseCard[] {
  return courses.map((c) => cardFor(c, assignments, marks, attendance, events, nowMs));
}

export function buildCourseDetail(
  course: Course,
  assignments: Assignment[],
  marks: AssignmentMark[],
  attendance: AttendanceRow[],
  events: ScheduleEvent[],
  nowMs: number,
): CourseDetail {
  const card = cardFor(course, assignments, marks, attendance, events, nowMs);
  const mine = assignments.filter((a) => a.course === course.title);

  const open = sortDeadlines(
    mine.filter((a) => a.submissionStatus !== "submitted").map((a) => toDeadline(a, nowMs)),
    nowMs,
  );
  const submitted = mine
    .filter((a) => a.submissionStatus === "submitted")
    .map((a) => toDeadline(a, nowMs))
    .sort((a, b) => (b.dueAt ?? "").localeCompare(a.dueAt ?? ""));

  const sessions = events
    .filter((e) => e.course === course.title && e.type !== "holiday")
    .map(toCalEvent)
    .sort((a, b) => a.startMs - b.startMs);

  const markRows: MarkRow[] = marks
    .filter((m) => m.course === course.title)
    .sort((a, b) => (b.releasedAt ?? "").localeCompare(a.releasedAt ?? ""))
    .map((m) => ({
      id: m.assignmentId,
      assignment: m.assignment,
      marks: num(m.marks),
      max: num(m.maxMarks),
      feedback: m.feedback,
      released: m.releasedAt ? fmtDayLabel(dayKey(m.releasedAt)) : null,
    }));

  const pcts = markRows.filter((m) => m.marks !== null && m.max).map((m) => ((m.marks as number) / (m.max as number)) * 100);

  return {
    card,
    description: course.description,
    startDate: course.startDate,
    endDate: course.endDate,
    open,
    submitted,
    upcoming: sessions.filter((e) => e.startMs >= nowMs && !e.cancelled).slice(0, 6),
    recent: sessions.filter((e) => e.endMs < nowMs).slice(-4).reverse(),
    marks: markRows,
    avgPct: pcts.length ? pcts.reduce((s, v) => s + v, 0) / pcts.length : null,
  };
}

export type AnnouncementLite = { id: string; title: string; body: string; posted: string; pinned: boolean };

export const toAnnouncementLite = (a: Announcement): AnnouncementLite => ({
  id: a.id,
  title: a.title.replace(/^Important Announcement\s*:\s*/i, ""),
  body: a.body,
  posted: `${fmtDayLabel(dayKey(a.postedAt))}, ${fmtTime(a.postedAt)}`,
  pinned: a.pinned,
});
