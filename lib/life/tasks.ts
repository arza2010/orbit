import { addDays, dayKey, fmtDayLabel, fmtTime } from "@/lib/time";

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  /** True when the user picked a time as well as a day. Otherwise due_at is the end of that day. */
  due_has_time: boolean;
  remind_at: string | null;
  course: string | null;
  priority: number; // 0 none, 1 low, 2 medium, 3 high
  done_at: string | null;
  created_at: string;
};

export type TaskBucket = "overdue" | "today" | "upcoming" | "later" | "nodate" | "done";

export const BUCKET_ORDER: TaskBucket[] = ["overdue", "today", "upcoming", "later", "nodate", "done"];
export const BUCKET_LABEL: Record<TaskBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Next 7 days",
  later: "Later",
  nodate: "No date",
  done: "Done",
};

export function bucketOf(t: Pick<Task, "due_at" | "done_at">, todayKey: string): TaskBucket {
  if (t.done_at) return "done";
  if (!t.due_at) return "nodate";
  const due = dayKey(t.due_at);
  if (due < todayKey) return "overdue";
  if (due === todayKey) return "today";
  if (due <= addDays(todayKey, 7)) return "upcoming";
  return "later";
}

const byUrgency = (a: Task, b: Task) =>
  b.priority - a.priority ||
  (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999") ||
  a.created_at.localeCompare(b.created_at);

export function groupTasks(tasks: Task[], todayKey: string): { bucket: TaskBucket; tasks: Task[] }[] {
  const map = new Map<TaskBucket, Task[]>();
  for (const t of tasks) {
    const b = bucketOf(t, todayKey);
    map.set(b, [...(map.get(b) ?? []), t]);
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((bucket) => ({
    bucket,
    tasks: (map.get(bucket) as Task[]).sort(
      bucket === "done" ? (a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "") : byUrgency,
    ),
  }));
}

/** A due date picked as a calendar day becomes the end of that day in India time. */
export const dueFromDateKey = (key: string) => `${key}T23:59:00+05:30`;

/** "Today, 5:30 pm", "Tomorrow", "Mon, 26 Oct": how a due date reads on a row. */
export function dueLabel(task: Pick<Task, "due_at" | "due_has_time">, todayKey: string): string | null {
  if (!task.due_at) return null;
  const key = dayKey(task.due_at);
  const day = key === todayKey ? "Today" : key === addDays(todayKey, 1) ? "Tomorrow" : key === addDays(todayKey, -1) ? "Yesterday" : fmtDayLabel(key);
  return task.due_has_time ? `${day}, ${fmtTime(task.due_at)}` : day;
}

export const PRIORITY_LABEL = ["None", "Low", "Medium", "High"];

const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Values for <input type="date"> and <input type="time"> from a stored due date (India time). */
export const dueDateValue = (t: Pick<Task, "due_at">) => (t.due_at ? dayKey(t.due_at) : "");
export const dueTimeValue = (t: Pick<Task, "due_at" | "due_has_time">) => (t.due_at && t.due_has_time ? hhmm.format(new Date(t.due_at)) : "");
