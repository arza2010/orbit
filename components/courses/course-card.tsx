"use client";

import { motion } from "motion/react";
import { ArrowUpRight, CalendarClock, Flag } from "lucide-react";
import Link from "next/link";
import { Ring } from "@/components/ui/ring";
import { hsl } from "@/lib/course";
import { cn } from "@/lib/utils";
import type { CourseCard as Card } from "@/lib/courses";

const TONE = {
  overdue: "text-danger",
  soon: "text-amber",
  later: "text-muted",
  undated: "text-faint",
} as const;

export function CourseCard({ card, index, animated }: { card: Card; index: number; animated: boolean }) {
  const att = card.attendance;
  const attHue = !att ? 255 : att.pct >= 85 ? 150 : att.pct >= 75 ? 45 : 355;

  return (
    <motion.div
      layout
      initial={animated ? { opacity: 0, y: 18 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.04, 0.4), ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/courses/${card.id}`}
        className="glass group relative block h-full overflow-hidden p-5 transition-shadow hover:shadow-[0_28px_70px_-30px_var(--glow)]"
        style={{ ["--glow" as string]: hsl(card.hue, 90, 60, 0.7) }}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full opacity-40 transition-opacity duration-500 group-hover:opacity-80"
          style={{ background: `radial-gradient(circle, ${hsl(card.hue, 90, 60, 0.55)}, transparent 68%)` }}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-[1.75rem] leading-tight tracking-tight">{card.short}</h3>
            <p className="mt-1 truncate text-sm text-muted">{card.instructor ?? "Instructor TBC"}</p>
          </div>
          {att ? (
            <Ring value={att.pct} hue={attHue} size={62} stroke={6}>
              <span className="text-[13px] font-semibold tabular-nums">{Math.round(att.pct)}%</span>
            </Ring>
          ) : (
            <span className="whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-[10px] uppercase tracking-widest text-faint">
              No data yet
            </span>
          )}
        </div>

        <div className="relative mt-5 flex flex-col gap-2.5 text-sm">
          <div className="flex items-center gap-2.5 text-muted">
            <CalendarClock className="size-4 shrink-0 text-faint" />
            {card.nextSession ? (
              <span className="truncate">
                <span className="text-text">{card.nextSession.day}</span> · {card.nextSession.range}
              </span>
            ) : (
              <span className="text-faint">No upcoming session</span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <Flag className="size-4 shrink-0 text-faint" />
            {card.nextDeadline ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-muted">{card.nextDeadline.title}</span>
                <span className={cn("shrink-0 text-xs font-semibold", TONE[card.nextDeadline.tone])}>
                  {card.nextDeadline.label}
                </span>
              </span>
            ) : (
              <span className="text-faint">All caught up</span>
            )}
          </div>
        </div>

        <div className="relative mt-5 flex items-center justify-between border-t border-line pt-4 text-xs">
          <div className="flex items-center gap-3 text-muted">
            <span>
              <b className="text-text">{card.open}</b> open
            </span>
            {card.overdue > 0 && (
              <span className="text-danger">
                <b>{card.overdue}</b> overdue
              </span>
            )}
            <span>
              <b className="text-text">{card.submitted}</b>/{card.total} done
            </span>
          </div>
          <ArrowUpRight className="size-4 text-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-text" />
        </div>
      </Link>
    </motion.div>
  );
}
