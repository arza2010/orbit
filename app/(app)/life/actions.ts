"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { pushToGoogle } from "@/lib/gcal/push";
import { todayKey } from "@/lib/life/today-key";
import { parseRupees } from "@/lib/life/money";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/time";

export type ActionState = { error?: string; ok?: boolean };

const id = z.string().uuid();
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().trim().max(max);
const blank = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? undefined : String(v));

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form.";

const refresh = () => {
  revalidatePath("/life");
  revalidatePath("/");
};

async function db() {
  await requireUser();
  return createClient();
}

// ---------------------------------------------------------------- tasks

export async function setTaskDone(taskId: string, done: boolean): Promise<ActionState> {
  if (!id.safeParse(taskId).success) return { error: "Bad task." };
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ done_at: done ? new Date().toISOString() : null }).eq("id", taskId);
  if (!error) pushToGoogle(user.id);
  refresh();
  return error ? { error: "Couldn't update the task." } : { ok: true };
}

export async function deleteTask(taskId: string): Promise<ActionState> {
  if (!id.safeParse(taskId).success) return { error: "Bad task." };
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (!error) pushToGoogle(user.id);
  refresh();
  return error ? { error: "Couldn't delete the task." } : { ok: true };
}

// ---------------------------------------------------------------- habits

export async function addHabit(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const p = z
    .object({
      name: text(120).min(1, "Give the habit a name."),
      target: z.coerce.number().int().min(1).max(7),
      hue: z.coerce.number().int().min(0).max(360),
    })
    .safeParse({ name: fd.get("name"), target: fd.get("target") ?? 7, hue: fd.get("hue") ?? 258 });
  if (!p.success) return { error: firstIssue(p.error) };

  const supabase = await db();
  const { error } = await supabase.from("habits").insert({ name: p.data.name, target_per_week: p.data.target, hue: p.data.hue });
  if (error) return { error: "Couldn't save the habit." };
  refresh();
  return { ok: true };
}

export async function toggleHabitDay(habitId: string, day: string, on: boolean): Promise<ActionState> {
  if (!id.safeParse(habitId).success || !dateKey.safeParse(day).success) return { error: "Bad request." };
  const today = await todayKey();
  if (day > today) return { error: "You can't log a day that hasn't happened." };
  if (day < addDays(today, -60)) return { error: "That day is too far back." };

  const supabase = await db();
  const { error } = on
    ? await supabase.from("habit_logs").upsert({ habit_id: habitId, logged_on: day }, { onConflict: "habit_id,logged_on", ignoreDuplicates: true })
    : await supabase.from("habit_logs").delete().eq("habit_id", habitId).eq("logged_on", day);
  refresh();
  return error ? { error: "Couldn't update the habit." } : { ok: true };
}

export async function archiveHabit(habitId: string): Promise<ActionState> {
  if (!id.safeParse(habitId).success) return { error: "Bad habit." };
  const supabase = await db();
  const { error } = await supabase.from("habits").update({ archived_at: new Date().toISOString() }).eq("id", habitId);
  refresh();
  return error ? { error: "Couldn't archive the habit." } : { ok: true };
}

// ---------------------------------------------------------------- goals

export async function addGoal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const num = z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().positive().max(1e12).optional());
  const p = z
    .object({
      title: text(300).min(1, "Give the goal a name."),
      area: text(40).optional(),
      unit: text(20).optional(),
      target: num,
      due: dateKey.optional(),
    })
    .safeParse({
      title: fd.get("title"),
      area: blank(fd.get("area")),
      unit: blank(fd.get("unit")),
      target: blank(fd.get("target")),
      due: blank(fd.get("due")),
    });
  if (!p.success) return { error: firstIssue(p.error) };

  const supabase = await db();
  const { error } = await supabase.from("goals").insert({
    title: p.data.title,
    area: p.data.area ?? null,
    unit: p.data.unit ?? null,
    target_value: p.data.target ?? null,
    due_on: p.data.due ?? null,
  });
  if (error) return { error: "Couldn't save the goal." };
  refresh();
  return { ok: true };
}

export async function updateGoalProgress(goalId: string, value: number): Promise<ActionState> {
  if (!id.safeParse(goalId).success || !Number.isFinite(value) || value < 0 || value > 1e12) return { error: "Bad value." };
  const supabase = await db();
  const { error } = await supabase.from("goals").update({ current_value: value }).eq("id", goalId);
  refresh();
  return error ? { error: "Couldn't update the goal." } : { ok: true };
}

export async function setGoalStatus(goalId: string, status: "active" | "done" | "dropped"): Promise<ActionState> {
  if (!id.safeParse(goalId).success || !["active", "done", "dropped"].includes(status)) return { error: "Bad request." };
  const supabase = await db();
  const { error } = await supabase.from("goals").update({ status }).eq("id", goalId);
  refresh();
  return error ? { error: "Couldn't update the goal." } : { ok: true };
}

export async function deleteGoal(goalId: string): Promise<ActionState> {
  if (!id.safeParse(goalId).success) return { error: "Bad goal." };
  const supabase = await db();
  const { error } = await supabase.from("goals").delete().eq("id", goalId);
  refresh();
  return error ? { error: "Couldn't delete the goal." } : { ok: true };
}

// ---------------------------------------------------------------- money

export async function addExpense(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const paise = parseRupees(String(fd.get("amount") ?? ""));
  if (paise === null) return { error: "Enter an amount like 250 or 1,250.50." };

  const p = z
    .object({
      kind: z.enum(["expense", "income"]),
      category: text(60).min(1, "Pick a category."),
      note: text(200).optional(),
      date: dateKey,
    })
    .safeParse({
      kind: fd.get("kind") ?? "expense",
      category: fd.get("category"),
      note: blank(fd.get("note")),
      date: blank(fd.get("date")) ?? (await todayKey()),
    });
  if (!p.success) return { error: firstIssue(p.error) };
  if (p.data.date > addDays(await todayKey(), 1)) return { error: "That date is in the future." };

  const supabase = await db();
  const { error } = await supabase.from("expenses").insert({
    amount_paise: p.data.kind === "income" ? -paise : paise,
    category: p.data.category,
    note: p.data.note ?? null,
    spent_on: p.data.date,
  });
  if (error) return { error: "Couldn't save that." };
  refresh();
  return { ok: true };
}

export async function deleteExpense(expenseId: string): Promise<ActionState> {
  if (!id.safeParse(expenseId).success) return { error: "Bad entry." };
  const supabase = await db();
  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  refresh();
  return error ? { error: "Couldn't delete that." } : { ok: true };
}
