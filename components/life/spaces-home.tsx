"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createSpace, rateSpace, saveCheckin, seedSpaces, type SpaceActionState } from "@/app/(app)/life/space-actions";
import { hsl } from "@/lib/course";
import { ENERGY, MOODS, ratingSummary, SPACE_HUES, type Checkin, type Project, type Rating, type Space, type SpaceTask } from "@/lib/life/spaces";
import { dueDateValue } from "@/lib/life/tasks";
import { cn } from "@/lib/utils";
import { RatingDots, Spark, TaskRow } from "./bits";
import { TaskSheet } from "./task-sheet";
import { useTasks } from "./use-tasks";

export function SpacesHome({
  spaces,
  projects,
  tasks,
  ratings,
  checkin,
  todayKey,
}: {
  spaces: Space[];
  projects: Project[];
  tasks: SpaceTask[];
  ratings: Rating[];
  checkin: Checkin | null;
  todayKey: string;
}) {
  const t = useTasks(tasks);
  const spaceOf = new Map(spaces.map((s) => [s.id, s]));
  const projectOf = new Map(projects.map((p) => [p.id, p]));

  // What needs you now: overdue and due today first, then the highest priority open work.
  const upNext = t.list
    .filter((x) => !x.done_at)
    .sort((a, b) => {
      const da = dueDateValue(a) || "9999";
      const db = dueDateValue(b) || "9999";
      const hot = (d: string) => (d <= todayKey ? 0 : 1);
      return hot(da) - hot(db) || b.priority - a.priority || da.localeCompare(db) || a.created_at.localeCompare(b.created_at);
    })
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      <CheckinCard checkin={checkin} />

      {upNext.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Up next
            <Link href="/life?tab=planner" className="flex items-center gap-1 font-medium normal-case tracking-normal text-muted transition-colors hover:text-text">
              Planner <ArrowUpRight className="size-3.5" />
            </Link>
          </h2>
          <div className="flex flex-col gap-1.5">
            {upNext.map((x) => (
              <TaskRow key={x.id} task={x} todayKey={todayKey} space={x.space_id ? spaceOf.get(x.space_id) : undefined} project={x.project_id ? projectOf.get(x.project_id) : undefined} onOpen={t.openTask} onDone={t.setDone} />
            ))}
          </div>
          {t.error && <p role="alert" className="mt-2 text-sm text-danger">{t.error}</p>}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Your spaces</h2>
        {spaces.length === 0 ? <FirstRun /> : <SpaceGrid spaces={spaces} tasks={t.list} projects={projects} ratings={ratings} />}
      </section>

      <TaskSheet task={t.open} spaces={spaces} projects={projects} onClose={t.closeTask} onPatch={t.patch} onStage={t.setStage} onDelete={t.remove} />
    </div>
  );
}

// ---------------------------------------------------------------- check-in

function CheckinCard({ checkin }: { checkin: Checkin | null }) {
  const [mood, setMood] = useState(checkin?.mood ?? null);
  const [energy, setEnergy] = useState(checkin?.energy ?? null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const note = useRef<HTMLInputElement>(null);

  const save = (patch: { mood?: number | null; energy?: number | null; note?: string | null }) =>
    start(async () => {
      setError(null);
      const r = await saveCheckin(patch);
      if (r.error) setError(r.error);
      else setSaved(true);
    });

  // Chosen after mount so the server (UTC) and your phone never disagree about the hour.
  const [greeting, setGreeting] = useState("Hello");
  useEffect(() => {
    const pick = () => {
      const hour = new Date().getHours();
      setGreeting(hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening");
    };
    pick();
  }, []);

  return (
    <section className="glass p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-3xl leading-none tracking-tight">{greeting}. How are you?</h2>
        {saved && <span className="text-xs text-lime">Saved</span>}
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Mood</div>
          <div className="flex gap-1.5">
            {MOODS.map((m) => (
              <button
                key={m.value}
                onClick={() => {
                  const v = mood === m.value ? null : m.value;
                  setMood(v);
                  save({ mood: v });
                }}
                aria-pressed={mood === m.value}
                aria-label={m.label}
                title={m.label}
                className={cn("grid size-11 flex-1 place-items-center rounded-xl border text-2xl transition-all sm:size-12", mood === m.value ? "scale-105 border-white/40 bg-white/12" : "border-line bg-black/15 grayscale hover:grayscale-0")}
              >
                {m.emoji}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
            Energy {energy && <span className="ml-1 normal-case tracking-normal text-muted">{ENERGY[energy - 1].label}</span>}
          </div>
          <div className="flex h-11 gap-1.5 sm:h-12">
            {ENERGY.map((e) => (
              <button
                key={e.value}
                onClick={() => {
                  const v = energy === e.value ? null : e.value;
                  setEnergy(v);
                  save({ energy: v });
                }}
                aria-pressed={energy === e.value}
                aria-label={e.label}
                title={e.label}
                className="flex-1 rounded-xl border border-line transition-all"
                style={{
                  background: energy !== null && e.value <= energy ? `linear-gradient(180deg, ${hsl(45 + e.value * 22, 95, 62)}, ${hsl(45 + e.value * 22, 90, 50)})` : "rgb(0 0 0 / 0.15)",
                  borderColor: energy !== null && e.value <= energy ? "transparent" : undefined,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <input
        ref={note}
        defaultValue={checkin?.note ?? ""}
        maxLength={500}
        placeholder="One line about today, for future you…"
        onBlur={(e) => e.target.value.trim() !== (checkin?.note ?? "") && save({ note: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && note.current?.blur()}
        className="mt-5 w-full rounded-xl border border-line bg-black/20 px-4 py-3 text-base outline-none transition-colors placeholder:text-faint focus:border-white/30 sm:text-sm"
      />
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}

// ---------------------------------------------------------------- spaces

function SpaceGrid({ spaces, tasks, projects, ratings }: { spaces: Space[]; tasks: SpaceTask[]; projects: Project[]; ratings: Rating[] }) {
  const [adding, setAdding] = useState(false);
  const [local, setLocal] = useState<Record<string, number | null>>({});

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {spaces.map((s, i) => {
        const mine = tasks.filter((t) => t.space_id === s.id);
        const open = mine.filter((t) => !t.done_at).length;
        const doing = mine.filter((t) => !t.done_at && t.stage === "doing").length;
        const pct = mine.length ? Math.round((mine.filter((t) => t.done_at).length / mine.length) * 100) : 0;
        const projectCount = projects.filter((p) => p.space_id === s.id && p.status === "active").length;
        const rs = ratingSummary(ratings, s.id);
        const now = s.id in local ? local[s.id] : rs.now;
        return (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.04 * i, ease: [0.22, 1, 0.36, 1] }}
            className="glass group relative flex flex-col gap-4 overflow-hidden p-5 transition-transform hover:-translate-y-0.5"
          >
            <div className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full opacity-70 blur-3xl transition-opacity group-hover:opacity-100" style={{ background: hsl(s.hue, 90, 60, 0.2) }} />
            <Link href={`/life/${s.id}`} className="absolute inset-0 z-0 rounded-[24px]" aria-label={`Open ${s.name}`} />
            <div className="pointer-events-none relative z-10 flex items-start gap-3.5">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: hsl(s.hue, 80, 60, 0.16), boxShadow: `inset 0 0 0 1px ${hsl(s.hue, 90, 70, 0.3)}` }}>
                {s.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-2xl leading-tight">{s.name}</div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted">{s.intention ?? "No intention set."}</p>
              </div>
              <ArrowUpRight className="size-4 shrink-0 text-faint transition-colors group-hover:text-text" />
            </div>

            <div className="pointer-events-none relative z-10 flex items-center justify-between gap-2">
              <div className="pointer-events-auto">
              <RatingDots
                value={now ?? null}
                hue={s.hue}
                size="sm"
                onRate={(v) => {
                  setLocal((l) => ({ ...l, [s.id]: v }));
                  startTransition(async () => {
                    await rateSpace(s.id, v);
                    setLocal((l) => {
                      const next = { ...l };
                      delete next[s.id];
                      return next;
                    });
                  });
                }}
              />
              </div>
              <span className="flex items-center gap-2 text-[11px] text-faint">
                {rs.delta !== null && rs.delta !== 0 && <span className={rs.delta > 0 ? "text-lime" : "text-pink"}>{rs.delta > 0 ? "▲" : "▼"} {Math.abs(rs.delta)}</span>}
                <Spark values={rs.series.slice(-10)} hue={s.hue} w={48} h={16} />
              </span>
            </div>

            <div className="pointer-events-none relative z-10">
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: hsl(s.hue, 90, 64) }} />
              </div>
              <div className="mt-2 flex gap-3 text-[11px] text-muted">
                <span>{open} open</span>
                {doing > 0 && <span>{doing} doing</span>}
                {projectCount > 0 && <span>{projectCount} {projectCount === 1 ? "project" : "projects"}</span>}
              </div>
            </div>
          </motion.div>
        );
      })}

      <button
        onClick={() => setAdding((o) => !o)}
        className="grid min-h-[170px] place-items-center rounded-[24px] border border-dashed border-line text-muted transition-colors hover:border-white/30 hover:text-text"
      >
        <span className="flex flex-col items-center gap-2 text-sm">
          <Plus className="size-6" />
          New space
        </span>
      </button>

      <AnimatePresence initial={false}>
        {adding && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="sm:col-span-2 lg:col-span-3">
            <NewSpaceForm onDone={() => setAdding(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NewSpaceForm({ onDone }: { onDone: () => void }) {
  const [state, create, pending] = useActionState<SpaceActionState, FormData>(createSpace, {});
  const [hue, setHue] = useState(SPACE_HUES[0]);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={create} className="glass flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <input name="emoji" defaultValue="✨" maxLength={8} aria-label="Emoji" className="size-12 shrink-0 rounded-xl border border-line bg-black/20 text-center text-2xl outline-none" />
        <input name="name" required maxLength={60} autoFocus autoComplete="off" placeholder="Name this part of your life" className="min-w-0 flex-1 bg-transparent font-display text-2xl outline-none placeholder:text-faint" />
      </div>
      <input name="intention" maxLength={200} autoComplete="off" placeholder="What do you want from it? One line." className="bg-transparent text-base text-muted outline-none placeholder:text-faint sm:text-sm" />
      <input type="hidden" name="hue" value={hue} />
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <div className="flex gap-2">
          {SPACE_HUES.map((h) => (
            <button key={h} type="button" onClick={() => setHue(h)} aria-label={`Colour ${h}`} aria-pressed={hue === h} className={cn("size-6 rounded-full transition-transform", hue === h && "scale-125 ring-2 ring-white/70")} style={{ background: hsl(h, 90, 62) }} />
          ))}
        </div>
        <button type="submit" disabled={pending} className="ml-auto rounded-full bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-60">
          Create space
        </button>
        {state.error && <span role="alert" className="w-full text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}

function FirstRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="glass p-8 text-center sm:p-12">
      <Sparkles className="mx-auto mb-4 size-8 text-violet" />
      <h3 className="font-display text-4xl">Start with the shape of your life.</h3>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted">
        Spaces are the areas you care about: health, learning, the startup, people. Each holds projects and tasks, and you rate how it feels so you can see what needs attention.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await seedSpaces();
              if (r.error) setError(r.error);
            })
          }
          className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
        >
          Add six starter spaces
        </button>
        <span className="text-xs text-faint">You can rename or archive any of them.</span>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
