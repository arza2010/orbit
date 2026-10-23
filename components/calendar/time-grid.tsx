"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import { dayNum, layoutDay, minutesIntoDay, weekdayShort, type CalEvent } from "@/lib/calendar";
import { hsl } from "@/lib/course";
import { cn } from "@/lib/utils";

const HOUR_H = 60;

const hourLabel = (h: number) => {
  const hh = h % 24;
  const ap = hh >= 12 ? "pm" : "am";
  return `${hh % 12 === 0 ? 12 : hh % 12} ${ap}`;
};

export function TimeGrid({
  animated,
  days,
  todayKey,
  byDay,
  nowMs,
  onOpen,
  onPickDay,
}: {
  animated: boolean;
  days: string[];
  todayKey: string;
  byDay: Map<string, CalEvent[]>;
  nowMs: number;
  onOpen: (ev: CalEvent) => void;
  onPickDay?: (key: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  // Visible hour range: 8am to 9pm by default, widened if events fall outside it.
  const { startH, endH } = useMemo(() => {
    let lo = 8;
    let hi = 21;
    for (const d of days) {
      for (const ev of byDay.get(d) ?? []) {
        if (ev.type === "holiday" || ev.allDay) continue;
        lo = Math.min(lo, Math.floor(minutesIntoDay(ev.startMs) / 60));
        const end = minutesIntoDay(ev.endMs) || 24 * 60;
        hi = Math.max(hi, Math.ceil(end / 60));
      }
    }
    return { startH: Math.max(0, lo), endH: Math.min(24, hi) };
  }, [days, byDay]);

  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const totalH = hours.length * HOUR_H;
  const cols = `52px repeat(${days.length}, minmax(0, 1fr))`;

  // Scroll so the first useful thing is in view: now (today) or the earliest event.
  const anchor = days.includes(todayKey) ? minutesIntoDay(nowMs) : null;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = anchor !== null ? anchor : startH * 60;
    el.scrollTop = Math.max(0, ((target - startH * 60) / 60) * HOUR_H - 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join(","), startH]);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-black/20">
      {/* Day headers */}
      <div className="grid border-b border-line bg-surface" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => {
          const isToday = d === todayKey;
          const holiday = (byDay.get(d) ?? []).find((e) => e.type === "holiday");
          return (
            <button
              key={d}
              onClick={() => onPickDay?.(d)}
              disabled={!onPickDay}
              className="flex flex-col items-center gap-1 border-l border-line py-3 transition-colors enabled:hover:bg-surface-2"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">{weekdayShort(d)}</span>
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full text-sm font-semibold tabular-nums",
                  isToday ? "bg-gradient-to-br from-violet to-cyan text-black" : "text-text",
                )}
              >
                {dayNum(d)}
              </span>
              {holiday && <span className="text-[10px] font-semibold uppercase tracking-wider text-amber">Holiday</span>}
            </button>
          );
        })}
      </div>

      {days.some((d) => (byDay.get(d) ?? []).some((e) => e.allDay)) && (
        <div className="grid border-b border-line bg-surface/60" style={{ gridTemplateColumns: cols }}>
          <div className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-faint">All day</div>
          {days.map((d) => (
            <div key={d} className="flex min-w-0 flex-col gap-1 border-l border-line p-1">
              {(byDay.get(d) ?? [])
                .filter((e) => e.allDay)
                .map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => onOpen(ev)}
                    className="truncate rounded-md px-1.5 py-1 text-left text-[11px] font-medium leading-none transition-[filter] hover:brightness-125"
                    style={{ background: hsl(ev.hue, 80, 60, 0.18), color: hsl(ev.hue, 90, 82) }}
                  >
                    {ev.course}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}

      <div ref={scroller} data-lenis-prevent className="max-h-[calc(100dvh-340px)] min-h-[420px] overflow-y-auto overscroll-contain">
        <div className="relative grid" style={{ gridTemplateColumns: cols, height: totalH }}>
          {/* Hour gutter + lines */}
          <div className="relative">
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] font-medium uppercase tracking-wider text-faint"
                style={{ top: i * HOUR_H }}
              >
                {i === 0 ? "" : hourLabel(h)}
              </div>
            ))}
          </div>

          {days.map((d, di) => {
            const placed = layoutDay((byDay.get(d) ?? []).filter((e) => e.type !== "holiday" && !e.allDay));
            const isToday = d === todayKey;
            const nowMin = minutesIntoDay(nowMs);
            return (
              <div key={d} className={cn("relative border-l border-line", isToday && "bg-white/[0.025]")}>
                {hours.map((h, i) => (
                  <div key={h} className="absolute inset-x-0 border-t border-white/[0.06]" style={{ top: i * HOUR_H }} />
                ))}

                {placed.map(({ ev, col, cols: n }, i) => {
                  const s = minutesIntoDay(ev.startMs);
                  const e = Math.min(minutesIntoDay(ev.endMs) || 24 * 60, 24 * 60);
                  const top = ((s - startH * 60) / 60) * HOUR_H;
                  const height = Math.max(((e - s) / 60) * HOUR_H - 3, 26);
                  const compact = height < 54;
                  return (
                    <motion.button
                      key={ev.id}
                      onClick={() => onOpen(ev)}
                      initial={animated ? { opacity: 0, scale: 0.94 } : false}
                      animate={{ opacity: ev.cancelled ? 0.5 : 1, scale: 1 }}
                      transition={{ duration: 0.4, delay: 0.04 * (di + i), ease: [0.22, 1, 0.36, 1] }}
                      className="absolute overflow-hidden rounded-lg border-l-[3px] px-2 py-1.5 text-left transition-[filter] hover:brightness-125"
                      style={{
                        top,
                        height,
                        left: `calc(${(col / n) * 100}% + 3px)`,
                        width: `calc(${100 / n}% - 6px)`,
                        background: hsl(ev.hue, 80, 58, 0.2),
                        borderColor: hsl(ev.hue, 90, 66),
                        color: hsl(ev.hue, 90, 86),
                      }}
                    >
                      <div className={cn("truncate text-xs font-semibold leading-tight", ev.cancelled && "line-through")}>
                        {ev.course}
                      </div>
                      {!compact && <div className="mt-0.5 truncate text-[11px] opacity-75">{ev.range}</div>}
                      {!compact && ev.room && <div className="truncate text-[11px] opacity-60">{ev.room}</div>}
                    </motion.button>
                  );
                })}

                {isToday && nowMin >= startH * 60 && nowMin <= endH * 60 && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                    style={{ top: ((nowMin - startH * 60) / 60) * HOUR_H }}
                  >
                    <span className="-ml-1 size-2 rounded-full bg-pink shadow-[0_0_10px_var(--pink)]" />
                    <span className="h-px flex-1 bg-pink/80" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
