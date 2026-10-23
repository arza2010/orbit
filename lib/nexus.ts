import "server-only";

// Server-side client for the Nexus (Mesa LMS) MCP endpoint.
// Never import this from a client component: it reads the personal access token.

const URL_ = process.env.MESA_MCP_URL;
const PAT = process.env.MESA_PAT;

export class NexusError extends Error {}

let rpcId = 0;

// Small per-instance cache so moving between pages doesn't re-hit Nexus every time.
const TTL_MS = 45_000;
const cache = new Map<string, { at: number; p: Promise<unknown> }>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p as Promise<T>;
  const p = load();
  cache.set(key, { at: Date.now(), p });
  p.catch(() => cache.delete(key));
  return p;
}

async function rawCall<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!URL_ || !PAT) throw new NexusError("MESA_MCP_URL / MESA_PAT are not set in .env.local");

  const res = await fetch(URL_, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAT}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++rpcId,
      method: "tools/call",
      params: { name, arguments: args },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new NexusError(`Nexus ${name} failed: HTTP ${res.status}`);

  const body = await res.json();
  if (body.error) throw new NexusError(`Nexus ${name}: ${body.error.message ?? "error"}`);
  if (body.result?.isError) {
    throw new NexusError(`Nexus ${name}: ${body.result.content?.[0]?.text ?? "tool error"}`);
  }
  return body.result.structuredContent as T;
}

const callTool = <T>(name: string, args: Record<string, unknown> = {}) =>
  cached<T>(`${name}:${JSON.stringify(args)}`, () => rawCall<T>(name, args));

// ---- Types (only the fields the app uses) ---------------------------------

export type Me = {
  name: string;
  email: string;
  enrollmentNo: string;
  program: string;
  batch: string;
  timezone: string;
  now: string;
  today: string;
};

export type Course = {
  id: string;
  title: string;
  code: string | null;
  type: "core" | "elective" | string;
  term: string;
  instructor: string | null;
  instructorLinkedIn: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type ScheduleEvent = {
  id: string;
  title: string;
  type: "session" | "event" | "exam" | "holiday" | string;
  status: string;
  cancelled: boolean;
  day: string;
  time: string;
  start: string;
  end: string;
  course: string | null;
  term: string | null;
  instructor: string | null;
  instructorLinkedIn: string | null;
  room: string | null;
  meetingLink: string | null;
  attendanceRequired: boolean;
  notes: string | null;
  attachments: unknown[];
};

export type Assignment = {
  id: string;
  title: string;
  course: string | null;
  dueAt: string | null;
  cutoffAt: string | null;
  allowLate: boolean;
  maxMarks: string | null;
  isGroup: boolean;
  submissionStatus: "submitted" | "not_submitted" | string;
};

export type AssignmentMark = {
  assignmentId: string;
  assignment: string;
  course: string | null;
  marks: string | null;
  maxMarks: string | null;
  feedback: string | null;
  releasedAt: string | null;
};

export type AttendanceRow = {
  course: string;
  term: string;
  attended: number;
  total: number;
  percentage: number;
  participationAvg: number | null;
  quizAvg: number | null;
  quizSessions: number;
};

export type MissedSession = {
  session: string;
  course: string;
  term: string;
  day: string;
  /** ISO start time with +05:30 offset. */
  date: string;
  status: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  author: string | null;
  course: string | null;
  program: string | null;
  pinned: boolean;
  postedAt: string;
  attachments: unknown[];
};

// ---- Tools ----------------------------------------------------------------

const DAY_MS = 86_400_000;
const MAX_SPAN_DAYS = 60; // Nexus allows 62 per call

async function scheduleRange(fromKey: string, toKey: string): Promise<ScheduleEvent[]> {
  const start = new Date(`${fromKey}T00:00:00Z`).getTime();
  const end = new Date(`${toKey}T00:00:00Z`).getTime();
  const chunks: [string, string][] = [];
  for (let t = start; t < end; t += MAX_SPAN_DAYS * DAY_MS) {
    const a = new Date(t).toISOString().slice(0, 10);
    const b = new Date(Math.min(t + MAX_SPAN_DAYS * DAY_MS, end)).toISOString().slice(0, 10);
    chunks.push([a, b]);
  }
  const parts = await Promise.all(
    chunks.map(([a, b]) =>
      callTool<{ events: ScheduleEvent[] }>("get_schedule", {
        from: `${a}T00:00:00+05:30`,
        to: `${b}T00:00:00+05:30`,
      }).then((r) => r.events),
    ),
  );
  // Chunks share boundaries only at midnight, but dedupe by id to be safe.
  return [...new Map(parts.flat().map((e) => [e.id, e])).values()];
}

export const nexus = {
  me: () => rawCall<Me>("get_me", {}),
  courses: () => callTool<{ courses: Course[] }>("list_courses").then((r) => r.courses),
  schedule: (from: string, to: string) =>
    callTool<{ events: ScheduleEvent[] }>("get_schedule", { from, to }).then((r) => r.events),
  /** Schedule between two YYYY-MM-DD keys (exclusive end); splits into Nexus-sized chunks. */
  scheduleRange,
  assignments: (status: "due" | "overdue" | "submitted" | "all" = "all") =>
    callTool<{ assignments: Assignment[] }>("list_assignments", { status }).then((r) => r.assignments),
  grades: () =>
    callTool<{ assignmentMarks: AssignmentMark[] }>("get_grades").then((r) => r.assignmentMarks ?? []),
  attendance: () =>
    callTool<{ courses: AttendanceRow[] }>("get_attendance_summary").then((r) => r.courses ?? []),
  /** Per-course totals plus the most recent missed sessions (up to 50). */
  attendanceDetail: () =>
    callTool<{ courses: AttendanceRow[]; missedSessions: MissedSession[] }>("get_attendance_summary").then((r) => ({
      courses: r.courses ?? [],
      missedSessions: r.missedSessions ?? [],
    })),
  announcements: (sinceDays = 45) =>
    callTool<{ announcements: Announcement[] }>("list_announcements", { sinceDays }).then(
      (r) => r.announcements ?? [],
    ),
};
