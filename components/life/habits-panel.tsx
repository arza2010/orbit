"use client";

import { Archive, Flame, Plus } from "lucide-react";
import { startTransition, useActionState, useEffect, useOptimistic, useRef, useState } from "react";
import { addHabit, archiveHabit, toggleHabitDay, type ActionState } from "@/app/(app)/life/actions";
import { hsl } from "@/lib/course";
import { burstFrom } from "@/lib/fx/confetti";
import { bestStreak, currentStreak, doneThisWeek, lastNDays } from "@/lib/life/habits";
import { fmtDayLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

export type HabitItem = { id: string; name: string; target: number; hue: number; days: string[] };

const HUES = [258, 190, 330, 150, 28, 355];
const DAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
const letterOf = (key: string) => DAY_LETTER[new Date(`${key}T00:00:00Z`).getUTCDay()];

export function HabitsPanel({ habits, todayKey }: { habits: HabitItem[]; todayKey: string }) {
  const [list, toggle] = useOptimistic(habits, (state: HabitItem[], op: { id: string; day: string; on: boolean }) =>
    state.map((h) => (h.id === op.id ? { ...h, days: op.on ? [...new Set([...h.days, op.day])] : h.days.filter((d) => d !== op.day) } : h)),
  );
  const [state, add, adding] = useActionState<ActionState, FormData>(addHabit, {});
  const [error, setError] = useState<string | null>(null);
  const [hue, setHue] = useState(HUES[0]);
  const form = useRef<HTMLFormElement>(null);
  const days = lastNDays(todayKey, 14);

  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  const flip = (h: HabitItem, day: string, from?: Element) =>
    startTransition(async () => {
      setError(null);
      const on = !h.days.includes(day);
      if (on) burstFrom(from ?? null, { count: 26, spread: 0.6, power: 8, colors: [hsl(h.hue, 90, 66), "#ffffff"] });
      toggle({ id: h.id, day, on });
      const r = await toggleHabitDay(h.id, day, on);
      if (r.error) setError(r.error);
    });

  return (
    <div className="flex flex-col gap-5">
      {list.length === 0 ? (
        <div className="glass p-10 text-center">
          <div className="font-display text-3xl">Start with one habit.</div>
          <p className="mt-2 text-sm text-muted">Small and daily beats big and occasional.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((h) => {
            const done = new Set(h.days);
            const streak = currentStreak(done, todayKey);
            const week = doneThisWeek(done, todayKey);
            const best = bestStreak(done);
            const color = hsl(h.hue, 90, 66);
            return (
              <li key={h.id} className="glass group p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="size-2.5 rounded-full" style={{ background: color }} />
                      <h3 className="truncate text-[15px] font-semibold">{h.name}</h3>
                    </div>
                    <p className="mt-1 text-xs text-faint">
                      {week} of {h.target} this week{best > 1 ? ` · best streak ${best}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold tabular-nums", streak > 0 ? "bg-amber/15 text-amber" : "bg-white/6 text-faint")}
                      title="Current streak"
                    >
                      <Flame className="size-4" /> {streak}
                    </span>
                    <button
                      onClick={() => startTransition(async () => void (await archiveHabit(h.id)))}
                      aria-label={`Archive ${h.name}`}
                      title="Archive"
                      className="rounded-full p-1.5 text-faint opacity-0 transition-all hover:bg-surface-2 hover:text-text focus:opacity-100 group-hover:opacity-100 max-md:opacity-60"
                    >
                      <Archive className="size-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex justify-between gap-1 sm:justify-start sm:gap-2">
                  {days.map((d, i) => {
                    const on = done.has(d);
                    const isToday = d === todayKey;
                    return (
                      <button
                        key={d}
                        onClick={(e) => flip(h, d, e.currentTarget)}
                        aria-pressed={on}
                        aria-label={`${h.name}, ${fmtDayLabel(d)}${on ? ", done" : ""}`}
                        title={fmtDayLabel(d)}
                        className={cn("flex flex-col items-center gap-1.5", i < 7 && "max-sm:hidden")}
                      >
                        <span className={cn("text-[10px] font-medium", isToday ? "text-text" : "text-faint")}>{letterOf(d)}</span>
                        <span
                          className={cn(
                            "grid size-8 place-items-center rounded-full border-2 transition-all hover:scale-110 sm:size-7",
                            !on && (isToday ? "border-white/50" : "border-white/12 hover:border-white/40"),
                          )}
                          style={on ? { background: color, borderColor: color, boxShadow: `0 0 14px -2px ${hsl(h.hue, 90, 60, 0.6)}` } : undefined}
                        />
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <form ref={form} action={add} className="glass flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <input name="name" required maxLength={120} autoComplete="off" placeholder="New habit, e.g. Read 20 pages" className="min-w-0 flex-1 basis-56 bg-transparent text-[15px] outline-none placeholder:text-faint" />
        <label className="flex items-center gap-2 text-xs text-muted">
          Per week
          <select name="target" defaultValue="7" className="rounded-lg border border-line bg-black/20 px-2 py-1.5 text-text outline-none">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Colour">
          {HUES.map((x) => (
            <button
              type="button"
              key={x}
              role="radio"
              aria-checked={hue === x}
              aria-label={`Colour ${x}`}
              onClick={() => setHue(x)}
              className={cn("size-5 rounded-full ring-offset-2 ring-offset-transparent transition-all", hue === x ? "scale-110 ring-2 ring-white/70" : "opacity-70 hover:opacity-100")}
              style={{ background: hsl(x, 90, 66) }}
            />
          ))}
        </div>
        <input type="hidden" name="hue" value={hue} />
        <button type="submit" disabled={adding} aria-label="Add habit" className="grid size-10 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105 disabled:opacity-60">
          <Plus className="size-5" />
        </button>
        {state.error && <span role="alert" className="w-full text-xs text-danger">{state.error}</span>}
      </form>
    </div>
  );
}
