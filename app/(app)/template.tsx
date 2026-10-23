"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

// A template (unlike a layout) re-mounts on every navigation, so each screen eases in.
//
// Opacity and a small rise only: no blur. Any `filter` on this wrapper, even blur(0px) once the animation
// has finished, makes it the containing block for position:fixed descendants, which pushes every sheet and
// overlay on the page (the calendar's event sheet, for one) out of place. Transforms are safe because
// motion removes them when the animation ends.
export default function Template({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
