"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

export function CountUp({
  value,
  decimals = 0,
  duration = 1.4,
}: {
  value: number;
  decimals?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(v),
    });
    return () => controls.stop();
  }, [inView, value, duration, reduce]);

  // Reduced-motion users get the final number immediately.
  const display = reduce ? value : shown;

  return (
    <span ref={ref} className="tabular-nums">
      {display.toFixed(decimals)}
    </span>
  );
}
