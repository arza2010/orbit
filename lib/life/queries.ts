import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/time";
import type { Checkin, Project, Rating, Review, Space, SpaceTask } from "./spaces";
import type { Task } from "./tasks";
import { monthRange, type Expense } from "./money";

// All reads run as the signed-in user, so row-level security applies.

export type Habit = { id: string; name: string; target_per_week: number; hue: number; created_at: string };
export type Goal = {
  id: string;
  title: string;
  area: string | null;
  unit: string | null;
  target_value: number | null;
  current_value: number;
  due_on: string | null;
  status: "active" | "done" | "dropped";
  created_at: string;
};

const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

/** Open tasks, plus whatever was finished in the last two weeks. */
export async function listTasks(todayKey: string): Promise<Task[]> {
  const supabase = await createClient();
  const since = `${addDays(todayKey, -14)}T00:00:00+05:30`;
  const { data, error } = await supabase
    .from("tasks")
    .select("id,title,notes,due_at,due_has_time,remind_at,course,priority,done_at,created_at")
    .or(`done_at.is.null,done_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(500);
  fail(error);
  return (data ?? []) as Task[];
}

/** Open tasks that matter today: overdue or due today. Used by the Today screen. */
export async function listDueTasks(todayKey: string): Promise<Task[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("id,title,notes,due_at,due_has_time,remind_at,course,priority,done_at,created_at")
    .is("done_at", null)
    .not("due_at", "is", null)
    .lt("due_at", `${addDays(todayKey, 1)}T00:00:00+05:30`)
    .order("due_at", { ascending: true })
    .limit(50);
  fail(error);
  return (data ?? []) as Task[];
}

const LOG_DAYS = 400;

export async function listHabits(todayKey: string): Promise<{ habit: Habit; days: string[] }[]> {
  const supabase = await createClient();
  const [h, l] = await Promise.all([
    supabase.from("habits").select("id,name,target_per_week,hue,created_at").is("archived_at", null).order("created_at"),
    supabase.from("habit_logs").select("habit_id,logged_on").gte("logged_on", addDays(todayKey, -LOG_DAYS)),
  ]);
  fail(h.error);
  fail(l.error);
  const byHabit = new Map<string, string[]>();
  for (const row of l.data ?? []) byHabit.set(row.habit_id as string, [...(byHabit.get(row.habit_id as string) ?? []), row.logged_on as string]);
  return ((h.data ?? []) as Habit[]).map((habit) => ({ habit, days: byHabit.get(habit.id) ?? [] }));
}

export async function listGoals(): Promise<Goal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goals")
    .select("id,title,area,unit,target_value,current_value,due_on,status,created_at")
    .order("created_at", { ascending: false });
  fail(error);
  return ((data ?? []) as Goal[]).map((g) => ({
    ...g,
    target_value: g.target_value === null ? null : Number(g.target_value),
    current_value: Number(g.current_value),
  }));
}

export async function listExpenses(monthKey: string): Promise<Expense[]> {
  const supabase = await createClient();
  const { from, to } = monthRange(monthKey);
  const { data, error } = await supabase
    .from("expenses")
    .select("id,amount_paise,category,note,spent_on,created_at")
    .gte("spent_on", from)
    .lt("spent_on", to)
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  fail(error);
  // bigint columns can arrive as strings; amounts here are well inside the safe range.
  return (data ?? []).map((e) => ({ ...e, amount_paise: Number(e.amount_paise) })) as Expense[];
}

// ---------------------------------------------------------------- spaces (Life v2)
// These read the tables from 20261026000000_life_spaces.sql. The classic reads above stay untouched so the
// rest of the app keeps working before that migration has been run.

const SPACE_TASK_COLS = "id,title,notes,due_at,due_has_time,remind_at,course,priority,done_at,created_at,space_id,project_id,stage,why";

export async function listSpaces(): Promise<Space[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("life_spaces")
    .select("id,name,emoji,hue,intention,position")
    .is("archived_at", null)
    .order("position")
    .order("created_at");
  fail(error);
  return (data ?? []) as Space[];
}

export async function listProjects(): Promise<Project[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("life_projects")
    .select("id,space_id,name,description,status,due_on")
    .order("created_at");
  fail(error);
  return (data ?? []) as Project[];
}

/** Open tasks plus whatever finished in the last two weeks, across all spaces (or one). */
export async function listSpaceTasks(todayKey: string, spaceId?: string): Promise<SpaceTask[]> {
  const supabase = await createClient();
  const since = `${addDays(todayKey, -14)}T00:00:00+05:30`;
  let q = supabase.from("tasks").select(SPACE_TASK_COLS).or(`done_at.is.null,done_at.gte.${since}`);
  if (spaceId) q = q.eq("space_id", spaceId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(800);
  fail(error);
  return (data ?? []) as SpaceTask[];
}

/** Ratings from the last 90 days, oldest first. */
export async function listRatings(todayKey: string): Promise<Rating[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("space_ratings")
    .select("space_id,rating,rated_on")
    .gte("rated_on", addDays(todayKey, -90))
    .order("rated_on");
  fail(error);
  return (data ?? []) as Rating[];
}

export async function listCheckins(todayKey: string, days = 30): Promise<Checkin[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checkins")
    .select("day,mood,energy,note")
    .gte("day", addDays(todayKey, -days))
    .order("day");
  fail(error);
  return (data ?? []) as Checkin[];
}

export async function getReview(weekStart: string): Promise<Review | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("weekly_reviews").select("week_start,wins,change,focus").eq("week_start", weekStart).maybeSingle();
  fail(error);
  return (data as Review | null) ?? null;
}

/** Tasks finished between two day keys (inclusive start, exclusive end). */
export async function listDoneBetween(fromKey: string, toKey: string): Promise<SpaceTask[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(SPACE_TASK_COLS)
    .not("done_at", "is", null)
    .gte("done_at", `${fromKey}T00:00:00+05:30`)
    .lt("done_at", `${toKey}T00:00:00+05:30`)
    .order("done_at", { ascending: false })
    .limit(300);
  fail(error);
  return (data ?? []) as SpaceTask[];
}
