import { addDays } from "@/lib/time";
import { avg, weekDays, type Checkin, type Rating, type Space } from "./spaces";

export type RatingMove = { space: Space; from: number | null; to: number | null };

/** For each space: the latest rating on or before the week's start, and the latest one by the week's end. */
export function ratingMoves(spaces: Space[], ratings: Rating[], weekStart: string): RatingMove[] {
  const end = addDays(weekStart, 6);
  return spaces.map((space) => {
    const mine = ratings.filter((r) => r.space_id === space.id).sort((a, b) => a.rated_on.localeCompare(b.rated_on));
    const before = mine.filter((r) => r.rated_on < weekStart).pop();
    const within = mine.filter((r) => r.rated_on >= weekStart && r.rated_on <= end).pop();
    return { space, from: before?.rating ?? null, to: within?.rating ?? before?.rating ?? null };
  });
}

export function moodByDay(checkins: Checkin[], weekStart: string): { key: string; mood: number | null; energy: number | null; note: string | null }[] {
  const byDay = new Map(checkins.map((c) => [c.day, c]));
  return weekDays(weekStart).map((key) => ({ key, mood: byDay.get(key)?.mood ?? null, energy: byDay.get(key)?.energy ?? null, note: byDay.get(key)?.note ?? null }));
}

export const weekAverages = (days: { mood: number | null; energy: number | null }[]) => ({ mood: avg(days.map((d) => d.mood)), energy: avg(days.map((d) => d.energy)) });
