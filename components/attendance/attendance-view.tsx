"use client";

import { motion, useReducedMotion } from "motion/react";
import { CalendarClock, ChevronDown, ShieldCheck, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import {
  advice,
  bySeverity,
  MIN_PCT,
  needsAttention,
  STANDING_LABEL,
  termsOf,
  termSummary,
  type CourseAttendance,
  type Standing,
} from "@/lib/attendance";
import { hsl } from "@/lib/course";
import { dayKey, fmtDayLabel, fmtTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const TONE: Record<Standing, { text: string; chip: string; bar: string }> = {
  safe: { text: "text-lime", chip: "bg-lime/12 text-lime", bar: "var(--lime)" },
  passed: { text: "text-lime", chip: "bg-lime/12 text-lime", bar: "var(--lime)" },
  tight: { text: "text-amber", chip: "bg-amber/12 text-amber", bar: "var(--amber)" },
  recover: { text: "text-amber", chip: "bg-amber/15 text-amber", bar: "var(--amber)" },
  lost: { text: "text-danger", chip: "bg-danger/12 text-danger", bar: "var(--danger)" },
  short: { text: "text-danger", chip: "bg-danger/12 text-danger", bar: "var(--danger)" },
};

const EASE = [0.22, 1, 0.36, 1] as const;

function Ring({ pct, color }: { pct: number; color: string }) {
  const reduce = useReducedMotion();
  const R = 74;
  const C = 2 * Math.PI * R;
  const tickAngle = (MIN_PCT / 100) * 2 * Math.PI - Math.PI / 2;
  return (
    <div className="relative grid size-[184px] shrink-0 place-items-center">
      <svg viewBox="0 0 180 180" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="90" cy="90" r={R} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth="11" />
        <motion.circle
          cx="90"
          cy="90"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={reduce ? false : { strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - Math.min(100, pct) / 100) }}
          transition={{ duration: 1.4, ease: EASE }}
        />
      </svg>
      {/* The 75% line, drawn outside the ring so it stays readable over the arc. */}
      <svg viewBox="0 0 180 180" className="absolute inset-0" aria-hidden>
        <line
          x1={90 + (R - 11) * Math.cos(tickAngle)}
          y1={90 + (R - 11) * Math.sin(tickAngle)}
          x2={90 + (R + 11) * Math.cos(tickAngle)}
          y2={90 + (R + 11) * Math.sin(tickAngle)}
          stroke="white"
          strokeOpacity="0.85"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <div className="text-center">
        <div className="text-[2.6rem] font-semibold leading-none tracking-tight tabular-nums">
          {pct}
          <span className="text-xl text-muted">%</span>
        </div>
        <div className="mt-1.5 text-[11px] uppercase tracking-[0.18em] text-faint">attended</div>
      </div>
    </div>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative mt-3 h-2 rounded-full bg-white/8" role="img" aria-label={`${pct}% attended, minimum ${MIN_PCT}%`}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${Math.min(100, pct)}%` }}
        transition={{ duration: 1, ease: EASE }}
      />
      <span className="absolute -top-1 h-4 w-0.5 rounded bg-white/80" style={{ left: `${MIN_PCT}%` }} title={`${MIN_PCT}% minimum`} />
    </div>
  );
}

function Strip({ dots }: { dots: NonNullable<CourseAttendance["dots"]> }) {
  return (
    <div className="mt-4 flex flex-wrap gap-1" aria-label="Every class so far, oldest first">
      {dots.map((d, i) => (
        <span
          key={i}
          title={`${d.label}: ${d.present ? "attended" : "missed"}`}
          className={cn("size-2.5 rounded-[3px]", d.present ? "bg-lime/70" : "bg-danger")}
        />
      ))}
    </div>
  );
}

function CourseCard({ c }: { c: CourseAttendance }) {
  const [open, setOpen] = useState(false);
  const a = c.analysis;
  const tone = TONE[a.standing];
  const nextKey = c.next ? dayKey(new Date(c.next.startMs)) : null;

  return (
    <li className="glass p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: hsl(c.hue, 90, 66) }} />
            <h3 className="truncate text-[15px] font-semibold">{c.short}</h3>
          </div>
          <p className="mt-1 text-xs text-faint">
            {a.attended} of {a.total} classes{a.remaining > 0 ? ` · ${a.remaining} left` : ""}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", tone.chip)}>{STANDING_LABEL[a.standing]}</span>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className={cn("text-4xl font-semibold tabular-nums tracking-tight", tone.text)}>{a.pct}%</span>
        {a.remaining > 0 && a.bestFinal !== a.pct && <span className="text-xs text-faint">best possible {a.bestFinal}%</span>}
      </div>
      <Bar pct={a.pct} color={tone.bar} />

      <p className="mt-4 text-sm leading-relaxed text-muted">{advice(a)}</p>

      {a.remaining > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
            <div className="text-faint">If you skip the next one</div>
            <div className={cn("mt-0.5 text-base font-semibold tabular-nums", a.ifMissNext < MIN_PCT ? "text-danger" : "text-text")}>{a.ifMissNext}%</div>
          </div>
          <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
            <div className="text-faint">If you go</div>
            <div className="mt-0.5 text-base font-semibold tabular-nums text-text">{a.ifAttendNext}%</div>
          </div>
        </div>
      )}

      {c.next && nextKey && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-faint">
          <CalendarClock className="size-3.5" />
          Next: {fmtDayLabel(nextKey)}, {fmtTime(new Date(c.next.startMs))}
        </p>
      )}

      {c.dots && c.dots.length > 0 && <Strip dots={c.dots} />}

      {c.missed.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full items-center justify-between text-xs font-medium text-muted transition-colors hover:text-text"
          >
            Missed {c.missed.length} {c.missed.length === 1 ? "class" : "classes"}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {c.missed.map((m) => (
                <li key={m.startMs} className="flex items-baseline justify-between gap-3 text-muted">
                  <span className="min-w-0 truncate">{m.session}</span>
                  <span className="shrink-0 text-xs text-faint">
                    {fmtDayLabel(dayKey(new Date(m.startMs)))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export function AttendanceView({ items }: { items: CourseAttendance[] }) {
  const terms = useMemo(() => termsOf(items), [items]);
  const [term, setTerm] = useState(terms[0] ?? "");

  const list = useMemo(
    () => items.filter((c) => c.term === term).sort((a, b) => bySeverity(a.analysis.standing, b.analysis.standing) || a.short.localeCompare(b.short)),
    [items, term],
  );
  const sum = termSummary(list);
  const watch = list.filter((c) => needsAttention(c.analysis.standing));
  const heroColor = sum.pct < MIN_PCT ? "var(--danger)" : sum.trouble > 0 ? "var(--amber)" : "var(--lime)";

  if (items.length === 0) {
    return (
      <div className="glass mx-auto mt-16 max-w-md p-8 text-center">
        <ShieldCheck className="mx-auto mb-4 size-8 text-muted" />
        <h1 className="font-display text-3xl">Nothing to track yet.</h1>
        <p className="mt-2 text-sm text-muted">Attendance shows up here once Nexus has recorded your first class.</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-8">
        <div className="mb-3 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-muted">
          <span className="h-px w-8 bg-gradient-to-r from-violet to-cyan" />
          Attendance
          <span className="normal-case tracking-normal text-faint">· {MIN_PCT}% needed in every class</span>
        </div>
        <h1 className="font-display text-[clamp(2.6rem,7vw,5rem)] leading-[0.95] tracking-tight">
          Stay above <span className="text-gradient italic">the line.</span>
        </h1>
      </header>

      {terms.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Term">
          {terms.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={term === t}
              onClick={() => setTerm(t)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                term === t ? "border-white/20 bg-white/12 text-text" : "border-line bg-surface text-muted hover:text-text",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <section className="glass mb-6 flex flex-col items-center gap-6 p-6 sm:flex-row sm:gap-10 sm:p-8">
        <Ring pct={sum.pct} color={heroColor} />
        <div className="grid w-full gap-4">
          <p className="text-base text-muted">
            <b className="text-text">
              {sum.attended} of {sum.total}
            </b>{" "}
            classes attended across {sum.classes} {sum.classes === 1 ? "class" : "classes"} in {term}.
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat n={sum.safe} label="On track" tone="text-lime" />
            <Stat n={sum.tight} label="Tight" tone="text-amber" />
            <Stat n={sum.trouble} label="Below the line" tone="text-danger" />
          </div>
          <p className="text-xs text-faint">
            The white mark is the {MIN_PCT}% minimum. Each class is judged on its own, so one strong class can&apos;t cover for a weak one.
          </p>
        </div>
      </section>

      {watch.length > 0 && (
        <section className="mb-6 rounded-2xl border border-amber/25 bg-amber/8 p-4 sm:p-5" aria-label="Needs attention">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber">
            <TriangleAlert className="size-4" /> Needs attention
          </h2>
          <ul className="flex flex-col gap-1.5 text-sm text-muted">
            {watch.map((c) => (
              <li key={c.course}>
                <b className="text-text">{c.short}</b> · {c.analysis.pct}% · {advice(c.analysis)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="grid gap-4 md:grid-cols-2">
        {list.map((c) => (
          <CourseCard key={c.course} c={c} />
        ))}
      </ul>
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-2 py-3">
      <div className={cn("text-2xl font-semibold tabular-nums", tone)}>{n}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-faint">{label}</div>
    </div>
  );
}
