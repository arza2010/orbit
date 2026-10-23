"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Briefcase, Hammer, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { hsl } from "@/lib/course";
import { PROGRAMS, type ProgramId } from "@/lib/programs";
import { cn } from "@/lib/utils";
import type { CourseCard as Card } from "@/lib/courses";
import { CourseCard } from "./course-card";

const ICONS: Record<ProgramId, typeof Briefcase> = {
  "startup-leader": Briefcase,
  "sprint-labs": Hammer,
  "office-hours": MessagesSquare,
};

export type ProgramTeaser = { id: ProgramId; upcoming: number; next: string | null };

export function CoursesView({
  cards,
  terms,
  teasers,
}: {
  cards: Card[];
  terms: string[];
  teasers: ProgramTeaser[];
}) {
  const [term, setTerm] = useState(terms[0] ?? "");
  // First paint is static; cards animate in only after the term is switched.
  const [animated, setAnimated] = useState(false);

  const visible = useMemo(
    () =>
      cards
        .filter((c) => c.term === term)
        .sort((a, b) => (a.nextSession ? 0 : 1) - (b.nextSession ? 0 : 1) || a.short.localeCompare(b.short)),
    [cards, term],
  );

  const open = visible.reduce((n, c) => n + c.open, 0);
  const overdue = visible.reduce((n, c) => n + c.overdue, 0);

  return (
    <div>
      <header className="mb-8">
        <div className="mb-3 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-muted">
          <span className="h-px w-8 bg-gradient-to-r from-violet to-cyan" />
          Courses
        </div>
        <h1 className="font-display text-[clamp(2.6rem,7vw,5rem)] leading-[0.95] tracking-tight">
          <span className="text-gradient italic">Your semester,</span>
          <br />
          course by course.
        </h1>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex rounded-full border border-line bg-surface p-1" role="tablist" aria-label="Term">
            {terms.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={t === term}
                onClick={() => {
                  setAnimated(true);
                  setTerm(t);
                }}
                className={cn(
                  "relative rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  t === term ? "text-text" : "text-muted hover:text-text",
                )}
              >
                {t === term && (
                  <motion.span
                    layoutId="term-pill"
                    className="absolute inset-0 rounded-full bg-white/12 ring-1 ring-white/15"
                    transition={{ type: "spring", stiffness: 460, damping: 36 }}
                  />
                )}
                <span className="relative">{t}</span>
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">
            {visible.length} courses · <b className="text-text">{open}</b> open deadlines
            {overdue > 0 && <span className="text-danger"> · {overdue} overdue</span>}
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {visible.map((c, i) => (
            <CourseCard key={c.id} card={c} index={i} animated={animated} />
          ))}
        </AnimatePresence>
      </div>

      <section className="mt-14">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-3xl tracking-tight">Beyond the classroom</h2>
          <Link href="/programs" className="text-sm text-muted transition-colors hover:text-text">
            All programs →
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {teasers.map((t) => {
            const p = PROGRAMS[t.id];
            const Icon = ICONS[t.id];
            return (
              <Link
                key={t.id}
                href={`/programs#${t.id}`}
                className="glass group relative overflow-hidden p-5 transition-transform hover:-translate-y-1"
              >
                <div
                  className="pointer-events-none absolute -right-12 -top-12 size-44 rounded-full opacity-50"
                  style={{ background: `radial-gradient(circle, ${hsl(p.hue, 90, 60, 0.5)}, transparent 68%)` }}
                />
                <div className="relative flex items-start justify-between">
                  <span className="grid size-10 place-items-center rounded-xl border border-line bg-surface" style={{ color: hsl(p.hue, 90, 72) }}>
                    <Icon className="size-5" />
                  </span>
                  <ArrowUpRight className="size-4 text-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-text" />
                </div>
                <h3 className="relative mt-4 font-display text-2xl tracking-tight">{p.name}</h3>
                <p className="relative mt-1 text-sm text-muted">{p.sub}</p>
                <p className="relative mt-4 text-xs text-faint">
                  <b className="text-text">{t.upcoming}</b> upcoming{t.next ? ` · next ${t.next}` : ""}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
