"use client";

import { motion, useReducedMotion } from "motion/react";
import { MapPin, Video } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { hsl } from "@/lib/course";
import { fmtDuration } from "@/lib/time";
import type { DayEvent } from "@/lib/today";

const R = 62;
const C = 2 * Math.PI * R;

type Phase =
  | { kind: "live"; ev: DayEvent; progress: number; left: number }
  | { kind: "next"; ev: DayEvent; until: number; progress: number }
  | { kind: "done" }
  | { kind: "free" };

function phaseFor(events: DayEvent[], now: number): Phase {
  const active = events.filter((e) => !e.cancelled);
  if (!active.length) return { kind: "free" };

  for (const ev of active) {
    const s = new Date(ev.start).getTime();
    const e = new Date(ev.end).getTime();
    if (now >= s && now < e) return { kind: "live", ev, progress: (now - s) / (e - s), left: e - now };
  }
  const next = active.find((ev) => new Date(ev.start).getTime() > now);
  if (next) {
    const s = new Date(next.start).getTime();
    // The ring fills over the 3 hours leading up to the start.
    const window = 3 * 3_600_000;
    return { kind: "next", ev: next, until: s - now, progress: Math.min(1, Math.max(0, 1 - (s - now) / window)) };
  }
  return { kind: "done" };
}

export function LiveNow({ events, serverNow }: { events: DayEvent[]; serverNow: string }) {
  const now = useNow(serverNow);
  const reduce = useReducedMotion();
  const phase = phaseFor(events, now);

  const ev = phase.kind === "live" || phase.kind === "next" ? phase.ev : null;
  const hue = ev?.hue ?? 255;
  const progress = phase.kind === "live" || phase.kind === "next" ? phase.progress : phase.kind === "done" ? 1 : 0;

  const personal = !!ev && ev.source !== undefined && ev.source !== "nexus";
  const label =
    phase.kind === "live"
      ? personal
        ? ev?.source === "task"
          ? "Task time"
          : "Happening now"
        : "In session"
      : phase.kind === "next"
        ? "Up next"
        : phase.kind === "done"
          ? "All done"
          : "Free day";
  const big =
    phase.kind === "live" ? fmtDuration(phase.left) : phase.kind === "next" ? fmtDuration(phase.until) : phase.kind === "done" ? "✓" : "—";
  const sub = phase.kind === "live" ? "left" : phase.kind === "next" ? "to go" : "";

  return (
    <div data-tilt className="glass tilt relative overflow-hidden p-6 sm:p-8">
      <div
        className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full opacity-60"
        style={{ background: `radial-gradient(circle, ${hsl(hue, 90, 60, 0.45)}, transparent 65%)` }}
      />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: hsl(hue, 90, 72) }}>
            <span
              className={`relative size-2 rounded-full ${phase.kind === "live" ? "pulse-dot" : ""}`}
              style={{ background: hsl(hue, 90, 66) }}
            />
            {label}
          </div>

          {ev ? (
            <>
              <h2 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl">{ev.course}</h2>
              <p className="mt-2 text-base text-muted">{ev.range}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
                {ev.room && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5">
                    <MapPin className="size-3.5" /> {ev.room}
                  </span>
                )}
                {ev.link && (
                  <a
                    href={ev.link}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 transition-colors hover:bg-surface-2 hover:text-text"
                  >
                    <Video className="size-3.5" /> Join online
                  </a>
                )}
                {ev.instructor && <span className="px-1">with {ev.instructor}</span>}
              </div>
            </>
          ) : (
            <h2 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl">
              {phase.kind === "done" ? "That's a wrap for today." : "Nothing scheduled."}
            </h2>
          )}
        </div>

        <div className="relative mx-auto grid size-[168px] shrink-0 place-items-center sm:mx-0">
          <svg viewBox="0 0 160 160" className="absolute inset-0 -rotate-90">
            <defs>
              <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={hsl(hue, 95, 70)} />
                <stop offset="100%" stopColor={hsl(hue + 50, 95, 66)} />
              </linearGradient>
            </defs>
            <circle cx="80" cy="80" r={R} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth="9" />
            <motion.circle
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke="url(#ring)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={C}
              initial={reduce ? false : { strokeDashoffset: C }}
              animate={{ strokeDashoffset: C * (1 - progress) }}
              transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <div className="text-center">
            <div className="text-[1.7rem] font-semibold leading-none tracking-tight tabular-nums">{big}</div>
            {sub && <div className="mt-1.5 text-xs uppercase tracking-[0.18em] text-faint">{sub}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
