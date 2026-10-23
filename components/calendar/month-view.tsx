"use client";

import { motion } from "motion/react";
import { dayNum, monthGrid, monthKeyOf, type CalEvent } from "@/lib/calendar";
import { hsl } from "@/lib/course";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthView({
  animated,
  dateKey,
  todayKey,
  selectedKey,
  byDay,
  onPickDay,
  onOpen,
}: {
  animated: boolean;
  dateKey: string;
  todayKey: string;
  selectedKey: string;
  byDay: Map<string, CalEvent[]>;
  onPickDay: (key: string) => void;
  onOpen: (ev: CalEvent) => void;
}) {
  const days = monthGrid(dateKey);
  const month = monthKeyOf(dateKey);

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1.5 px-1 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-faint md:gap-2">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5 md:gap-2">
        {days.map((key, i) => {
          const all = byDay.get(key) ?? [];
          const holiday = all.find((e) => e.type === "holiday");
          const evs = all.filter((e) => e.type !== "holiday");
          const inMonth = monthKeyOf(key) === month;
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          const extra = Math.max(0, evs.length - 3);

          return (
            <motion.div
              key={key}
              initial={animated ? { opacity: 0, scale: 0.96 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, delay: Math.min(i * 0.008, 0.3), ease: [0.22, 1, 0.36, 1] }}
              role="button"
              tabIndex={0}
              aria-label={`${key}, ${evs.length} events`}
              onClick={() => onPickDay(key)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPickDay(key)}
              className={cn(
                "group relative flex min-h-[64px] cursor-pointer flex-col rounded-xl border p-1.5 text-left transition-colors md:min-h-[116px] md:rounded-2xl md:p-2.5",
                inMonth ? "border-line bg-surface hover:bg-surface-2" : "border-transparent bg-white/[0.015] opacity-45 hover:opacity-80",
                isSelected && "max-md:ring-1 max-md:ring-white/40",
                isToday && "border-white/25 bg-white/[0.07]",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-xs font-semibold tabular-nums md:size-7 md:text-sm",
                    isToday ? "bg-gradient-to-br from-violet to-cyan text-black" : "text-muted group-hover:text-text",
                  )}
                >
                  {dayNum(key)}
                </span>
                {holiday && (
                  <span className="hidden rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber md:inline">
                    Holiday
                  </span>
                )}
              </div>

              {/* Desktop: event chips */}
              <div className="mt-1.5 hidden flex-col gap-1 md:flex">
                {evs.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(ev);
                    }}
                    className={cn(
                      "flex w-full items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-left text-[11px] font-medium leading-none transition-[filter] hover:brightness-125",
                      ev.cancelled && "line-through opacity-50",
                    )}
                    style={{ background: hsl(ev.hue, 80, 60, 0.16), color: hsl(ev.hue, 90, 80) }}
                  >
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: hsl(ev.hue, 90, 66) }} />
                    <span className="truncate">{ev.course}</span>
                  </button>
                ))}
                {extra > 0 && <span className="px-1.5 text-[11px] text-faint">+{extra} more</span>}
              </div>

              {/* Mobile: dots */}
              <div className="mt-auto flex flex-wrap gap-0.5 pt-1 md:hidden">
                {evs.slice(0, 4).map((ev) => (
                  <span key={ev.id} className="size-1.5 rounded-full" style={{ background: hsl(ev.hue, 90, 66) }} />
                ))}
                {holiday && <span className="size-1.5 rounded-full bg-amber" />}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
