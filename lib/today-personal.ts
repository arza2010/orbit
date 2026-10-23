import "server-only";
import type { CalEvent } from "./calendar";
import { readGoogleEvents } from "./gcal/service";
import { listDueTasks } from "./life/queries";
import { createClient } from "./supabase/server";
import { addDays, fmtTime } from "./time";
import type { DayEvent, Personal } from "./today";

// The personal half of the Today screen. Each source is optional and fails on its own: if Google or the
// tasks table is unreachable, Today still shows your classes and says nothing about the missing part.

const TASK_MINUTES = 30;
const TASK_HUE = 45;
const DAYS_AHEAD = 4; // today plus the three "coming up" days

const iso = (ms: number) => new Date(ms).toISOString();

export function googleToDayEvent(e: CalEvent): DayEvent {
  return {
    id: e.id,
    title: e.title,
    course: e.course,
    type: "google",
    start: iso(e.startMs),
    end: iso(e.endMs),
    range: e.range,
    room: e.room,
    instructor: null,
    link: e.link,
    attendance: false,
    cancelled: false,
    hue: e.hue,
    source: "google",
  };
}

type TaskRow = { id: string; title: string; due_at: string };

export function taskToDayEvent(t: TaskRow): DayEvent {
  const s = Date.parse(t.due_at);
  const e = s + TASK_MINUTES * 60_000;
  return {
    id: `task:${t.id}`,
    title: "Task",
    course: t.title,
    type: "task",
    start: iso(s),
    end: iso(e),
    range: `${fmtTime(iso(s))} – ${fmtTime(iso(e))}`,
    room: null,
    instructor: null,
    link: null,
    attendance: false,
    cancelled: false,
    hue: TASK_HUE,
    source: "task",
  };
}

export async function loadPersonal(userId: string, todayKey: string): Promise<Personal> {
  const toKey = addDays(todayKey, DAYS_AHEAD);
  const out: Personal = { events: [], allDay: [], tasksDue: 0 };

  await Promise.all([
    (async () => {
      try {
        const db = await createClient();
        const read = await readGoogleEvents(db, userId, todayKey, toKey);
        for (const e of read.events) {
          if (e.allDay) out.allDay.push({ dayKey: e.dayKey, title: e.course, hue: e.hue });
          else out.events.push(googleToDayEvent(e));
        }
      } catch (err) {
        console.error("Today: Google events failed", err instanceof Error ? err.message : err);
      }
    })(),
    (async () => {
      try {
        const db = await createClient();
        const { data, error } = await db
          .from("tasks")
          .select("id,title,due_at")
          .is("done_at", null)
          .eq("due_has_time", true)
          .gte("due_at", `${todayKey}T00:00:00+05:30`)
          .lt("due_at", `${toKey}T00:00:00+05:30`);
        if (error) throw new Error(error.message);
        out.events.push(...((data ?? []) as TaskRow[]).map(taskToDayEvent));
      } catch (err) {
        console.error("Today: timed tasks failed", err instanceof Error ? err.message : err);
      }
    })(),
    (async () => {
      try {
        out.tasksDue = (await listDueTasks(todayKey)).length;
      } catch {
        /* the tasks card already reports its own failure */
      }
    })(),
  ]);
  return out;
}
