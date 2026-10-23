import { addDays } from "@/lib/time";
import { mondayOf } from "@/lib/calendar";

// Pure habit maths over date keys (YYYY-MM-DD, India time). `done` is the set of days a habit was logged.

/** The last `n` days ending today, oldest first. */
export function lastNDays(todayKey: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(todayKey, i - (n - 1)));
}

/**
 * Consecutive days done, ending today. If today isn't done yet the streak is still alive (you have
 * until midnight), so it counts back from yesterday instead of resetting to zero.
 */
export function currentStreak(done: ReadonlySet<string>, todayKey: string): number {
  let day = done.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let n = 0;
  while (done.has(day) && n < 3650) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

/** Days done this week (Monday to today). */
export function doneThisWeek(done: ReadonlySet<string>, todayKey: string): number {
  const start = mondayOf(todayKey);
  let n = 0;
  for (let d = start; d <= todayKey; d = addDays(d, 1)) if (done.has(d)) n++;
  return n;
}

/** Longest run ever, for the "best" badge. */
export function bestStreak(done: ReadonlySet<string>): number {
  const days = [...done].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}
