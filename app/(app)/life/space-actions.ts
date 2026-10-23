"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { pushToGoogle } from "@/lib/gcal/push";
import { STARTER_SPACES } from "@/lib/life/spaces";
import { dueFromDateKey } from "@/lib/life/tasks";
import { todayKey } from "@/lib/life/today-key";
import { remindAtFor } from "@/lib/notify/plan";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/time";

export type SpaceActionState = { error?: string; ok?: boolean; id?: string };

const id = z.string().uuid();
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeKey = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time should look like 17:30.");
const text = (max: number) => z.string().trim().max(max);
const blank = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? undefined : String(v));
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form.";

const refresh = () => {
  revalidatePath("/life", "layout");
  revalidatePath("/");
};

const NOT_READY = "Run the latest SQL in supabase/migrations (life_spaces) first.";
const missing = (e: { message: string; code?: string }) => /relation|column|schema cache/i.test(e.message);

// ---------------------------------------------------------------- spaces

export async function createSpace(_prev: SpaceActionState, fd: FormData): Promise<SpaceActionState> {
  const p = z
    .object({
      name: text(60).min(1, "Give the space a name."),
      emoji: text(8).min(1).default("✨"),
      hue: z.coerce.number().int().min(0).max(360).default(258),
      intention: text(200).optional(),
    })
    .safeParse({ name: fd.get("name"), emoji: blank(fd.get("emoji")), hue: fd.get("hue") ?? 258, intention: blank(fd.get("intention")) });
  if (!p.success) return { error: firstIssue(p.error) };

  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("life_spaces")
    .insert({ name: p.data.name, emoji: p.data.emoji, hue: p.data.hue, intention: p.data.intention ?? null, position: Date.now() % 1_000_000_000 })
    .select("id")
    .single();
  if (error) return { error: missing(error) ? NOT_READY : "Couldn't save the space." };
  refresh();
  return { ok: true, id: data.id as string };
}

export async function seedSpaces(): Promise<SpaceActionState> {
  await requireUser();
  const supabase = await createClient();
  const { count } = await supabase.from("life_spaces").select("id", { count: "exact", head: true }).is("archived_at", null);
  if (count) return { error: "You already have spaces." };
  const { error } = await supabase.from("life_spaces").insert(STARTER_SPACES.map((s, i) => ({ ...s, position: i })));
  if (error) return { error: missing(error) ? NOT_READY : "Couldn't create the spaces." };
  refresh();
  return { ok: true };
}

export async function updateSpace(spaceId: string, patch: { name?: string; intention?: string | null; emoji?: string }): Promise<SpaceActionState> {
  const p = z
    .object({ name: text(60).min(1).optional(), intention: text(200).nullable().optional(), emoji: text(8).min(1).optional() })
    .safeParse(patch);
  if (!id.safeParse(spaceId).success || !p.success) return { error: "Check the details." };
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("life_spaces").update({ ...p.data, ...(p.data.intention === "" ? { intention: null } : {}) }).eq("id", spaceId);
  refresh();
  return error ? { error: "Couldn't save." } : { ok: true };
}

export async function archiveSpace(spaceId: string): Promise<SpaceActionState> {
  if (!id.safeParse(spaceId).success) return { error: "Bad space." };
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("life_spaces").update({ archived_at: new Date().toISOString() }).eq("id", spaceId);
  refresh();
  return error ? { error: "Couldn't archive the space." } : { ok: true };
}

/** How the area feels today, 1 to 5. Tapping the same value again clears it. */
export async function rateSpace(spaceId: string, rating: number | null, note?: string): Promise<SpaceActionState> {
  if (!id.safeParse(spaceId).success || (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5))) return { error: "Bad rating." };
  await requireUser();
  const supabase = await createClient();
  const day = await todayKey();
  const { error } =
    rating === null
      ? await supabase.from("space_ratings").delete().eq("space_id", spaceId).eq("rated_on", day)
      : await supabase
          .from("space_ratings")
          .upsert({ space_id: spaceId, rating, rated_on: day, note: note?.trim().slice(0, 300) || null }, { onConflict: "space_id,rated_on" });
  refresh();
  return error ? { error: "Couldn't save the rating." } : { ok: true };
}

// ---------------------------------------------------------------- projects

export async function createProject(_prev: SpaceActionState, fd: FormData): Promise<SpaceActionState> {
  const p = z
    .object({ space: id, name: text(120).min(1, "Give the project a name."), description: text(1000).optional(), due: dateKey.optional() })
    .safeParse({ space: fd.get("space"), name: fd.get("name"), description: blank(fd.get("description")), due: blank(fd.get("due")) });
  if (!p.success) return { error: firstIssue(p.error) };
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("life_projects")
    .insert({ space_id: p.data.space, name: p.data.name, description: p.data.description ?? null, due_on: p.data.due ?? null })
    .select("id")
    .single();
  if (error) return { error: missing(error) ? NOT_READY : "Couldn't save the project." };
  refresh();
  return { ok: true, id: data.id as string };
}

export async function setProjectStatus(projectId: string, status: "active" | "paused" | "done"): Promise<SpaceActionState> {
  if (!id.safeParse(projectId).success || !["active", "paused", "done"].includes(status)) return { error: "Bad request." };
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("life_projects").update({ status }).eq("id", projectId);
  refresh();
  return error ? { error: "Couldn't update the project." } : { ok: true };
}

export async function deleteProject(projectId: string): Promise<SpaceActionState> {
  if (!id.safeParse(projectId).success) return { error: "Bad project." };
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("life_projects").delete().eq("id", projectId);
  refresh();
  return error ? { error: "Couldn't delete the project." } : { ok: true };
}

// ---------------------------------------------------------------- tasks

const Remind = z.enum(["none", "at", "15m", "1h", "1d"]);

function dueFields(due: string | undefined, time: string | undefined, remind: z.infer<typeof Remind>) {
  const hasTime = !!time && !!due;
  const dueAt = due ? (hasTime ? `${due}T${time}:00+05:30` : dueFromDateKey(due)) : null;
  return {
    due_at: dueAt,
    due_has_time: hasTime,
    // Computed once so the scheduler only ever compares "now" with this moment. A changed date re-arms the reminder.
    remind_at: remindAtFor({ dueAt, hasTime, lead: remind, nowMs: Date.now() }),
    reminded_at: null as string | null,
  };
}

export async function addSpaceTask(_prev: SpaceActionState, fd: FormData): Promise<SpaceActionState> {
  const p = z
    .object({
      title: text(500).min(1, "Give the task a name."),
      space: id,
      project: id.optional(),
      due: dateKey.optional(),
      time: timeKey.optional(),
      priority: z.coerce.number().int().min(0).max(3).default(0),
      stage: z.enum(["todo", "doing"]).default("todo"),
      remind: Remind.default("at"),
    })
    .safeParse({
      title: fd.get("title"),
      space: fd.get("space"),
      project: blank(fd.get("project")),
      due: blank(fd.get("due")),
      time: blank(fd.get("time")),
      priority: fd.get("priority") ?? 0,
      stage: fd.get("stage") ?? "todo",
      remind: fd.get("remind") ?? "at",
    });
  if (!p.success) return { error: firstIssue(p.error) };
  if (p.data.time && !p.data.due) return { error: "Pick a date for that time." };

  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    title: p.data.title,
    space_id: p.data.space,
    project_id: p.data.project ?? null,
    priority: p.data.priority,
    stage: p.data.stage,
    ...dueFields(p.data.due, p.data.time, p.data.time ? p.data.remind : "none"),
  });
  if (error) return { error: missing(error) ? NOT_READY : "Couldn't save the task." };
  pushToGoogle(user.id);
  refresh();
  return { ok: true };
}

export type TaskPatch = {
  title?: string;
  notes?: string | null;
  why?: string | null;
  priority?: number;
  project_id?: string | null;
  space_id?: string | null;
  /** YYYY-MM-DD, or null to clear. */
  due?: string | null;
  /** HH:MM, or null for an all-day task. */
  time?: string | null;
  remind?: z.infer<typeof Remind>;
};

export async function updateSpaceTask(taskId: string, patch: TaskPatch): Promise<SpaceActionState> {
  const p = z
    .object({
      title: text(500).min(1, "A task needs a name.").optional(),
      notes: text(4000).nullable().optional(),
      why: text(500).nullable().optional(),
      priority: z.number().int().min(0).max(3).optional(),
      project_id: id.nullable().optional(),
      space_id: id.nullable().optional(),
      due: dateKey.nullable().optional(),
      time: timeKey.nullable().optional(),
      remind: Remind.optional(),
    })
    .safeParse(patch);
  if (!id.safeParse(taskId).success || !p.success) return { error: p.success ? "Bad task." : firstIssue(p.error) };
  const { due, time, remind, notes, why, ...rest } = p.data;
  if (time && due === null) return { error: "Pick a date for that time." };

  const user = await requireUser();
  const supabase = await createClient();
  const update: Record<string, unknown> = { ...rest };
  if (notes !== undefined) update.notes = notes?.trim() ? notes : null;
  if (why !== undefined) update.why = why?.trim() ? why : null;
  if (due !== undefined || time !== undefined || remind !== undefined) {
    // The date, time and reminder travel together, so read what is stored for whatever the patch leaves out.
    const { data: cur } = await supabase.from("tasks").select("due_at,due_has_time").eq("id", taskId).single();
    const curDay = cur?.due_at ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(cur.due_at as string)) : undefined;
    const curTime = cur?.due_has_time
      ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(cur!.due_at as string))
      : undefined;
    const nextDue = due === undefined ? curDay : (due ?? undefined);
    const nextTime = due === null ? undefined : time === undefined ? curTime : (time ?? undefined);
    Object.assign(update, dueFields(nextDue, nextTime, remind ?? (nextTime ? "at" : "none")));
  }
  if (!Object.keys(update).length) return { ok: true };

  const { error } = await supabase.from("tasks").update(update).eq("id", taskId);
  if (!error) pushToGoogle(user.id);
  refresh();
  return error ? { error: "Couldn't save the task." } : { ok: true };
}

/** Moves a task between To do, Doing and Done. Done also stamps done_at, the rest of the app's source of truth. */
export async function moveTask(taskId: string, stage: "todo" | "doing" | "done"): Promise<SpaceActionState> {
  if (!id.safeParse(taskId).success || !["todo", "doing", "done"].includes(stage)) return { error: "Bad request." };
  const user = await requireUser();
  const supabase = await createClient();
  const update = stage === "done" ? { done_at: new Date().toISOString() } : { done_at: null, stage };
  const { error } = await supabase.from("tasks").update(update).eq("id", taskId);
  if (!error) pushToGoogle(user.id);
  refresh();
  return error ? { error: "Couldn't move the task." } : { ok: true };
}

// ---------------------------------------------------------------- check-ins and reviews

export async function saveCheckin(input: { mood?: number | null; energy?: number | null; note?: string | null }): Promise<SpaceActionState> {
  const p = z
    .object({
      mood: z.number().int().min(1).max(5).nullable().optional(),
      energy: z.number().int().min(1).max(5).nullable().optional(),
      note: text(500).nullable().optional(),
    })
    .safeParse(input);
  if (!p.success) return { error: "Check the details." };
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("checkins")
    .upsert({ day: await todayKey(), ...p.data, ...(p.data.note !== undefined ? { note: p.data.note?.trim() || null } : {}) }, { onConflict: "user_id,day" });
  refresh();
  return error ? { error: missing(error) ? NOT_READY : "Couldn't save your check-in." } : { ok: true };
}

export async function saveReview(_prev: SpaceActionState, fd: FormData): Promise<SpaceActionState> {
  const p = z
    .object({ week: dateKey, wins: text(2000).optional(), change: text(2000).optional(), focus: text(500).optional() })
    .safeParse({ week: fd.get("week"), wins: blank(fd.get("wins")), change: blank(fd.get("change")), focus: blank(fd.get("focus")) });
  if (!p.success) return { error: firstIssue(p.error) };
  // Only this week and recent ones can be reviewed.
  if (p.data.week > (await todayKey()) || p.data.week < addDays(await todayKey(), -120)) return { error: "That week is out of range." };
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("weekly_reviews")
    .upsert(
      { week_start: p.data.week, wins: p.data.wins ?? null, change: p.data.change ?? null, focus: p.data.focus ?? null },
      { onConflict: "user_id,week_start" },
    );
  if (error) return { error: missing(error) ? NOT_READY : "Couldn't save the review." };
  refresh();
  return { ok: true };
}
