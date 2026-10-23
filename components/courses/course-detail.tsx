import { ArrowLeft, ChevronDown, ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/motion/reveal";
import { CountUp } from "@/components/motion/count-up";
import { Ring } from "@/components/ui/ring";
import { hsl } from "@/lib/course";
import { dayLongLabel, type CalEvent } from "@/lib/calendar";
import { fmtDayLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { CourseDetail } from "@/lib/courses";
import { DeadlineList } from "./deadline-list";

function Section({ title, aside, children, delay = 0 }: { title: string; aside?: string; children: React.ReactNode; delay?: number }) {
  return (
    <Reveal delay={delay}>
      <section className="glass p-5 sm:p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">{title}</h2>
          {aside && <span className="text-xs text-faint">{aside}</span>}
        </div>
        {children}
      </section>
    </Reveal>
  );
}

function SessionRow({ ev, muted = false }: { ev: CalEvent; muted?: boolean }) {
  return (
    <li className={cn("flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3", muted && "opacity-70")}>
      <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: hsl(ev.hue, 90, 66) }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{fmtDayLabel(ev.dayKey)}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-faint">
          <span className="whitespace-nowrap">{ev.range}</span>
          {ev.room && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" /> {ev.room}
            </span>
          )}
        </div>
      </div>
      {ev.attendance && <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-widest text-faint">Attendance</span>}
    </li>
  );
}

export function CourseDetailView({ d }: { d: CourseDetail }) {
  const { card } = d;
  const att = card.attendance;
  const attHue = !att ? 255 : att.pct >= 85 ? 150 : att.pct >= 75 ? 45 : 355;

  return (
    <div>
      <Link href="/courses" className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-text">
        <ArrowLeft className="size-4" /> Courses
      </Link>

      <header className="relative mb-8">
        <div
          className="pointer-events-none absolute -left-20 -top-24 size-[420px] rounded-full opacity-50"
          style={{ background: `radial-gradient(circle, ${hsl(card.hue, 90, 60, 0.45)}, transparent 68%)` }}
        />
        <div className="relative">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: hsl(card.hue, 90, 72) }}>
            {card.term}
          </div>
          <h1 className="font-display text-[clamp(2.8rem,8vw,5.6rem)] leading-[0.95] tracking-tight">{card.short}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
            {card.instructor && <span>{card.instructor}</span>}
            {card.instructorLinkedIn && (
              <a
                href={card.instructorLinkedIn}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-text"
              >
                LinkedIn <ExternalLink className="size-3" />
              </a>
            )}
            {d.startDate && d.endDate && (
              <span className="text-faint">
                {fmtDayLabel(d.startDate)} → {fmtDayLabel(d.endDate)}
              </span>
            )}
          </div>
          {d.description && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">{d.description}</p>}
        </div>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Reveal delay={0.05}>
          <div className="glass flex items-center gap-4 p-5 lg:flex-col lg:items-start lg:gap-3">
            {att ? (
              <Ring value={att.pct} hue={attHue} size={72} stroke={7}>
                <span className="text-sm font-semibold tabular-nums">{Math.round(att.pct)}%</span>
              </Ring>
            ) : (
              <div className="grid size-[72px] place-items-center rounded-full border border-line text-faint">—</div>
            )}
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Attendance</div>
              <div className="mt-1 text-sm text-faint">{att ? `${att.attended} of ${att.total} classes` : "Not tracked yet"}</div>
            </div>
          </div>
        </Reveal>
        <Stat label="Open" value={card.open} sub={card.overdue ? `${card.overdue} overdue` : "deadlines"} tint="rgb(255 180 84 / 0.4)" delay={0.1} />
        <Stat label="Submitted" value={card.submitted} sub={`of ${card.total}`} tint="rgb(184 255 106 / 0.3)" delay={0.15} />
        <Stat
          label="Avg score"
          value={d.avgPct ?? 0}
          suffix={d.avgPct !== null ? "%" : undefined}
          empty={d.avgPct === null ? (card.latest ? `${card.latest.marks}` : "—") : undefined}
          sub={d.avgPct === null ? (card.latest ? "latest, no max set" : "no marks yet") : `${d.marks.length} graded`}
          tint="rgb(139 108 255 / 0.4)"
          delay={0.2}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="Deadlines" aside={`${d.open.length} open`} delay={0.05}>
            <DeadlineList items={d.open} empty="All caught up. Nothing open for this course." />
            {d.submitted.length > 0 && (
              <details className="group mt-4">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted transition-colors hover:text-text [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                  {d.submitted.length} submitted
                </summary>
                <div className="mt-3">
                  <DeadlineList items={d.submitted} done />
                </div>
              </details>
            )}
          </Section>

          <Section title="Marks and feedback" aside={d.marks.length ? `${d.marks.length} released` : undefined} delay={0.1}>
            {d.marks.length === 0 ? (
              <p className="py-5 text-center text-sm text-muted">No marks released yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {d.marks.map((m) => {
                  const pct = m.marks !== null && m.max ? (m.marks / m.max) * 100 : null;
                  return (
                    <li key={m.id} className="rounded-2xl border border-line bg-surface">
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3 [&::-webkit-details-marker]:hidden">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{m.assignment}</div>
                            {m.released && <div className="mt-0.5 text-xs text-faint">Released {m.released}</div>}
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-3 py-1 text-xs font-semibold tabular-nums",
                              pct === null ? "bg-white/8 text-muted" : pct >= 70 ? "bg-lime/15 text-lime" : pct >= 45 ? "bg-amber/15 text-amber" : "bg-danger/15 text-danger",
                            )}
                          >
                            {m.marks ?? "—"}
                            {m.max ? ` / ${m.max}` : ""}
                          </span>
                          {m.feedback && <ChevronDown className="size-4 shrink-0 text-faint transition-transform group-open:rotate-180" />}
                        </summary>
                        {m.feedback && (
                          <p className="whitespace-pre-wrap border-t border-line px-3.5 py-3 text-sm leading-relaxed text-muted">{m.feedback}</p>
                        )}
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Section title="Upcoming sessions" delay={0.1}>
            {d.upcoming.length ? (
              <ul className="flex flex-col gap-2">
                {d.upcoming.map((ev) => (
                  <SessionRow key={ev.id} ev={ev} />
                ))}
              </ul>
            ) : (
              <p className="py-5 text-center text-sm text-muted">{d.endDate ? "No more sessions scheduled." : "Nothing scheduled."}</p>
            )}
          </Section>

          {d.recent.length > 0 && (
            <Section title="Recent sessions" delay={0.15}>
              <ul className="flex flex-col gap-2">
                {d.recent.map((ev) => (
                  <SessionRow key={ev.id} ev={ev} muted />
                ))}
              </ul>
              <p className="mt-3 text-xs text-faint">Last held {dayLongLabel(d.recent[0].dayKey)}</p>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  suffix,
  empty,
  tint,
  delay,
}: {
  label: string;
  value: number;
  sub: string;
  suffix?: string;
  empty?: string;
  tint: string;
  delay: number;
}) {
  return (
    <Reveal delay={delay}>
      <div className="glass relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -bottom-10 -right-10 size-32 rounded-full opacity-50" style={{ background: `radial-gradient(circle, ${tint}, transparent 70%)` }} />
        <div className="relative text-xs font-medium uppercase tracking-[0.18em] text-muted">{label}</div>
        <div className="relative mt-2 font-display text-5xl leading-none tracking-tight">
          {empty ?? <CountUp value={value} decimals={suffix ? 0 : 0} />}
          {suffix && <span className="ml-0.5 text-2xl text-muted">{suffix}</span>}
        </div>
        <div className="relative mt-2 text-xs text-faint">{sub}</div>
      </div>
    </Reveal>
  );
}
