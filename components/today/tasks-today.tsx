"use client";

import { Check, ListChecks } from "lucide-react";
import Link from "next/link";
import { startTransition, useOptimistic } from "react";
import { setTaskDone } from "@/app/(app)/life/actions";
import { Reveal } from "@/components/motion/reveal";
import { burstFrom } from "@/lib/fx/confetti";
import { bucketOf, type Task } from "@/lib/life/tasks";
import { cn } from "@/lib/utils";

/** Overdue and due-today tasks on the Today screen, tickable in place. */
export function TasksToday({ tasks, todayKey }: { tasks: Task[]; todayKey: string }) {
  const [list, hide] = useOptimistic(tasks, (s: Task[], id: string) => s.filter((t) => t.id !== id));

  return (
    <Reveal delay={0.12}>
      <div className="glass p-5 sm:p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-muted">
            <ListChecks className="size-4" /> Your tasks
          </h3>
          <Link href="/life?tab=tasks" className="text-xs text-faint transition-colors hover:text-text">
            All tasks →
          </Link>
        </div>
        {list.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Nothing due. Nice.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {list.slice(0, 6).map((t) => {
              const overdue = bucketOf(t, todayKey) === "overdue";
              return (
                <li key={t.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5">
                  <button
                    onClick={(e) => {
                      burstFrom(e.currentTarget);
                      startTransition(async () => {
                        hide(t.id);
                        await setTaskDone(t.id, true);
                      });
                    }}
                    aria-label={`Mark "${t.title}" as done`}
                    className="grid size-5 shrink-0 place-items-center rounded-full border-2 border-white/25 text-transparent transition-all hover:border-lime hover:bg-lime hover:text-black"
                  >
                    <Check className="size-3" strokeWidth={3.5} />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  <span className={cn("shrink-0 text-[11px] font-semibold", overdue ? "text-danger" : "text-amber")}>{overdue ? "Overdue" : "Today"}</span>
                </li>
              );
            })}
          </ul>
        )}
        {list.length > 6 && <p className="mt-3 text-center text-xs text-faint">+{list.length - 6} more</p>}
      </div>
    </Reveal>
  );
}
