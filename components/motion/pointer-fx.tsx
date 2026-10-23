"use client";

import { useEffect } from "react";

// One pointer listener for the whole app, doing two things on whatever is under the cursor:
//   .glass         gets a soft light that follows the pointer (--px, --py)
//   [data-tilt]    leans toward the pointer in 3D (--rx, --ry)
// It writes CSS variables only, so there is no re-rendering. Skipped entirely on touch and for reduced motion.

const TILT_DEG = 5;

export function PointerFx() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    let raf = 0;
    let ev: PointerEvent | null = null;
    let lit: HTMLElement | null = null;
    let tilted: HTMLElement | null = null;

    const frame = () => {
      raf = 0;
      if (!ev) return;
      const target = ev.target instanceof Element ? ev.target : null;

      const glass = target?.closest<HTMLElement>(".glass") ?? null;
      if (lit && lit !== glass) {
        lit.style.removeProperty("--px");
        lit.style.removeProperty("--py");
      }
      if (glass) {
        const r = glass.getBoundingClientRect();
        glass.style.setProperty("--px", `${ev.clientX - r.left}px`);
        glass.style.setProperty("--py", `${ev.clientY - r.top}px`);
      }
      lit = glass;

      const tilt = target?.closest<HTMLElement>("[data-tilt]") ?? null;
      if (tilted && tilted !== tilt) {
        tilted.style.setProperty("--rx", "0deg");
        tilted.style.setProperty("--ry", "0deg");
      }
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const nx = (ev.clientX - r.left) / r.width - 0.5;
        const ny = (ev.clientY - r.top) / r.height - 0.5;
        tilt.style.setProperty("--ry", `${(nx * 2 * TILT_DEG).toFixed(2)}deg`);
        tilt.style.setProperty("--rx", `${(-ny * 2 * TILT_DEG).toFixed(2)}deg`);
      }
      tilted = tilt;
    };

    const onMove = (e: PointerEvent) => {
      ev = e;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onLeave = () => {
      ev = null;
      for (const el of [lit, tilted]) {
        el?.style.removeProperty("--px");
        el?.style.removeProperty("--py");
        el?.style.setProperty("--rx", "0deg");
        el?.style.setProperty("--ry", "0deg");
      }
      lit = tilted = null;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
