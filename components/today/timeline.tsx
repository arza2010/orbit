"use client";

import { motion, useReducedMotion } from "motion/react";
import { Check, ListChecks, MapPin, Sparkles, TriangleAlert, CalendarDays } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { hsl } from "@/lib/course";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/time";
import type { DayEvent, FreeWindow } from "@/lib/today";

const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);

export function Timeline({
  events,
  serverNow,
  allDay = [],
  free = [],
}: {
  events: DayEvent[];
  serverNow: string;
  allDay?: { title: string; hue: number }[];
  free?: FreeWindow[];
}) {
  const now = useNow(serverNow);
  const reduce = useReducedMotion();

  if (!events.length) {
    return (
      <div className="glass p-8 text-center text-muted">
        <div className="font-display text-3xl text-text">An open day.</div>
        <p className="mt-2 text-sm">Nothing on your calendar{allDay.length ? `, apart from ${allDay.map((a) => a.title).join(" and ")}` : ""}. Good time to get ahead.</p>
      </div>
    );
  }

  return (
    <div className="glass p-5 sm:p-7">
      <div className="mb-5 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">Today&apos;s timeline</h3>
        <span className="text-xs text-faint">{events.length} items</span>
      </div>

      {allDay.length > 0 && (
        <div className="-mt-2 mb-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">
            <CalendarDays className="size-3.5" /> All day
          </span>
          {allDay.map((a) => (
            <span key={a.title} className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: hsl(a.hue, 80, 60, 0.16), color: hsl(a.hue, 90, 80) }}>
              {a.title}
            </span>
          ))}
        </div>
      )}

      {free.length > 0 && (
        <div className="-mt-1 mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5 font-medium text-text">
            <Sparkles className="size-3.5 text-cyan" /> Free
          </span>
          {free.map((w) => (
            <span key={w.start} className="tabular-nums">
              {fmtTime(w.start)} – {fmtTime(w.end)} <span className="text-faint">({dur(w.minutes)})</span>
            </span>
          ))}
        </div>
      )}

      <ol className="relative">
        <span className="absolute bottom-3 left-[11px] top-3 w-px bg-gradient-to-b from-white/15 via-white/10 to-transparent" />
        {events.map((ev, i) => {
          const s = new Date(ev.start).getTime();
          const e = new Date(ev.end).getTime();
          const state = ev.cancelled ? "cancelled" : now >= e ? "past" : now >= s ? "live" : "upcoming";
          const color = hsl(ev.hue, 90, 66);
          return (
            <motion.li
              key={ev.id}
              className="relative pb-3 pl-9 last:pb-0"
              initial={reduce ? false : { opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.5 + i * 0.09, ease: [0.22, 1, 0.36, 1] }}
            >
              <span
                className={cn(
                  "absolute left-0 top-4 grid size-[23px] place-items-center rounded-full border-2 bg-[#0a0a12]",
                  state === "live" && "pulse-dot",
                )}
                style={{ borderColor: state === "past" ? "rgb(255 255 255 / 0.18)" : color, color }}
              >
                {state === "past" ? <Check className="size-3 text-faint" strokeWidth={3} /> : (
                  <span className="size-2 rounded-full" style={{ background: state === "cancelled" ? "transparent" : color }} />
                )}
              </span>

              <div
                className={cn(
                  "rounded-2xl border p-4 transition-colors",
                  state === "live" ? "border-white/20 bg-white/[0.07]" : "border-line bg-surface hover:bg-surface-2",
                  (state === "past" || state === "cancelled") && "opacity-55",
                )}
                style={state === "live" ? { boxShadow: `0 0 0 1px ${hsl(ev.hue, 90, 66, 0.35)}, 0 12px 40px -16px ${hsl(ev.hue, 90, 60, 0.5)}` } : undefined}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={cn("truncate text-[15px] font-semibold", state === "cancelled" && "line-through")}>
                      {ev.course}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted">
                      <span className="whitespace-nowrap">{ev.range}</span>
                      {ev.attendance && state !== "cancelled" && (
                        <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-faint">
                          Attendance
                        </span>
                      )}
                      {ev.source === "google" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-faint">
                          <CalendarDays className="size-3" /> Google
                        </span>
                      )}
                      {ev.source === "task" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-amber">
                          <ListChecks className="size-3" /> Task
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {state === "live" && (
                      <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-black" style={{ background: color }}>
                        Live
                      </span>
                    )}
                    {state === "cancelled" && (
                      <span className="rounded-full bg-danger/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-danger">
                        Cancelled
                      </span>
                    )}
                  </div>
                </div>
                {ev.clash && state !== "past" && (
                  <div className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-amber">
                    <TriangleAlert className="size-3.5" /> Clashes with {ev.clash}
                  </div>
                )}
                {(ev.room || ev.instructor) && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-faint">
                    {ev.room && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" /> {ev.room}
                      </span>
                    )}
                    {ev.instructor && <span>{ev.instructor}</span>}
                  </div>
                )}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
