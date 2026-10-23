import type { AttendanceRow, MissedSession, ScheduleEvent } from "./nexus";
import { courseHue, shortCourse } from "./course";

// Mesa's rule: at least 75% attendance in every class. All the arithmetic is done in whole numbers
// (4 * attended >= 3 * total) so there is no rounding at the boundary: 75.0% is a pass.

export const MIN_PCT = 75;
const NUM = 3; // MIN_PCT as a fraction: 3 / 4
const DEN = 4;

export type Standing =
  | "safe" //     can miss two or more of the remaining classes and still finish at 75%+
  | "tight" //    above 75% but with at most one class to spare
  | "recover" //  below 75% now, but still reachable by attending the classes left
  | "lost" //     even attending every remaining class would finish under 75%
  | "passed" //   no classes left, finished at 75%+
  | "short"; //   no classes left, finished under 75%

export type Analysis = {
  attended: number;
  total: number;
  /** Percentage with one decimal, as Nexus shows it. */
  pct: number;
  remaining: number;
  standing: Standing;
  /** Classes that can still be missed (out of `remaining`) while finishing at 75%+. 0 when it can't be done. */
  canMiss: number;
  /** Classes that must be attended out of `remaining` to finish at 75%+. Above `remaining` means out of reach. */
  mustAttend: number;
  /** Best percentage still possible: attend everything left. */
  bestFinal: number;
  /** Where you'd be if you attend every remaining class and miss none. Same as bestFinal. */
  ifMissNext: number;
  ifAttendNext: number;
  /** Classes in a row to attend to climb back to 75% (0 if already there). Ignores how many are left. */
  climbBack: number;
  /** Extra classes that could be missed right now before dropping under 75%, ignoring the schedule. */
  buffer: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const pctOf = (a: number, t: number) => (t > 0 ? round1((a / t) * 100) : 100);
const reaches = (a: number, t: number) => DEN * a >= NUM * t;

export function analyse(row: { attended: number; total: number }, remaining: number): Analysis {
  const a = Math.max(0, row.attended);
  const t = Math.max(a, row.total);
  const r = Math.max(0, remaining);

  const mustAttend = Math.max(0, Math.ceil((NUM * (t + r)) / DEN) - a);
  const canMiss = mustAttend > r ? 0 : r - mustAttend;
  const bestFinal = pctOf(a + r, t + r);

  let standing: Standing;
  if (r === 0) standing = reaches(a, t) ? "passed" : "short";
  else if (mustAttend > r) standing = "lost";
  else if (!reaches(a, t)) standing = "recover";
  else standing = canMiss <= 1 ? "tight" : "safe";

  return {
    attended: a,
    total: t,
    pct: pctOf(a, t),
    remaining: r,
    standing,
    canMiss,
    mustAttend,
    bestFinal,
    ifMissNext: pctOf(a, t + 1),
    ifAttendNext: pctOf(a + 1, t + 1),
    climbBack: Math.max(0, NUM * t - DEN * a),
    buffer: reaches(a, t) ? Math.floor((DEN * a - NUM * t) / NUM) : 0,
  };
}

/** One plain sentence on what to do next. */
export function advice(x: Analysis): string {
  const left = x.remaining;
  const cls = (n: number) => `${n} ${n === 1 ? "class" : "classes"}`;
  switch (x.standing) {
    case "passed":
      return `Term done. You finished at ${x.pct}%, above the ${MIN_PCT}% line.`;
    case "short":
      return `Term done. You finished at ${x.pct}%, ${round1(MIN_PCT - x.pct)} points under the ${MIN_PCT}% line.`;
    case "lost":
      return `Out of reach: even attending all ${cls(left)} left only gets you to ${x.bestFinal}%. Talk to the program team.`;
    case "recover":
      return x.mustAttend >= left
        ? `Attend all ${cls(left)} left to get back above ${MIN_PCT}%. No more misses.`
        : `Attend at least ${x.mustAttend} of the ${left} left to finish at ${MIN_PCT}%. You can miss ${x.canMiss}.`;
    case "tight":
      return x.canMiss === 0
        ? `Don't miss any of the ${cls(left)} left. You're right on the line.`
        : `One spare. You can miss 1 of the ${cls(left)} left.`;
    case "safe":
      return `You can miss ${x.canMiss} of the ${cls(left)} left and still finish at ${MIN_PCT}%.`;
  }
}

export const STANDING_LABEL: Record<Standing, string> = {
  safe: "Safe",
  tight: "Tight",
  recover: "Recover",
  lost: "Out of reach",
  passed: "Passed",
  short: "Fell short",
};

/** Worst first, for putting what needs attention at the top. */
const SEVERITY: Record<Standing, number> = { lost: 0, short: 1, recover: 2, tight: 3, safe: 4, passed: 5 };
export const bySeverity = (a: Standing, b: Standing) => SEVERITY[a] - SEVERITY[b];
export const needsAttention = (s: Standing) => s === "lost" || s === "recover" || s === "tight" || s === "short";

// ---- Joining Nexus data -----------------------------------------------------

export type Dot = { startMs: number; label: string; present: boolean };

export type CourseAttendance = {
  course: string;
  short: string;
  term: string;
  hue: number;
  analysis: Analysis;
  /** One dot per counted class, oldest first. Only set when it lines up exactly with Nexus's totals. */
  dots: Dot[] | null;
  missed: { startMs: number; label: string; session: string }[];
  participationAvg: number | null;
  next: { startMs: number; title: string } | null;
};

const counts = (e: ScheduleEvent) => e.type === "session" && e.attendanceRequired && !e.cancelled && !!e.course;

export function buildAttendance(
  rows: AttendanceRow[],
  missedSessions: MissedSession[],
  schedule: ScheduleEvent[],
  nowMs: number,
): CourseAttendance[] {
  const byCourse = new Map<string, ScheduleEvent[]>();
  for (const e of schedule) {
    if (!counts(e)) continue;
    const key = e.course as string;
    byCourse.set(key, [...(byCourse.get(key) ?? []), e]);
  }

  return rows.map((row) => {
    const sessions = (byCourse.get(row.course) ?? []).sort((x, y) => Date.parse(x.start) - Date.parse(y.start));
    const future = sessions.filter((e) => Date.parse(e.start) > nowMs);
    const past = sessions.filter((e) => Date.parse(e.start) <= nowMs);

    const missed = missedSessions
      .filter((m) => m.course === row.course)
      .map((m) => ({ startMs: Date.parse(m.date), label: m.day, session: m.session }))
      .sort((x, y) => y.startMs - x.startMs);
    const missedKeys = new Set(missed.map((m) => m.startMs));

    // The strip is only trustworthy when it reproduces Nexus's own counts.
    const dots: Dot[] = past.map((e) => ({ startMs: Date.parse(e.start), label: e.day, present: !missedKeys.has(Date.parse(e.start)) }));
    const matches = dots.length === row.total && dots.filter((d) => d.present).length === row.attended;

    const next = future[0] ? { startMs: Date.parse(future[0].start), title: future[0].title } : null;
    return {
      course: row.course,
      short: shortCourse(row.course),
      term: row.term,
      hue: courseHue(row.course),
      analysis: analyse(row, future.length),
      dots: matches ? dots : null,
      missed,
      participationAvg: row.participationAvg,
      next,
    };
  });
}

/** "Term 2" -> 2, for ordering. Unknown terms sort last. */
export const termNumber = (term: string) => Number(/(\d+)/.exec(term)?.[1] ?? -1);

export function termsOf(list: CourseAttendance[]): string[] {
  return [...new Set(list.map((c) => c.term))].sort((a, b) => termNumber(b) - termNumber(a));
}

export function termSummary(list: CourseAttendance[]) {
  const attended = list.reduce((n, c) => n + c.analysis.attended, 0);
  const total = list.reduce((n, c) => n + c.analysis.total, 0);
  const count = (f: (s: Standing) => boolean) => list.filter((c) => f(c.analysis.standing)).length;
  return {
    attended,
    total,
    pct: pctOf(attended, total),
    classes: list.length,
    safe: count((s) => s === "safe" || s === "passed"),
    tight: count((s) => s === "tight"),
    trouble: count((s) => s === "recover" || s === "lost" || s === "short"),
  };
}
