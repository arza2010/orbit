import { listDueTasks } from "@/lib/life/queries";
import type { Task } from "@/lib/life/tasks";
import { todayKey } from "@/lib/life/today-key";
import { TasksToday } from "./tasks-today";

async function load(): Promise<{ tasks: Task[]; today: string } | null> {
  try {
    const today = await todayKey();
    return { tasks: await listDueTasks(today), today };
  } catch (err) {
    console.error("Today: tasks failed to load", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Loads separately from the Nexus data, so a slow or missing tasks table never blocks the Today screen. */
export async function TasksTodayLoader() {
  const data = await load();
  return data ? <TasksToday tasks={data.tasks} todayKey={data.today} /> : null;
}
