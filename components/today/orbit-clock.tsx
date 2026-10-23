"use client";

import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { useNow } from "@/hooks/use-now";
import { minutesIntoDay } from "@/lib/calendar";
import { hsl } from "@/lib/course";
import { fmtTime } from "@/lib/time";
import type { DayEvent } from "@/lib/today";

// Your whole day as a dial. Midnight at the top, one lap = 24 hours. Each class is an arc in its
// course colour; a bright hand sweeps to the current time and leaves a comet trail behind it.

const SIZE = 460;
const C = SIZE / 2;
const R = 168; // outermost event ring
const LANE = 19; // gap between rings when events overlap
const WIDTH = 13;

const ang = (min: number) => (min / 1440) * 360 - 90;
const rad = (deg: number) => (deg * Math.PI) / 180;
// Rounded: Node and the browser differ in the last digits of sin/cos, and React treats any difference
// between the server's markup and the browser's as a hydration error.
const round = (n: number) => Math.round(n * 100) / 100;
const pt = (r: number, deg: number) => ({ x: round(C + r * Math.cos(rad(deg))), y: round(C + r * Math.sin(rad(deg))) });

function arc(r: number, a0: number, a1: number) {
  const s = pt(r, a0);
  const e = pt(r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

type Placed = DayEvent & { m0: number; m1: number; lane: number };

/** Events that overlap in time step inward onto their own ring. */
function placeLanes(events: DayEvent[]): Placed[] {
  const ends: number[] = [];
  return events
    .filter((e) => !e.cancelled)
    .map((e) => ({ ...e, m0: minutesIntoDay(Date.parse(e.start)), m1: minutesIntoDay(Date.parse(e.end)) || 1440 }))
    .sort((a, b) => a.m0 - b.m0)
    .map((e) => {
      let lane = ends.findIndex((end) => end <= e.m0);
      if (lane === -1) lane = ends.length;
      ends[lane] = e.m1;
      return { ...e, lane };
    });
}

const HOURS = [
  { h: 0, label: "12a" },
  { h: 6, label: "6a" },
  { h: 12, label: "12p" },
  { h: 18, label: "6p" },
];

export function OrbitClock({ events, serverNow }: { events: DayEvent[]; serverNow: string }) {
  const nowMs = useNow(serverNow, 1000);
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);

  const placed = useMemo(() => placeLanes(events), [events]);
  const nowMin = minutesIntoDay(nowMs);
  const nowDeg = ang(nowMin);

  const live = placed.find((e) => nowMin >= e.m0 && nowMin < e.m1);
  const next = placed.find((e) => e.m0 > nowMin);
  const focus = placed.find((e) => e.id === hover) ?? live ?? next ?? null;
  const caption = hover
    ? `${focus?.course} · ${focus?.range}`
    : live
      ? `In ${live.course}`
      : next
        ? `Next: ${next.course} at ${fmtTime(next.start)}`
        : placed.length
          ? "Done for the day"
          : "A free day";

  const hand = pt(R + 24, nowDeg);
  const inner = pt(58, nowDeg);
  const trailStart = ang(Math.max(0, nowMin - 70));

  return (
    <div data-tilt className="tilt relative mx-auto aspect-square w-full max-w-[460px] select-none">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full overflow-visible" role="img" aria-label={`Today's schedule. ${caption}.`}>
        <defs>
          <radialGradient id="oc-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgb(139 108 255 / 0.22)" />
            <stop offset="70%" stopColor="rgb(53 224 255 / 0.05)" />
            <stop offset="100%" stopColor="rgb(0 0 0 / 0)" />
          </radialGradient>
          <linearGradient id="oc-hand" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(255 255 255 / 0)" />
            <stop offset="100%" stopColor="#fff" />
          </linearGradient>
          <linearGradient id="oc-trail" gradientUnits="userSpaceOnUse" x1={pt(R, trailStart).x} y1={pt(R, trailStart).y} x2={pt(R, nowDeg).x} y2={pt(R, nowDeg).y}>
            <stop offset="0%" stopColor="#35e0ff" stopOpacity="0" />
            <stop offset="100%" stopColor="#8b6cff" stopOpacity="0.95" />
          </linearGradient>
          <filter id="oc-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={C} cy={C} r={R + 30} fill="url(#oc-core)" />

        {/* concentric guide rings */}
        {[R + 24, R, R - LANE * 2, 96].map((r, i) => (
          <circle key={r} cx={C} cy={C} r={r} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={1} strokeDasharray={i === 0 ? "1 5" : undefined} />
        ))}

        {/* 24 hour ticks */}
        {Array.from({ length: 24 }, (_, h) => {
          const a = ang(h * 60);
          const major = h % 6 === 0;
          const p0 = pt(R + (major ? 30 : 33), a);
          const p1 = pt(R + 38, a);
          return <line key={h} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={major ? "rgb(255 255 255 / 0.5)" : "rgb(255 255 255 / 0.18)"} strokeWidth={major ? 1.6 : 1} strokeLinecap="round" />;
        })}
        {HOURS.map(({ h, label }) => {
          const p = pt(R + 54, ang(h * 60));
          return (
            <text key={h} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={600} letterSpacing={1.5} fill="rgb(255 255 255 / 0.42)">
              {label}
            </text>
          );
        })}

        {/* the classes */}
        {placed.map((e, i) => {
          const r = R - e.lane * LANE;
          const past = nowMin >= e.m1;
          const isLive = e === live;
          const dim = hover && hover !== e.id;
          return (
            <g key={e.id} onPointerEnter={() => setHover(e.id)} onPointerLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
              <title>{`${e.course}, ${e.range}`}</title>
              {/* a fatter invisible stroke makes the arc easy to hover */}
              <path d={arc(r, ang(e.m0), ang(e.m1))} fill="none" stroke="transparent" strokeWidth={WIDTH + 14} />
              <motion.path
                d={arc(r, ang(e.m0), ang(e.m1))}
                fill="none"
                stroke={hsl(e.hue, 90, isLive ? 72 : 64)}
                strokeWidth={isLive ? WIDTH + 3 : WIDTH}
                strokeLinecap="round"
                filter={isLive ? "url(#oc-glow)" : undefined}
                initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: dim ? 0.25 : past ? 0.4 : 1 }}
                transition={{ pathLength: { duration: 1.1, delay: 0.35 + i * 0.12, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.25 } }}
              />
            </g>
          );
        })}

        {/* comet trail behind the hand */}
        {nowMin > 5 && <path d={arc(R, trailStart, nowDeg)} fill="none" stroke="url(#oc-trail)" strokeWidth={4} strokeLinecap="round" opacity={0.9} />}

        {/* the hand */}
        <motion.g
          style={{ transformOrigin: `${C}px ${C}px` }}
          initial={reduce ? false : { rotate: -nowDeg - 90 }}
          animate={{ rotate: 0 }}
          transition={{ duration: 1.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <line x1={inner.x} y1={inner.y} x2={hand.x} y2={hand.y} stroke="url(#oc-hand)" strokeWidth={2.2} strokeLinecap="round" />
          <circle cx={hand.x} cy={hand.y} r={9} fill="rgb(255 255 255 / 0.18)">
            {!reduce && <animate attributeName="r" values="7;13;7" dur="2.4s" repeatCount="indefinite" />}
            {!reduce && <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2.4s" repeatCount="indefinite" />}
          </circle>
          <circle cx={hand.x} cy={hand.y} r={4.6} fill="#fff" filter="url(#oc-glow)" />
        </motion.g>
      </svg>

      {/* the middle: the time, and what it means */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="font-display text-[clamp(2.6rem,9vw,3.9rem)] leading-none tracking-tight tabular-nums">{fmtTime(new Date(nowMs)).replace(" ", "")}</div>
          <div className="mx-auto mt-2 max-w-[11rem] text-[13px] leading-snug text-muted">{caption}</div>
        </div>
      </div>
    </div>
  );
}
