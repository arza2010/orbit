import type { Announcement, Assignment, ScheduleEvent } from "./nexus";
import { toCalEvent, type CalEvent } from "./calendar";
import { matchProgram, PROGRAM_ORDER, type ProgramId } from "./programs";
import { toAnnouncementLite, type AnnouncementLite } from "./courses";
import { sortDeadlines, toDeadline, type Deadline } from "./today";

export type ProgramBlock = {
  id: ProgramId;
  upcoming: CalEvent[];
  past: CalEvent[];
  announcements: AnnouncementLite[];
  deadlines: Deadline[];
  /** Hours of scheduled building time over the next 14 days (sprint labs only). */
  buildHours: number;
  milestones: CalEvent[];
};

const DAY = 86_400_000;

const textOf = (e: { course: string | null; title: string }) => `${e.course ?? ""} ${e.title}`;

export function buildPrograms(
  events: ScheduleEvent[],
  assignments: Assignment[],
  announcements: Announcement[],
  nowMs: number,
): ProgramBlock[] {
  const cal = events.filter((e) => e.type !== "holiday").map((e) => ({ raw: e, ev: toCalEvent(e) }));

  return PROGRAM_ORDER.map((id) => {
    const mine = cal.filter(({ raw }) => matchProgram(textOf(raw)) === id).map(({ ev }) => ev);
    mine.sort((a, b) => a.startMs - b.startMs);

    const upcoming = mine.filter((e) => e.startMs >= nowMs && !e.cancelled);
    const past = mine.filter((e) => e.endMs < nowMs).reverse();

    const buildHours =
      id === "sprint-labs"
        ? upcoming
            .filter((e) => /building time/i.test(e.title) && e.startMs < nowMs + 14 * DAY)
            .reduce((s, e) => s + (e.endMs - e.startMs), 0) / 3_600_000
        : 0;

    const milestones = id === "sprint-labs" ? upcoming.filter((e) => /demo day|orientation|final|presentation/i.test(e.title)) : [];

    const deadlines = sortDeadlines(
      assignments
        .filter((a) => a.submissionStatus !== "submitted" && matchProgram(`${a.course ?? ""} ${a.title}`) === id)
        .map((a) => toDeadline(a, nowMs)),
      nowMs,
    );

    const anns = announcements
      .filter((a) => matchProgram(`${a.title} ${a.course ?? ""}`) === id || (id === "office-hours" && /office hour/i.test(a.body.slice(0, 200))))
      .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
      .slice(0, 3)
      .map(toAnnouncementLite);

    return { id, upcoming, past, announcements: anns, deadlines, buildHours: Math.round(buildHours * 10) / 10, milestones };
  });
}
