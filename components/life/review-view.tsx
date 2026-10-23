"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { saveReview, type SpaceActionState } from "@/app/(app)/life/space-actions";
import { hsl } from "@/lib/course";
import { formatINR } from "@/lib/life/money";
import type { RatingMove } from "@/lib/life/review";
import { MOODS, type Review, type SpaceTask } from "@/lib/life/spaces";
import { weekdayShort } from "@/lib/calendar";
import { fmtDayLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

export type ReviewData = {
  weekStart: string;
  prev: string;
  next: string | null;
  isThisWeek: boolean;
  days: { key: string; mood: number | null; energy: number | null; note: string | null }[];
  avg: { mood: number | null; energy: number | null };
  done: SpaceTask[];
  doneBySpace: { id: string | null; name: string; emoji: string; hue: number; count: number }[];
  moves: RatingMove[];
  habits: { id: string; name: string; hue: number; done: number; target: number }[];
  spent: number;
  review: Review | null;
};

const AREA = "w-full resize-none rounded-xl border border-line bg-black/20 px-4 py-3 text-base outline-none transition-colors placeholder:text-faint focus:border-white/30 sm:text-sm";

export function ReviewView({ d }: { d: ReviewData }) {
  const [state, save, pending] = useActionState<SpaceActionState, FormData>(saveReview, {});
  const endKey = d.days[6].key;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl leading-none tracking-tight">{d.isThisWeek ? "This week" : "Week of"}</h2>
          <p className="mt-1 text-sm text-muted">
            {fmtDayLabel(d.weekStart)} to {fmtDayLabel(endKey)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/life?tab=review&week=${d.prev}`} aria-label="Previous week" className="grid size-10 place-items-center rounded-full border border-line bg-surface text-muted transition-colors hover:text-text">
            <ChevronLeft className="size-4" />
          </Link>
          {d.next ? (
            <Link href={`/life?tab=review&week=${d.next}`} aria-label="Next week" className="grid size-10 place-items-center rounded-full border border-line bg-surface text-muted transition-colors hover:text-text">
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span className="grid size-10 place-items-center rounded-full border border-line text-faint opacity-40">
              <ChevronRight className="size-4" />
            </span>
          )}
        </div>
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Tasks done" value={String(d.done.length)} />
        <Tile label="Avg mood" value={d.avg.mood?.toString() ?? "–"} sub={d.avg.mood ? MOODS[Math.round(d.avg.mood) - 1].emoji : undefined} />
        <Tile label="Avg energy" value={d.avg.energy?.toString() ?? "–"} sub={d.avg.energy ? "of 5" : undefined} />
        <Tile label="Spent" value={formatINR(d.spent)} />
      </div>

      {/* Mood and energy through the week */}
      <section className="glass p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted">How the week felt</h3>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-3">
          {d.days.map((day) => (
            <div key={day.key} className="flex flex-col items-center gap-2">
              <div className="flex h-24 w-full items-end justify-center gap-1">
                <div className="flex w-3 flex-col justify-end rounded-t-md bg-white/8 sm:w-4" style={{ height: "100%" }}>
                  <div className="w-full rounded-t-md" style={{ height: `${(day.energy ?? 0) * 20}%`, background: hsl(45, 95, 62) }} />
                </div>
              </div>
              <span className="text-xl" title={day.note ?? undefined}>{day.mood ? MOODS[day.mood - 1].emoji : "·"}</span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-faint">{weekdayShort(day.key)}</span>
            </div>
          ))}
        </div>
        {d.days.some((x) => x.note) && (
          <ul className="mt-4 flex flex-col gap-1.5 border-t border-line pt-4 text-sm text-muted">
            {d.days.filter((x) => x.note).map((x) => (
              <li key={x.key}>
                <span className="mr-2 text-faint">{weekdayShort(x.key)}</span>
                {x.note}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Areas */}
      <section className="glass p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Where your life moved</h3>
        {d.moves.length === 0 ? (
          <p className="text-sm text-muted">Create a space and rate how it feels to see the trend here.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {d.moves.map(({ space, from, to }) => {
              const delta = from !== null && to !== null ? to - from : null;
              const count = d.doneBySpace.find((x) => x.id === space.id)?.count ?? 0;
              return (
                <li key={space.id} className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl text-lg" style={{ background: hsl(space.hue, 80, 60, 0.16) }}>{space.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{space.name}</span>
                    <span className="text-xs text-faint">{count} done this week</span>
                  </span>
                  <span className="text-sm tabular-nums text-muted">
                    {from ?? "–"} → {to ?? "–"}
                  </span>
                  <span className={cn("w-8 text-right text-xs font-semibold", delta === null || delta === 0 ? "text-faint" : delta > 0 ? "text-lime" : "text-pink")}>
                    {delta === null || delta === 0 ? "–" : `${delta > 0 ? "+" : ""}${delta}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Habits */}
      {d.habits.length > 0 && (
        <section className="glass p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Habits</h3>
          <ul className="flex flex-col gap-3">
            {d.habits.map((h) => (
              <li key={h.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{h.name}</span>
                  <span className="tabular-nums text-muted">{h.done} / {h.target}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (h.done / h.target) * 100)}%`, background: hsl(h.hue, 90, 64) }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* What got done */}
      {d.done.length > 0 && (
        <section className="glass p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">What you finished</h3>
          <ul className="flex flex-col gap-1.5 text-sm text-muted">
            {d.done.slice(0, 12).map((t) => (
              <li key={t.id} className="flex gap-2"><span className="text-lime">✓</span>{t.title}</li>
            ))}
            {d.done.length > 12 && <li className="text-faint">and {d.done.length - 12} more</li>}
          </ul>
        </section>
      )}

      {/* Reflection */}
      <form action={save} key={d.weekStart} className="glass flex flex-col gap-4 p-5">
        <input type="hidden" name="week" value={d.weekStart} />
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Your reflection</h3>
        <label className="flex flex-col gap-1.5 text-sm">
          What went well?
          <textarea name="wins" rows={3} maxLength={2000} defaultValue={d.review?.wins ?? ""} placeholder="Wins, small or big. Who helped. What you're proud of." className={AREA} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          What would you change?
          <textarea name="change" rows={3} maxLength={2000} defaultValue={d.review?.change ?? ""} placeholder="What drained you, what slipped, what you'd do differently." className={AREA} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Focus for next week
          <input name="focus" maxLength={500} autoComplete="off" defaultValue={d.review?.focus ?? ""} placeholder="One sentence." className={AREA} />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-60">
            Save review
          </button>
          {state.ok && <span className="text-sm text-lime">Saved</span>}
          {state.error && <span role="alert" className="text-sm text-danger">{state.error}</span>}
        </div>
      </form>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-3xl leading-none tabular-nums">{value}</span>
        {sub && <span className="text-sm text-muted">{sub}</span>}
      </div>
    </div>
  );
}
