"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { hsl } from "@/lib/course";

/** Animated progress ring. `value` is 0-100. */
export function Ring({
  value,
  hue,
  size = 64,
  stroke = 6,
  children,
}: {
  value: number;
  hue: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const gid = `ring-${hue}-${size}`;

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={hsl(hue, 95, 70)} />
            <stop offset="100%" stopColor={hsl(hue + 50, 95, 66)} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}
