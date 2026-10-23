import type { Assignment, ScheduleEvent } from "../nexus";
import { GoogleApiError, pool, type GCalendar, type GoogleCalendarApi } from "./api";
import { byId, CALENDAR_DESCRIPTION, CALENDAR_NAME, isOrbitCalendar } from "./calendars";
import { applyMove, buildDesired, detectMoves, diff, toExisting, TZ, type Prefs, type TaskLite, type TaskMove } from "./plan";

// One sync pass for one user. Everything it needs comes in through `deps`, so it can be tested against
// a fake Google. Orbit writes only to its own calendar, and only events it created (marked in
// extendedProperties.private), so nothing of yours is ever edited or deleted.

const WINDOW_DAYS = 45;
const DAY = 86_400_000;
const IST = 330 * 60_000;
const WRITERS = 4; // Google rate-limits bursts of writes, so a big first fill is paced rather than flooded

export type SyncDeps = {
  api: GoogleCalendarApi;
  calendarId: string | null;
  prefs: Prefs;
  now: number;
  nexus: {
    schedule(fromKey: string, toKey: string): Promise<ScheduleEvent[]>;
    assignments(): Promise<Assignment[]>;
  };
  tasks: {
    open(fromIso: string, toIso: string): Promise<TaskLite[]>;
    /** Writes tasks you moved in Google back to the database. */
    applyMoves(updated: (TaskLite & { reminded_at: null })[]): Promise<void>;
  };
  saveCalendarId(id: string): Promise<void>;
};

export type SyncSummary = {
  calendarId: string;
  created: number;
  updated: number;
  removed: number;
  moved: number;
  deletedInGoogle: number;
  unchanged: number;
  errors: number;
  firstError?: string;
};

const keyOf = (ms: number) => new Date(ms + IST).toISOString().slice(0, 10);

/** True when everything in the calendar was written by Orbit, so removing the calendar loses nothing of yours. */
async function onlyOrbitEvents(api: GoogleCalendarApi, id: string): Promise<boolean> {
  const events = await api.events(id, { timeMin: "2000-01-01T00:00:00Z", timeMax: "2100-01-01T00:00:00Z", maxResults: 2500 });
  return events.every((e) => e.extendedProperties?.private?.orbit === "1");
}

/**
 * The one Orbit calendar. Re-uses the stored one; otherwise adopts an existing "Orbit" calendar before
 * ever creating a new one; and if two syncs race and both create one, they agree on the winner and the
 * loser removes its own. Stray extra copies that hold only Orbit's own events are cleaned up.
 */
async function ensureCalendar(deps: SyncDeps): Promise<string> {
  const { api } = deps;
  let id: string | null = deps.calendarId;

  if (id) {
    try {
      await api.getCalendar(id);
    } catch (err) {
      if (!(err instanceof GoogleApiError && (err.status === 404 || err.status === 410))) throw err;
      id = null; // you deleted the Orbit calendar in Google
    }
  }

  const ours = (list: GCalendar[]) => list.filter((c) => isOrbitCalendar(c) && (c.accessRole === undefined || c.accessRole === "owner")).sort(byId);
  let known = ours(await api.calendars());

  if (!id) {
    if (known.length) {
      id = known[0].id; // adopt
    } else {
      const created = await api.createCalendar(CALENDAR_NAME, CALENDAR_DESCRIPTION, TZ);
      id = created.id;
      known = ours(await api.calendars());
      const winner = known[0]?.id ?? id;
      if (winner !== id) {
        await api.deleteCalendar(id).catch(() => undefined); // lost the race: drop mine, use theirs
        id = winner;
      }
    }
    await deps.saveCalendarId(id);
  }

  for (const extra of known) {
    if (extra.id === id) continue;
    try {
      if (await onlyOrbitEvents(api, extra.id)) await api.deleteCalendar(extra.id);
    } catch {
      /* a stray copy is untidy, not harmful: try again next time */
    }
  }
  return id;
}

export async function runGoogleSync(deps: SyncDeps): Promise<SyncSummary> {
  const { api, prefs, now } = deps;
  const calendarId = await ensureCalendar(deps);

  const todayKey = keyOf(now);
  const fromMs = Date.parse(`${todayKey}T00:00:00+05:30`);
  const toMs = fromMs + WINDOW_DAYS * DAY;
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();

  const [schedule, assignments, tasks, events] = await Promise.all([
    prefs.classes ? deps.nexus.schedule(`${todayKey}T00:00:00+05:30`, `${keyOf(toMs)}T00:00:00+05:30`) : Promise.resolve([]),
    prefs.deadlines ? deps.nexus.assignments() : Promise.resolve([]),
    prefs.tasks ? deps.tasks.open(fromIso, toIso) : Promise.resolve([]),
    // Everything in the Orbit calendar for the window, including deleted ones (so a deletion is respected).
    api.events(calendarId, { timeMin: fromIso, timeMax: toIso, showDeleted: true }),
  ]);

  const existing = events.map(toExisting);

  // Two-way: a task whose event you moved in Google takes the new time before anything is pushed back.
  const moves: TaskMove[] = prefs.tasks ? detectMoves(tasks, existing) : [];
  const moved = new Map(moves.map((m) => [m.taskId, m]));
  const current = tasks.map((t) => (moved.has(t.id) ? applyMove(t, moved.get(t.id) as TaskMove, now) : t));
  const movedRows = current.filter((t) => moved.has(t.id)) as (TaskLite & { reminded_at: null })[];
  if (movedRows.length) await deps.tasks.applyMoves(movedRows);

  const desired = buildDesired({ schedule, assignments, tasks: current, prefs, fromMs, toMs });
  const ops = diff(desired, existing);

  let deletedInGoogle = ops.deletedInGoogle;
  let created = 0;
  let updated = 0;
  let removed = 0;
  const failures = [
    ...(await pool(ops.create, WRITERS, async (d) => {
      try {
        await api.insertEvent(calendarId, { ...d.body, id: d.id });
        created++;
      } catch (err) {
        // 409: the id exists but was not in our list (a deleted event outside the window). Leave it deleted.
        if (err instanceof GoogleApiError && err.status === 409) deletedInGoogle++;
        else throw err;
      }
    })),
    ...(await pool(ops.update, WRITERS, async (u) => {
      await api.updateEvent(calendarId, u.id, u.desired.body);
      updated++;
    })),
    ...(await pool(ops.remove, WRITERS, async (id) => {
      await api.deleteEvent(calendarId, id);
      removed++;
    })),
  ];

  return {
    calendarId,
    created,
    updated,
    removed,
    moved: movedRows.length,
    deletedInGoogle,
    unchanged: ops.unchanged,
    errors: failures.length,
    firstError: failures[0] ? (failures[0].error instanceof Error ? failures[0].error.message : String(failures[0].error)).slice(0, 200) : undefined,
  };
}
