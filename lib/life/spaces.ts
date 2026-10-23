import { addDays, dayKey } from "@/lib/time";
import type { Task } from "./tasks";

export type Space = { id: string; name: string; emoji: string; hue: number; intention: string | null; position: number };
export type ProjectStatus = "active" | "paused" | "done";
export type Project = { id: string; space_id: string; name: string; description: string | null; status: ProjectStatus; due_on: string | null };
export type Stage = "todo" | "doing" | "done";
export type SpaceTask = Task & { space_id: string | null; project_id: string | null; stage: "todo" | "doing"; why: string | null };
export type Rating = { space_id: string; rating: number; rated_on: string };
export type Checkin = { day: string; mood: number | null; energy: number | null; note: string | null };
export type Review = { week_start: string; wins: string | null; change: string | null; focus: string | null };

export const stageOf = (t: Pick<SpaceTask, "done_at" | "stage">): Stage => (t.done_at ? "done" : t.stage);

export const STAGES: { id: Stage; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "doing", label: "Doing" },
  { id: "done", label: "Done" },
];

export const MOODS = [
  { value: 1, emoji: "😞", label: "Rough" },
  { value: 2, emoji: "😕", label: "Meh" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
];

export const ENERGY = [
  { value: 1, label: "Drained" },
  { value: 2, label: "Low" },
  { value: 3, label: "Steady" },
  { value: 4, label: "Good" },
  { value: 5, label: "Charged" },
];

export const RATING_LABEL = ["", "Struggling", "Shaky", "Okay", "Good", "Thriving"];

export const STARTER_SPACES: { name: string; emoji: string; hue: number; intention: string }[] = [
  { name: "Health", emoji: "💪", hue: 150, intention: "Sleep, move, eat like I mean it." },
  { name: "Learning", emoji: "📚", hue: 258, intention: "Get properly good at things that matter." },
  { name: "Startup", emoji: "🚀", hue: 330, intention: "Build something people want." },
  { name: "Money", emoji: "💸", hue: 45, intention: "Spend on purpose, save on purpose." },
  { name: "People", emoji: "🫶", hue: 195, intention: "Show up for the people I care about." },
  { name: "Inner life", emoji: "🧘", hue: 285, intention: "Slow down enough to hear myself." },
];

export const SPACE_HUES = [258, 195, 150, 45, 20, 330, 285, 215];

/** Monday of the week containing the given day key. */
export function weekStartOf(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(key, -dow);
}

export const weekDays = (weekStart: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

/** Done-ness of a space: finished share of tasks that are open or were finished this fortnight. */
export function progressOf(tasks: Pick<SpaceTask, "done_at">[]): number {
  if (!tasks.length) return 0;
  return Math.round((tasks.filter((t) => t.done_at).length / tasks.length) * 100);
}

/** Latest rating per space plus the change over the ratings kept. */
export function ratingSummary(ratings: Rating[], spaceId: string): { now: number | null; delta: number | null; series: number[] } {
  const rows = ratings.filter((r) => r.space_id === spaceId).sort((a, b) => a.rated_on.localeCompare(b.rated_on));
  if (!rows.length) return { now: null, delta: null, series: [] };
  const now = rows[rows.length - 1].rating;
  return { now, delta: rows.length > 1 ? now - rows[0].rating : null, series: rows.map((r) => r.rating) };
}

export const avg = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

export const dueDay = (t: Pick<Task, "due_at">) => (t.due_at ? dayKey(t.due_at) : null);
