"use client";

import { motion } from "motion/react";
import { CalendarClock, CheckCircle2, ChevronDown, Plus, RotateCcw, Trash2, XCircle } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { addGoal, deleteGoal, setGoalStatus, updateGoalProgress, type ActionState } from "@/app/(app)/life/actions";
import { burstFrom } from "@/lib/fx/confetti";
import { addDays, fmtDayLabel } from "@/lib/time";
import type { Goal } from "@/lib/life/queries";
import { cn } from "@/lib/utils";

const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function GoalCard({ goal, todayKey }: { goal: Goal; todayKey: string }) {
  const [value, setValue] = useState(String(goal.current_value));
  const [error, setError] = useState<string | null>(null);
  const hasTarget = goal.target_value !== null && goal.target_value > 0;
  const pct = hasTarget ? Math.min(100, (goal.current_value / (goal.target_value as number)) * 100) : null;
  const unit = goal.unit ? ` ${goal.unit}` : "";
  const finished = goal.status !== "active";

  const overdue = goal.due_on && goal.due_on < todayKey && !finished;
  const soon = goal.due_on && !overdue && goal.due_on <= addDays(todayKey, 14) && !finished;

  const call = (fn: () => Promise<ActionState>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
    });

  return (
    <li className={cn("glass group p-5", finished && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={cn("text-[15px] font-semibold leading-snug", goal.status === "dropped" && "line-through")}>{goal.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-faint">
            {goal.area && <span className="rounded-full border border-line px-2 py-0.5">{goal.area}</span>}
            {goal.due_on && (
              <span className={cn("inline-flex items-center gap-1", overdue && "text-danger", soon && "text-amber")}>
                <CalendarClock className="size-3" /> {fmtDayLabel(goal.due_on)}
              </span>
            )}
            {goal.status === "done" && <span className="text-lime">Done</span>}
            {goal.status === "dropped" && <span>Dropped</span>}
          </div>
        </div>
        <button
          onClick={() => call(() => deleteGoal(goal.id))}
          aria-label="Delete goal"
          className="rounded-full p-1.5 text-faint opacity-0 transition-all hover:bg-danger/10 hover:text-danger focus:opacity-100 group-hover:opacity-100 max-md:opacity-60"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {hasTarget && pct !== null && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-muted">
              <b className="text-text">{num.format(goal.current_value)}</b> of {num.format(goal.target_value as number)}
              {unit}
            </span>
            <span className="tabular-nums text-faint">{Math.round(pct)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-violet via-pink to-cyan"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!finished && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              call(() => updateGoalProgress(goal.id, Number(value)));
            }}
            className="flex items-center gap-2"
          >
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              aria-label="Current value"
              className="w-24 rounded-lg border border-line bg-black/20 px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-white/30"
            />
            <button type="submit" className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-surface-2">
              Update{unit}
            </button>
          </form>
        )}
        <div className="ml-auto flex gap-1">
          {goal.status === "active" ? (
            <>
              <button onClick={(e) => { burstFrom(e.currentTarget, { count: 120, power: 14 }); call(() => setGoalStatus(goal.id, "done")); }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted transition-colors hover:bg-lime/10 hover:text-lime">
                <CheckCircle2 className="size-3.5" /> Done
              </button>
              <button onClick={() => call(() => setGoalStatus(goal.id, "dropped"))} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-faint transition-colors hover:bg-surface-2 hover:text-text">
                <XCircle className="size-3.5" /> Drop
              </button>
            </>
          ) : (
            <button onClick={() => call(() => setGoalStatus(goal.id, "active"))} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-text">
              <RotateCcw className="size-3.5" /> Reopen
            </button>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
    </li>
  );
}

export function GoalsPanel({ goals, todayKey }: { goals: Goal[]; todayKey: string }) {
  const [state, add, adding] = useActionState<ActionState, FormData>(addGoal, {});
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  const active = goals.filter((g) => g.status === "active");
  const finished = goals.filter((g) => g.status !== "active");

  return (
    <div className="flex flex-col gap-5">
      <form ref={form} action={add} className="glass grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:p-5">
        <input name="title" required maxLength={300} autoComplete="off" placeholder="New goal, e.g. Run 100 km this term" className="min-w-0 bg-transparent text-[15px] outline-none placeholder:text-faint" />
        <button type="submit" disabled={adding} aria-label="Add goal" className="grid size-10 place-items-center justify-self-end rounded-full bg-white text-black transition-transform hover:scale-105 disabled:opacity-60 sm:row-span-2">
          <Plus className="size-5" />
        </button>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-muted sm:col-start-1">
          <input name="area" maxLength={40} placeholder="Area (Career, Fitness…)" className="w-40 rounded-lg border border-line bg-black/20 px-2.5 py-1.5 text-text outline-none placeholder:text-faint" />
          <input name="target" inputMode="decimal" placeholder="Target" className="w-24 rounded-lg border border-line bg-black/20 px-2.5 py-1.5 text-text outline-none placeholder:text-faint" />
          <input name="unit" maxLength={20} placeholder="Unit (km, pages)" className="w-32 rounded-lg border border-line bg-black/20 px-2.5 py-1.5 text-text outline-none placeholder:text-faint" />
          <label className="flex items-center gap-2">
            By
            <input name="due" type="date" className="rounded-lg border border-line bg-black/20 px-2 py-1.5 text-text outline-none [color-scheme:dark]" />
          </label>
          {state.error && <span role="alert" className="text-danger">{state.error}</span>}
        </div>
      </form>

      {active.length === 0 && finished.length === 0 && (
        <div className="glass p-10 text-center">
          <div className="font-display text-3xl">What are you working towards?</div>
          <p className="mt-2 text-sm text-muted">Add a goal with a number to track, or just a direction.</p>
        </div>
      )}

      {active.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {active.map((g) => (
            <GoalCard key={g.id} goal={g} todayKey={todayKey} />
          ))}
        </ul>
      )}

      {finished.length > 0 && (
        <div>
          <button onClick={() => setOpen((o) => !o)} className="mb-3 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-text">
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} /> {finished.length} finished
          </button>
          {open && (
            <ul className="grid gap-4 md:grid-cols-2">
              {finished.map((g) => (
                <GoalCard key={g.id} goal={g} todayKey={todayKey} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
