"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRef, type ReactNode } from "react";

const ease = [0.22, 1, 0.36, 1] as const;

/** Fade + rise + de-blur into place when scrolled into view. */
export function Reveal({
  children,
  delay = 0,
  y = 22,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  return (
    <motion.div
      ref={ref}
      onAnimationComplete={() => ref.current?.style.setProperty("filter", "none")} // see the note in app/(app)/template.tsx
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.8, delay, ease }}
    >
      {children}
    </motion.div>
  );
}

/** Word-by-word masked rise: the signature "motion graphics" headline reveal. */
export function SplitText({
  text,
  className,
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-bottom" aria-hidden>
          <motion.span
            className="inline-block"
            initial={reduce ? false : { y: "110%", rotate: 4 }}
            animate={{ y: 0, rotate: 0 }}
            transition={{ duration: 0.9, delay: delay + i * 0.07, ease }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
