"use client";

import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useOptimistic, useRef, useState } from "react";
import { addExpense, deleteExpense, type ActionState } from "@/app/(app)/life/actions";
import { courseHue, hsl } from "@/lib/course";
import { DEFAULT_CATEGORIES, formatINR, shiftMonth, summarise, type Expense } from "@/lib/life/money";
import { fmtDayLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

const monthName = (key: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-15T12:00:00Z`));

function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="glass p-4 sm:p-5">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">{label}</div>
      <div className={cn("mt-2 font-display text-4xl leading-none tracking-tight tabular-nums sm:text-5xl", tone === "good" && "text-lime", tone === "bad" && "text-danger")}>{value}</div>
    </div>
  );
}

export function MoneyPanel({
  expenses,
  prevSpent,
  monthKey,
  todayKey,
  isCurrentMonth,
}: {
  expenses: Expense[];
  prevSpent: number;
  monthKey: string;
  todayKey: string;
  isCurrentMonth: boolean;
}) {
  const [list, remove] = useOptimistic(expenses, (s: Expense[], id: string) => s.filter((e) => e.id !== id));
  const [state, add, adding] = useActionState<ActionState, FormData>(addExpense, {});
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  const sum = summarise(list);
  const delta = prevSpent > 0 ? ((sum.spent - prevSpent) / prevSpent) * 100 : null;

  const byDay = new Map<string, Expense[]>();
  for (const e of list) byDay.set(e.spent_on, [...(byDay.get(e.spent_on) ?? []), e]);

  const link = (k: string) => `/life?tab=money&month=${k}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-3xl tracking-tight">{monthName(monthKey)}</h2>
        <div className="flex items-center rounded-full border border-line bg-surface p-1">
          <Link href={link(shiftMonth(monthKey, -1))} aria-label="Previous month" className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text">
            <ChevronLeft className="size-[18px]" />
          </Link>
          <Link href={link(shiftMonth(monthKey, 1))} aria-label="Next month" className={cn("grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text", isCurrentMonth && "pointer-events-none opacity-30")}>
            <ChevronRight className="size-[18px]" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile label="Spent" value={formatINR(sum.spent)} />
        <Tile label="Income" value={formatINR(sum.income)} tone={sum.income > 0 ? "good" : undefined} />
        <div className="col-span-2 lg:col-span-1">
          <Tile label="Net" value={formatINR(sum.net)} tone={sum.net < 0 ? "bad" : sum.net > 0 ? "good" : undefined} />
        </div>
      </div>
      {delta !== null && (
        <p className="-mt-2 text-xs text-faint">
          {delta >= 0 ? "Up" : "Down"} {Math.abs(Math.round(delta))}% on spending last month ({formatINR(prevSpent)})
        </p>
      )}

      <form ref={form} action={add} className="glass flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-full border border-line bg-black/20 p-0.5 text-xs" role="radiogroup" aria-label="Type">
            {(["expense", "income"] as const).map((k) => (
              <button type="button" key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn("rounded-full px-3 py-1.5 font-medium capitalize transition-colors", kind === k ? "bg-white/15 text-text" : "text-muted")}>
                {k}
              </button>
            ))}
          </div>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="category" value={category} />
          <div className="flex min-w-0 flex-1 items-center gap-1 basis-40">
            <span className="text-lg text-muted">₹</span>
            <input name="amount" required inputMode="decimal" autoComplete="off" placeholder="0" className="w-full min-w-0 bg-transparent font-display text-3xl outline-none placeholder:text-faint" />
          </div>
          <button type="submit" disabled={adding} aria-label="Add entry" className="grid size-10 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105 disabled:opacity-60">
            <Plus className="size-5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DEFAULT_CATEGORIES.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", category === c ? "border-white/30 bg-white/12 text-text" : "border-line text-muted hover:bg-surface-2")}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <input name="note" maxLength={200} placeholder="Note (optional)" className="min-w-0 flex-1 basis-48 rounded-lg border border-line bg-black/20 px-2.5 py-1.5 text-text outline-none placeholder:text-faint" />
          <input name="date" type="date" defaultValue={todayKey} max={todayKey} className="rounded-lg border border-line bg-black/20 px-2 py-1.5 text-text outline-none [color-scheme:dark]" />
          {(state.error || error) && <span role="alert" className="w-full text-danger">{state.error ?? error}</span>}
        </div>
      </form>

      {sum.byCategory.length > 0 && (
        <section className="glass p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Where it went</h3>
          <ul className="flex flex-col gap-3">
            {sum.byCategory.map((c) => (
              <li key={c.category}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span>{c.category}</span>
                  <span className="tabular-nums text-muted">
                    {formatINR(c.paise)} <span className="text-faint">· {Math.round(c.share * 100)}%</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/8">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: hsl(courseHue(c.category), 85, 62) }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(2, c.share * 100)}%` }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {list.length === 0 ? (
        <div className="glass p-8 text-center text-sm text-muted">Nothing logged in {monthName(monthKey)}.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {[...byDay.entries()].map(([day, items]) => (
            <section key={day}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">{fmtDayLabel(day)}</h3>
              <ul className="flex flex-col gap-1.5">
                {items.map((e) => (
                  <li key={e.id} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: hsl(courseHue(e.category), 85, 62) }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{e.category}</div>
                      {e.note && <div className="truncate text-xs text-faint">{e.note}</div>}
                    </div>
                    <span className={cn("shrink-0 text-sm font-semibold tabular-nums", e.amount_paise < 0 && "text-lime")}>
                      {e.amount_paise < 0 ? "+" : ""}
                      {formatINR(Math.abs(e.amount_paise))}
                    </span>
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          setError(null);
                          remove(e.id);
                          const r = await deleteExpense(e.id);
                          if (r.error) setError(r.error);
                        })
                      }
                      aria-label="Delete entry"
                      className="shrink-0 rounded-full p-1.5 text-faint opacity-0 transition-all hover:bg-danger/10 hover:text-danger focus:opacity-100 group-hover:opacity-100 max-md:opacity-60"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
