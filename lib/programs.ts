// Which parts of Mesa life are "programs" rather than academic courses.
// Edit these patterns to move things around; everything else follows from them.

export type ProgramId = "startup-leader" | "sprint-labs" | "office-hours";

export const PROGRAMS: Record<
  ProgramId,
  { name: string; sub: string; hue: number; match: RegExp; blurb: string }
> = {
  "startup-leader": {
    name: "Startup Leader",
    sub: "Founder sessions and case pre-work",
    hue: 28,
    match: /start-?up\s*leader|^startup$/i,
    blurb: "Guest founders, a case to prep, and an opt-in before each session.",
  },
  "sprint-labs": {
    name: "Sprint Labs",
    sub: "BSL · ILS · Building Time",
    hue: 160,
    match: /business sprint lab|idea lab sprint|\bbsl\b|\bils\b|building time|demo day/i,
    blurb: "Build blocks, sprint milestones and Demo Day.",
  },
  "office-hours": {
    name: "Office Hours",
    sub: "Open hours and 1:1 slots",
    hue: 258,
    match: /office hours?|doubt clearing/i,
    blurb: "Open office hours, doubt clearing and bookable 1:1 slots.",
  },
};

export const PROGRAM_ORDER: ProgramId[] = ["startup-leader", "sprint-labs", "office-hours"];

/** Order matters: the first match wins. */
export function matchProgram(text: string): ProgramId | null {
  if (PROGRAMS["office-hours"].match.test(text)) return "office-hours";
  if (PROGRAMS["startup-leader"].match.test(text)) return "startup-leader";
  if (PROGRAMS["sprint-labs"].match.test(text)) return "sprint-labs";
  return null;
}

// Course-list entries that are not academic courses (kept out of the Courses grid).
const NON_ACADEMIC =
  /^(startup leader|business sprint lab|idea lab sprint|sector spotlight|specialisation primer|mesa start-up lab|career readiness|student experience|workshops?|orientation week|start strong|ai workshops|building time|open office hours)\b/i;

export const isAcademicCourse = (title: string) => !NON_ACADEMIC.test(title);
