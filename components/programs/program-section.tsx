import { Briefcase, ChevronDown, Hammer, MapPin, Megaphone, MessagesSquare, UserRoundPlus } from "lucide-react";
import { CountUp } from "@/components/motion/count-up";
import { Reveal } from "@/components/motion/reveal";
import { DeadlineList } from "@/components/courses/deadline-list";
import { ExpandableText } from "./expandable-text";
import { hsl } from "@/lib/course";
import { fmtDayLabel } from "@/lib/time";
import { PROGRAMS, type ProgramId } from "@/lib/programs";
import type { CalEvent } from "@/lib/calendar";
import type { ProgramBlock } from "@/lib/programs-data";

const ICONS: Record<ProgramId, typeof Briefcase> = {
  "startup-leader": Briefcase,
  "sprint-labs": Hammer,
  "office-hours": MessagesSquare,
};

function EventRows({ events, hue, muted = false }: { events: CalEvent[]; hue: number; muted?: boolean }) {
  return (
    <ul className="flex flex-col gap-2">
      {events.map((ev) => (
        <li
          key={ev.id}
          className={`flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 transition-colors hover:bg-surface-2 ${muted ? "opacity-70" : ""}`}
        >
          <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: hsl(hue, 90, 66) }} />
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-sm font-medium leading-snug">{ev.title}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-faint">
              <span>
                {fmtDayLabel(ev.dayKey)} · <span className="whitespace-nowrap">{ev.range}</span>
              </span>
              {ev.room && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" /> {ev.room}
                </span>
              )}
            </div>
          </div>
          {ev.cancelled && (
            <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-danger">Cancelled</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">{children}</h3>;
}

function Collapsible({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group mt-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted transition-colors hover:text-text [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function ProgramSection({ block, delay = 0 }: { block: ProgramBlock; delay?: number }) {
  const p = PROGRAMS[block.id];
  const Icon = ICONS[block.id];
  const next = block.upcoming[0];

  return (
    <Reveal delay={delay}>
      <section id={block.id} className="glass relative scroll-mt-8 overflow-hidden p-5 sm:p-8">
        <div
          className="pointer-events-none absolute -right-24 -top-24 size-[380px] rounded-full opacity-50"
          style={{ background: `radial-gradient(circle, ${hsl(p.hue, 90, 60, 0.45)}, transparent 68%)` }}
        />

        <div className="relative mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-line bg-surface" style={{ color: hsl(p.hue, 90, 72) }}>
              <Icon className="size-6" />
            </span>
            <div>
              <h2 className="font-display text-4xl leading-none tracking-tight sm:text-5xl">{p.name}</h2>
              <p className="mt-2 text-sm text-muted">{p.sub}</p>
            </div>
          </div>
          <div className="flex gap-6 text-right">
            <Metric label="Upcoming" value={block.upcoming.length} />
            <Metric label="Held" value={block.past.length} />
            {block.id === "sprint-labs" && <Metric label="Build hrs · 14d" value={block.buildHours} decimals={1} />}
          </div>
        </div>

        {block.announcements.length > 0 && (
          <div className="relative mb-6 flex flex-col gap-3">
            {block.announcements.slice(0, 2).map((a) => (
              <div key={a.id} className="rounded-2xl border border-white/12 bg-white/[0.05] p-4">
                <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: hsl(p.hue, 90, 74) }}>
                  <Megaphone className="size-3.5" /> {a.pinned ? "Pinned · " : ""}Announcement
                  <span className="ml-auto font-normal normal-case tracking-normal text-faint">{a.posted}</span>
                </div>
                <div className="text-sm font-semibold">{a.title}</div>
                <div className="mt-1.5">
                  <ExpandableText text={a.body} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="relative grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <Label>{next ? "Upcoming" : "Upcoming (none scheduled)"}</Label>
            {block.upcoming.length ? (
              <EventRows events={block.upcoming.slice(0, 6)} hue={p.hue} />
            ) : (
              <p className="rounded-2xl border border-line bg-surface p-5 text-sm text-muted">Nothing on the calendar right now.</p>
            )}
            {block.upcoming.length > 6 && <p className="mt-2 text-xs text-faint">+{block.upcoming.length - 6} more on the calendar</p>}
          </div>

          <div className="flex flex-col gap-6">
            {block.milestones.length > 0 && (
              <div>
                <Label>Milestones</Label>
                <EventRows events={block.milestones.slice(0, 3)} hue={p.hue} />
              </div>
            )}
            {block.deadlines.length > 0 && (
              <div>
                <Label>Deadlines</Label>
                <DeadlineList items={block.deadlines.slice(0, 4)} />
              </div>
            )}
            {block.id === "office-hours" && (
              <div className="rounded-2xl border border-dashed border-line p-4">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                  <UserRoundPlus className="size-4 text-muted" /> Your 1:1s
                </div>
                <p className="text-xs leading-relaxed text-faint">
                  Slots you book on Nexus appear here once they land on your calendar. Logging your own notes and
                  follow-ups per 1:1 arrives with the database.
                </p>
              </div>
            )}
          </div>
        </div>

        {block.past.length > 0 && (
          <div className="relative">
            <Collapsible summary={`${block.past.length} held so far`}>
              <EventRows events={block.past.slice(0, 8)} hue={p.hue} muted />
            </Collapsible>
          </div>
        )}
      </section>
    </Reveal>
  );
}

function Metric({ label, value, decimals = 0 }: { label: string; value: number; decimals?: number }) {
  return (
    <div>
      <div className="font-display text-5xl leading-none tracking-tight">
        <CountUp value={value} decimals={decimals} />
      </div>
      <div className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted">{label}</div>
    </div>
  );
}
