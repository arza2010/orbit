"use client";

import { motion } from "motion/react";
import { MapPin } from "lucide-react";
import { dayLongLabel, type CalEvent } from "@/lib/calendar";
import { hsl } from "@/lib/course";
import { cn } from "@/lib/utils";

/** Phone-friendly list of events grouped by day. */
export function Agenda({
  animated,
  days,
  todayKey,
  byDay,
  onOpen,
  emptyLabel = "Nothing scheduled.",
}: {
  animated: boolean;
  days: string[];
  todayKey: string;
  byDay: Map<string, CalEvent[]>;
  onOpen: (ev: CalEvent) => void;
  emptyLabel?: string;
}) {
  const populated = days.filter((d) => (byDay.get(d) ?? []).length > 0);

  if (!populated.length) {
    return <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-muted">{emptyLabel}</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      {populated.map((d) => {
        const list = byDay.get(d) ?? [];
        return (
          <section key={d}>
            <h3 className={cn("mb-2 text-xs font-semibold uppercase tracking-[0.18em]", d === todayKey ? "text-cyan" : "text-muted")}>
              {d === todayKey ? "Today · " : ""}
              {dayLongLabel(d)}
            </h3>
            <ul className="flex flex-col gap-2">
              {list.map((ev, i) =>
                ev.type === "holiday" ? (
                  <li key={ev.id} className="rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
                    Holiday · {ev.title}
                  </li>
                ) : (
                  <motion.li
                    key={ev.id}
                    initial={animated ? { opacity: 0, y: 10 } : false}
                    animate={{ opacity: ev.cancelled ? 0.5 : 1, y: 0 }}
                    transition={{ duration: 0.4, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <button
                      onClick={() => onOpen(ev)}
                      className="flex w-full items-stretch gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="w-1 shrink-0 rounded-full" style={{ background: hsl(ev.hue, 90, 66) }} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-[15px] font-semibold", ev.cancelled && "line-through")}>{ev.course}</span>
                        <span className="mt-0.5 block text-sm text-muted">{ev.range}</span>
                        {ev.room && (
                          <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-faint">
                            <MapPin className="size-3" /> {ev.room}
                          </span>
                        )}
                      </span>
                      {ev.cancelled && (
                        <span className="self-start rounded-full bg-danger/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-danger">
                          Cancelled
                        </span>
                      )}
                    </button>
                  </motion.li>
                ),
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
