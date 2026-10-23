import { createHash } from "node:crypto";
import { courseHue } from "../course";
import type { Assignment, ScheduleEvent } from "../nexus";
import type { GEvent } from "./api";
import type { Prefs } from "./prefs";

export { CLASS_REMINDER_CHOICES, DEFAULT_PREFS, parsePrefs, type Prefs } from "./prefs";

// Pure planning for the Orbit <-> Google Calendar sync. Nothing here touches the network or the clock:
//   buildDesired()  what should exist in the Orbit calendar, from Nexus data and your tasks
//   detectMoves()   tasks whose event you dragged to a new time in Google (Google wins)
//   diff()          create / update / remove operations to get from "what exists" to "what should"

export const TZ = "Asia/Kolkata";
const IST_MIN = 330;
const TASK_MINUTES = 30;
const DEADLINE_MINUTES = 20;
const DEADLINE_REMINDERS = [180, 60];

export type TaskLite = {
  id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  due_has_time: boolean;
  remind_at: string | null;
  course: string | null;
  priority: number;
  done_at: string | null;
};

export type Desired = {
  /** Stable key, e.g. "class:<nexus id>". */
  ref: string;
  /** Google event id: derived from `ref`, so re-running a sync can never create a duplicate. */
  id: string;
  kind: "class" | "deadline" | "task";
  taskId?: string;
  hash: string;
  /** The start we wrote: epoch ms for timed events, YYYY-MM-DD for all-day. Used to spot a move made in Google. */
  startKey: string;
  body: Omit<GEvent, "id">;
};

// ---- helpers ----------------------------------------------------------------

/** Event ids must be 5-1024 chars of a-v and 0-9. A hex digest fits, and "orbit" marks them as ours. */
export const eventIdFor = (ref: string) => `orbit${createHash("sha1").update(ref).digest("hex").slice(0, 32)}`;

const dayOf = (ms: number) => new Date(ms + IST_MIN * 60_000).toISOString().slice(0, 10);

/** Epoch ms as an ISO string in India time, e.g. 2026-10-21T14:00:00+05:30. */
export function istIso(ms: number): string {
  const d = new Date(ms + IST_MIN * 60_000).toISOString();
  return `${d.slice(0, 19)}+05:30`;
}

export const dueFromDateKey = (key: string) => `${key}T23:59:00+05:30`;

/** Google's predefined event colours, picked to be close to the course colour used in Orbit. */
export function colorForHue(hue: number): string {
  const h = ((hue % 360) + 360) % 360;
  if (h < 20 || h >= 340) return "11"; // tomato
  if (h < 40) return "6"; //             tangerine
  if (h < 70) return "5"; //             banana
  if (h < 165) return "10"; //           basil
  if (h < 205) return "7"; //            peacock
  if (h < 240) return "9"; //            blueberry
  if (h < 280) return "3"; //            grape
  return "4"; //                          flamingo
}

const sha = (v: unknown) => createHash("sha1").update(JSON.stringify(v)).digest("hex").slice(0, 16);

function reminders(minutes: number[]): GEvent["reminders"] {
  return { useDefault: false, overrides: minutes.map((m) => ({ method: "popup" as const, minutes: m })) };
}

function make(
  kind: Desired["kind"],
  ref: string,
  startKey: string,
  fields: Omit<GEvent, "id" | "extendedProperties">,
  taskId?: string,
): Desired {
  const hash = sha({ kind, fields });
  return {
    ref,
    id: eventIdFor(ref),
    kind,
    taskId,
    hash,
    startKey,
    body: {
      ...fields,
      transparency: "opaque",
      extendedProperties: { private: { orbit: "1", orbitRef: ref, orbitHash: hash, orbitStart: startKey } },
    },
  };
}

// ---- what should exist --------------------------------------------------------

export function buildDesired(args: {
  schedule: ScheduleEvent[];
  assignments: Assignment[];
  tasks: TaskLite[];
  prefs: Prefs;
  /** Window to cover (epoch ms). Items outside it are ignored, so nothing out there is ever deleted. */
  fromMs: number;
  toMs: number;
}): Desired[] {
  const { prefs, fromMs, toMs } = args;
  const out: Desired[] = [];

  if (prefs.classes) {
    for (const e of args.schedule) {
      if (e.cancelled || e.type === "holiday") continue;
      const s = Date.parse(e.start);
      const en = Date.parse(e.end);
      if (!Number.isFinite(s) || !Number.isFinite(en) || s < fromMs || s >= toMs) continue;
      const lines = [
        e.instructor ? `With ${e.instructor}` : null,
        e.attendanceRequired ? "Attendance required" : null,
        e.meetingLink ? `Join: ${e.meetingLink}` : null,
        e.notes ? `\n${e.notes}` : null,
        "\nSynced from Nexus by Orbit",
      ].filter(Boolean);
      out.push(
        make("class", `class:${e.id}`, String(s), {
          summary: e.title,
          description: lines.join("\n"),
          location: e.room ?? undefined,
          start: { dateTime: istIso(s), timeZone: TZ },
          end: { dateTime: istIso(en > s ? en : s + 30 * 60_000), timeZone: TZ },
          colorId: colorForHue(courseHue(e.course ?? e.title)),
          reminders: reminders(prefs.classReminder === null ? [] : [prefs.classReminder]),
        }),
      );
    }
  }

  if (prefs.deadlines) {
    for (const a of args.assignments) {
      if (!a.dueAt || a.submissionStatus === "submitted") continue;
      const due = Date.parse(a.dueAt);
      if (!Number.isFinite(due) || due < fromMs || due >= toMs) continue;
      out.push(
        make("deadline", `due:${a.id}`, String(due), {
          summary: `Due: ${a.title}`,
          description: [a.course, a.maxMarks ? `${a.maxMarks} marks` : null, a.isGroup ? "Group submission" : null, "\nSynced from Nexus by Orbit"].filter(Boolean).join("\n"),
          start: { dateTime: istIso(due), timeZone: TZ },
          end: { dateTime: istIso(due + DEADLINE_MINUTES * 60_000), timeZone: TZ },
          colorId: "11",
          reminders: reminders(DEADLINE_REMINDERS),
        }),
      );
    }
  }

  if (prefs.tasks) {
    for (const t of args.tasks) {
      if (t.done_at || !t.due_at) continue;
      const due = Date.parse(t.due_at);
      if (!Number.isFinite(due) || due < fromMs || due >= toMs) continue;
      const description = [t.notes, t.course, t.priority >= 3 ? "High priority" : null, "\nSynced from your Orbit tasks"].filter(Boolean).join("\n");
      const summary = `Task: ${t.title}`;
      if (t.due_has_time) {
        const lead = t.remind_at ? Math.round((due - Date.parse(t.remind_at)) / 60_000) : null;
        out.push(
          make(
            "task",
            `task:${t.id}`,
            String(due),
            {
              summary,
              description,
              start: { dateTime: istIso(due), timeZone: TZ },
              end: { dateTime: istIso(due + TASK_MINUTES * 60_000), timeZone: TZ },
              colorId: "5",
              reminders: reminders(lead !== null && lead >= 0 && lead <= 40_320 ? [lead] : []),
            },
            t.id,
          ),
        );
      } else {
        const day = dayOf(due);
        const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
        out.push(make("task", `task:${t.id}`, day, { summary, description, start: { date: day }, end: { date: next }, colorId: "5", reminders: reminders([]) }, t.id));
      }
    }
  }

  return out;
}

// ---- what exists --------------------------------------------------------------

export type Existing = {
  id: string;
  status: string;
  ref: string | null;
  hash: string | null;
  /** Where we last put it. */
  pushedStart: string | null;
  /** Where it is now: epoch ms or YYYY-MM-DD. */
  startKey: string | null;
  allDay: boolean;
};

export function toExisting(e: GEvent): Existing {
  const p = e.extendedProperties?.private ?? {};
  const allDay = !!e.start?.date && !e.start?.dateTime;
  const startKey = e.start?.dateTime ? String(Date.parse(e.start.dateTime)) : (e.start?.date ?? null);
  return {
    id: e.id,
    status: e.status ?? "confirmed",
    ref: p.orbitRef ?? null,
    hash: p.orbitHash ?? null,
    pushedStart: p.orbitStart ?? null,
    startKey,
    allDay,
  };
}

export type TaskMove = { taskId: string; dueAt: string; hasTime: boolean; startKey: string };

/** Tasks whose event now starts somewhere other than where Orbit put it. Cancelled events don't count. */
export function detectMoves(tasks: TaskLite[], existing: Existing[]): TaskMove[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const moves: TaskMove[] = [];
  for (const t of tasks) {
    if (t.done_at || !t.due_at) continue;
    const ex = byId.get(eventIdFor(`task:${t.id}`));
    if (!ex || ex.status === "cancelled" || !ex.startKey || !ex.pushedStart || ex.startKey === ex.pushedStart) continue;
    if (ex.allDay) moves.push({ taskId: t.id, dueAt: dueFromDateKey(ex.startKey), hasTime: false, startKey: ex.startKey });
    else moves.push({ taskId: t.id, dueAt: istIso(Number(ex.startKey)), hasTime: true, startKey: ex.startKey });
  }
  return moves;
}

/** The task as it should look after a move: new due time, and the reminder shifted by the same amount. */
export function applyMove(t: TaskLite, move: TaskMove, nowMs: number): TaskLite & { reminded_at: null } {
  let remind = t.remind_at;
  if (remind && t.due_at) {
    const shifted = Date.parse(remind) + (Date.parse(move.dueAt) - Date.parse(t.due_at));
    remind = move.hasTime && shifted > nowMs ? new Date(shifted).toISOString() : null; // a reminder in the past would fire at once
  }
  return { ...t, due_at: move.dueAt, due_has_time: move.hasTime, remind_at: remind, reminded_at: null };
}

// ---- the difference -------------------------------------------------------------

export type Ops = {
  create: Desired[];
  update: { id: string; desired: Desired }[];
  /** Orbit events that should no longer exist (class cancelled, task done, deadline submitted...). */
  remove: string[];
  /** Events you deleted in Google. They are left deleted. */
  deletedInGoogle: number;
  unchanged: number;
};

export function diff(desired: Desired[], existing: Existing[]): Ops {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const want = new Set(desired.map((d) => d.id));
  const ops: Ops = { create: [], update: [], remove: [], deletedInGoogle: 0, unchanged: 0 };

  for (const d of desired) {
    const ex = byId.get(d.id);
    if (!ex) ops.create.push(d);
    else if (ex.status === "cancelled") ops.deletedInGoogle++;
    else if (ex.hash !== d.hash) ops.update.push({ id: ex.id, desired: d });
    else ops.unchanged++;
  }
  for (const ex of existing) {
    if (!want.has(ex.id) && ex.status !== "cancelled" && ex.ref) ops.remove.push(ex.id);
  }
  return ops;
}
