"use client";

import { Flame, Layers, Target, Wallet } from "lucide-react";
import Link from "next/link";
import { startTransition, useOptimistic } from "react";
import { toggleHabitDay } from "@/app/(app)/life/actions";
import { Reveal } from "@/components/motion/reveal";
import { hsl } from "@/lib/course";
import { burstFrom } from "@/lib/fx/confetti";
import { currentStreak, doneThisWeek } from "@/lib/life/habits";
import { cn } from "@/lib/utils";

export type TodayHabit = { id: string; name: string; hue: number; target: number; days: string[] };
export type LifeTodayData = {
  todayKey: string;
  habits: TodayHabit[];
  spent: string;
  goals: { active: number; next: { title: string; when: string } | null };
};

/** Habits you can tick off right here, and the rest of Life in one glance. */
export function LifeToday({ data }: { data: LifeTodayData }) {
  const { todayKey } = data;
  const [habits, flip] = useOptimistic(data.habits, (list: TodayHabit[], op: { id: string; on: boolean }) =>
    list.map((h) => (h.id === op.id ? { ...h, days: op.on ? [...new Set([...h.days, todayKey])] : h.days.filter((d) => d !== todayKey) } : h)),
  );

  const doneToday = habits.filter((h) => h.days.includes(todayKey)).length;

  return (
    <Reveal delay={0.14}>
      <div className="glass p-5 sm:p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-muted">
            <Layers className="size-4" /> Life today
          </h3>
          <Link href="/life" className="text-xs text-faint transition-colors hover:text-text">
            Open Life →
          </Link>
        </div>

        {habits.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-center text-sm text-muted">
            No habits yet.{" "}
            <Link href="/life?tab=habits" className="text-cyan underline-offset-4 hover:underline">
              Start one
            </Link>
            , then tick it off here each day.
          </p>
        ) : (
          <>
            <p className="mb-2.5 text-xs text-faint">
              {doneToday} of {habits.length} done today
            </p>
            <ul className="flex flex-col gap-1.5">
              {habits.slice(0, 6).map((h) => {
                const done = new Set(h.days);
                const on = done.has(todayKey);
                const streak = currentStreak(done, todayKey);
                const color = hsl(h.hue, 90, 66);
                return (
                  <li key={h.id}>
                    <button
                      onClick={(e) => {
                        const next = !on;
                        if (next) burstFrom(e.currentTarget, { count: 26, spread: 0.6, power: 8, colors: [color, "#ffffff"] });
                        startTransition(async () => {
                          flip({ id: h.id, on: next });
                          await toggleHabitDay(h.id, todayKey, next);
                        });
                      }}
                      aria-pressed={on}
                      aria-label={`${h.name}, ${on ? "done today" : "not done yet"}`}
                      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span
                        className="grid size-6 shrink-0 place-items-center rounded-full border-2 transition-all"
                        style={on ? { background: color, borderColor: color, boxShadow: `0 0 14px -2px ${hsl(h.hue, 90, 60, 0.6)}` } : { borderColor: "rgb(255 255 255 / 0.28)" }}
                      >
                        {on && <span className="size-2 rounded-full bg-black/70" />}
                      </span>
                      <span className={cn("min-w-0 flex-1 truncate text-sm", on && "text-muted line-through decoration-white/20")}>{h.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-faint">
                        {doneThisWeek(done, todayKey)}/{h.target}
                      </span>
                      <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums", streak > 0 ? "text-amber" : "text-faint")}>
                        <Flame className="size-3.5" /> {streak}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <Link href="/life?tab=money" className="rounded-2xl border border-line bg-surface px-3.5 py-3 transition-colors hover:bg-surface-2">
            <div className="flex items-center gap-1.5 text-faint">
              <Wallet className="size-3.5" /> Spent this month
            </div>
            <div className="mt-1 text-base font-semibold tabular-nums text-text">{data.spent}</div>
          </Link>
          <Link href="/life?tab=goals" className="rounded-2xl border border-line bg-surface px-3.5 py-3 transition-colors hover:bg-surface-2">
            <div className="flex items-center gap-1.5 text-faint">
              <Target className="size-3.5" /> Goals
            </div>
            <div className="mt-1 text-base font-semibold text-text">{data.goals.active} active</div>
            {data.goals.next && <div className="mt-0.5 truncate text-faint">Next: {data.goals.next.title} · {data.goals.next.when}</div>}
          </Link>
        </div>
      </div>
    </Reveal>
  );
}
