import { listExpenses, listGoals, listHabits } from "@/lib/life/queries";
import { formatINR, summarise } from "@/lib/life/money";
import { todayKey } from "@/lib/life/today-key";
import { fmtDayLabel } from "@/lib/time";
import { LifeToday, type LifeTodayData } from "./life-today";

async function load(): Promise<LifeTodayData | null> {
  try {
    const today = await todayKey();
    const [habits, goals, expenses] = await Promise.all([listHabits(today), listGoals(), listExpenses(today.slice(0, 7))]);
    const active = goals.filter((g) => g.status === "active");
    const next = active
      .filter((g) => g.due_on && g.due_on >= today)
      .sort((a, b) => (a.due_on as string).localeCompare(b.due_on as string))[0];
    return {
      todayKey: today,
      habits: habits.map(({ habit, days }) => ({ id: habit.id, name: habit.name, hue: habit.hue, target: habit.target_per_week, days })),
      spent: formatINR(summarise(expenses).spent),
      goals: { active: active.length, next: next ? { title: next.title, when: fmtDayLabel(next.due_on as string) } : null },
    };
  } catch (err) {
    console.error("Today: life data failed to load", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Loads on its own, so a slow or missing Life table never holds up the rest of Today. */
export async function LifeTodayLoader() {
  const data = await load();
  return data ? <LifeToday data={data} /> : null;
}
