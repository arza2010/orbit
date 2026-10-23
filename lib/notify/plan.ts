import { dayKey, fmtDayLabel, fmtDuration, fmtTime, istHour } from "@/lib/time";

// Decides which notifications to send right now. Pure: no clock, no network, no database. Everything it
// needs is passed in, so every rule here is covered by tests.

export type Kind = "assignment" | "task" | "announcement" | "digest" | "test";

export type Settings = {
  enabled: { assignment: boolean; task: boolean; announcement: boolean; digest: boolean };
  quietStart: number; // hour 0-23, India time
  quietEnd: number;
  /** ISO time of the newest announcement already handled. null = never run before. */
  announcementsCursor: string | null;
};

export type AssignmentIn = { id: string; title: string; course: string | null; dueAt: string | null; submitted: boolean };
export type TaskIn = {
  id: string;
  title: string;
  due_at: string | null;
  due_has_time: boolean;
  remind_at: string | null;
  reminded_at: string | null;
  done_at: string | null;
};
export type AnnouncementIn = { id: string; title: string; postedAt: string };

export type Planned = { kind: Kind; ref: string; title: string; body: string; url: string };

export type PlanResult = {
  notifications: Planned[];
  /** Tasks to stamp as reminded (so they never fire twice). */
  remindedTaskIds: string[];
  announcementsCursor: string | null;
  quiet: boolean;
};

const HOUR = 3_600_000;

/** Lead times before an assignment deadline, longest first. Only the most urgent one that applies is sent. */
export const ASSIGNMENT_LEADS = [
  { key: "24h", ms: 24 * HOUR },
  { key: "3h", ms: 3 * HOUR },
  { key: "1h", ms: 1 * HOUR },
] as const;

export const MAX_PER_RUN = 5;
const TASK_STALE_MS = 48 * HOUR;
const DIGEST_FROM_HOUR = 8;
const DIGEST_UNTIL_HOUR = 12;
const MAX_ANNOUNCEMENTS_INDIVIDUAL = 3;

/** Is `nowMs` inside quiet hours? Handles ranges that wrap past midnight (23 to 7). */
export function isQuiet(nowMs: number, start: number, end: number): boolean {
  if (start === end) return false;
  const h = istHour(new Date(nowMs).toISOString());
  return start < end ? h >= start && h < end : h >= start || h < end;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function planNotifications(args: {
  nowMs: number;
  assignments: AssignmentIn[];
  tasks: TaskIn[];
  announcements: AnnouncementIn[];
  settings: Settings;
  /** `ref` values already sent (from the notifications table). */
  sentRefs: ReadonlySet<string>;
}): PlanResult {
  const { nowMs, assignments, tasks, announcements, settings, sentRefs } = args;
  const quiet = isQuiet(nowMs, settings.quietStart, settings.quietEnd);
  const out: Planned[] = [];
  const remindedTaskIds: string[] = [];
  let cursor = settings.announcementsCursor;

  // Announcements: the first ever run only sets the cursor, so the backlog never floods your phone.
  const newest = announcements.reduce<string | null>((m, a) => (m === null || a.postedAt > m ? a.postedAt : m), null);
  const firstRun = cursor === null;
  if (cursor === null) cursor = newest ?? new Date(nowMs).toISOString();
  const startCursor = cursor;

  // Nothing is sent during quiet hours; it all waits (and still fires afterwards if still relevant).
  if (quiet) return { notifications: [], remindedTaskIds: [], announcementsCursor: startCursor, quiet };

  // ---- assignments
  if (settings.enabled.assignment) {
    for (const a of assignments) {
      if (a.submitted || !a.dueAt) continue;
      const due = Date.parse(a.dueAt);
      if (!Number.isFinite(due) || due <= nowMs) continue; // overdue ones are not nagged
      const left = due - nowMs;
      // The most urgent lead whose window has opened.
      const lead = [...ASSIGNMENT_LEADS].reverse().find((l) => left <= l.ms);
      if (!lead) continue;
      const ref = `assignment:${a.id}:${lead.key}`;
      if (sentRefs.has(ref)) continue;
      // If a tighter alert already went out, a looser one must not follow it.
      if (ASSIGNMENT_LEADS.some((l) => l.ms < lead.ms && sentRefs.has(`assignment:${a.id}:${l.key}`))) continue;

      out.push({
        kind: "assignment",
        ref,
        title: `Due in ${fmtDuration(left)}: ${a.title}`,
        body: `${a.course ? `${a.course} · ` : ""}${fmtDayLabel(dayKey(a.dueAt))}, ${fmtTime(a.dueAt)}`,
        url: "/courses",
      });
    }
  }

  // ---- personal tasks
  if (settings.enabled.task) {
    for (const t of tasks) {
      if (t.done_at || t.reminded_at || !t.remind_at) continue;
      const at = Date.parse(t.remind_at);
      if (!Number.isFinite(at) || at > nowMs) continue;
      if (nowMs - at > TASK_STALE_MS) continue; // too old to be useful
      if (sentRefs.has(`task:${t.id}`)) continue;
      remindedTaskIds.push(t.id);
      out.push({
        kind: "task",
        ref: `task:${t.id}`,
        title: t.title,
        body: t.due_at
          ? t.due_has_time
            ? `Due ${fmtDayLabel(dayKey(t.due_at))}, ${fmtTime(t.due_at)}`
            : `Due ${fmtDayLabel(dayKey(t.due_at))}`
          : "Reminder",
        url: "/life?tab=tasks",
      });
    }
  }

  // ---- announcements
  if (settings.enabled.announcement && !firstRun) {
    const fresh = announcements
      .filter((a) => a.postedAt > (cursor as string) && !sentRefs.has(`announcement:${a.id}`))
      .sort((a, b) => a.postedAt.localeCompare(b.postedAt));
    if (fresh.length > MAX_ANNOUNCEMENTS_INDIVIDUAL) {
      out.push({
        kind: "announcement",
        ref: `announcement:batch:${fresh[fresh.length - 1].id}`,
        title: `${fresh.length} new announcements on Nexus`,
        body: fresh.slice(-3).map((a) => a.title).join(" · "),
        url: "/inbox",
      });
    } else {
      for (const a of fresh) out.push({ kind: "announcement", ref: `announcement:${a.id}`, title: a.title, body: "New on Nexus", url: "/inbox" });
    }
  }
  if (newest && newest > cursor) cursor = newest;

  // ---- morning digest
  const hour = istHour(new Date(nowMs).toISOString());
  const today = dayKey(new Date(nowMs));
  const digestRef = `digest:${today}`;
  if (settings.enabled.digest && hour >= DIGEST_FROM_HOUR && hour < DIGEST_UNTIL_HOUR && !sentRefs.has(digestRef)) {
    const tasksToday = tasks.filter((t) => !t.done_at && t.due_at && dayKey(t.due_at) <= today);
    const soon = assignments.filter((a) => !a.submitted && a.dueAt && Date.parse(a.dueAt) > nowMs && Date.parse(a.dueAt) <= nowMs + 48 * HOUR);
    if (tasksToday.length || soon.length) {
      const bits = [
        tasksToday.length ? plural(tasksToday.length, "task") : null,
        soon.length ? `${plural(soon.length, "assignment")} due soon` : null,
      ].filter(Boolean);
      out.push({
        kind: "digest",
        ref: digestRef,
        title: `Today: ${bits.join(" and ")}`,
        body: [...tasksToday.map((t) => t.title), ...soon.map((a) => a.title)].slice(0, 3).join(" · "),
        url: "/",
      });
    }
  }

  // A cap keeps one bad run from burying the phone. Urgent kinds go first.
  const rank: Record<Kind, number> = { assignment: 0, task: 1, announcement: 2, digest: 3, test: 4 };
  out.sort((a, b) => rank[a.kind] - rank[b.kind]);
  const sent = out.slice(0, MAX_PER_RUN);
  const keptTasks = new Set(sent.filter((n) => n.kind === "task").map((n) => n.ref.slice(5)));
  // If the cap pushed an announcement out, don't move the cursor past it: it must go next run.
  const droppedAnnouncement = out.slice(MAX_PER_RUN).some((n) => n.kind === "announcement");
  return {
    notifications: sent,
    remindedTaskIds: remindedTaskIds.filter((id) => keptTasks.has(id)),
    announcementsCursor: droppedAnnouncement ? startCursor : cursor,
    quiet,
  };
}

/** When a task's reminder should fire, or null for none. `lead` is "none" | "at" | "15m" | "1h" | "1d". */
export type Lead = "none" | "at" | "15m" | "1h" | "1d";
export const LEAD_MS: Record<Exclude<Lead, "none">, number> = { at: 0, "15m": 15 * 60_000, "1h": HOUR, "1d": 24 * HOUR };

export function remindAtFor(args: { dueAt: string | null; hasTime: boolean; lead: Lead; nowMs: number }): string | null {
  const { dueAt, hasTime, lead, nowMs } = args;
  if (!dueAt || lead === "none") return null;
  // Date-only tasks remind at 9 am India time on the due day (minus the lead).
  const base = hasTime ? Date.parse(dueAt) : Date.parse(`${dayKey(dueAt)}T09:00:00+05:30`);
  if (!Number.isFinite(base)) return null;
  const at = base - LEAD_MS[lead];
  return at > nowMs ? new Date(at).toISOString() : null; // a reminder in the past would just fire instantly
}

