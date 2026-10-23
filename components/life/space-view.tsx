"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CheckCircle2, FolderPlus, Kanban, List, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { addSpaceTask, archiveSpace, createProject, deleteProject, rateSpace, setProjectStatus, type SpaceActionState } from "@/app/(app)/life/space-actions";
import { hsl } from "@/lib/course";
import { progressOf, RATING_LABEL, ratingSummary, STAGES, stageOf, type Project, type Rating, type Space, type SpaceTask, type Stage } from "@/lib/life/spaces";
import { cn } from "@/lib/utils";
import { PriorityBars, DueChip, RatingDots, Spark, TaskRow } from "./bits";
import { TaskSheet } from "./task-sheet";
import { useTasks } from "./use-tasks";

type View = "list" | "board";
const FIELD = "min-h-10 w-full min-w-0 rounded-lg border border-line bg-black/20 px-2 py-1.5 text-base text-text outline-none sm:min-h-0 sm:w-auto sm:text-sm [color-scheme:dark]";

export function SpaceView({
  space,
  projects,
  allProjects,
  tasks,
  allSpaces,
  ratings,
  todayKey,
}: {
  space: Space;
  projects: Project[];
  allProjects: Project[];
  tasks: SpaceTask[];
  allSpaces: Space[];
  ratings: Rating[];
  todayKey: string;
}) {
  const t = useTasks(tasks);
  const [view, setView] = useState<View>("list");
  const [projectId, setProjectId] = useState<string | "all" | "none">("all");
  const [showDone, setShowDone] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [rated, setRated] = useState<number | null | undefined>(undefined);
  const hue = space.hue;

  useEffect(() => {
    const restore = () => {
      try {
        const v = localStorage.getItem("orbit:life-view");
        if (v === "list" || v === "board") setView(v);
      } catch {}
    };
    restore();
  }, []);
  const pickView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("orbit:life-view", v);
    } catch {}
  };

  const live = projects.filter((p) => p.status !== "done");
  const projectOf = new Map(projects.map((p) => [p.id, p]));
  const visible = t.list.filter((x) => (projectId === "all" ? true : projectId === "none" ? !x.project_id : x.project_id === projectId));
  const open = visible.filter((x) => !x.done_at);
  const progress = progressOf(visible);

  const rs = ratingSummary(ratings, space.id);
  const now = rated !== undefined ? rated : rs.now;

  return (
    <div className="flex flex-col gap-6">
      {/* Space header */}
      <section className="glass relative overflow-hidden p-5 sm:p-7" style={{ background: undefined }}>
        <div className="pointer-events-none absolute -right-10 -top-16 size-64 rounded-full blur-3xl" style={{ background: hsl(hue, 90, 60, 0.22) }} />
        <div className="relative flex flex-wrap items-start gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl text-3xl" style={{ background: hsl(hue, 80, 60, 0.16), boxShadow: `inset 0 0 0 1px ${hsl(hue, 90, 70, 0.3)}` }}>
            {space.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-4xl leading-none tracking-tight sm:text-5xl">{space.name}</h1>
            {space.intention && <p className="mt-2 max-w-xl text-sm text-muted">{space.intention}</p>}
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-line pt-4">
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">How it feels</div>
            <div className="flex items-center gap-3">
              <RatingDots
                value={now}
                hue={hue}
                onRate={(v) => {
                  setRated(v);
                  startTransition(async () => {
                    await rateSpace(space.id, v);
                    setRated(undefined);
                  });
                }}
              />
              <span className="text-sm text-muted">{now ? RATING_LABEL[now] : "Not rated yet"}</span>
              <Spark values={rs.series.slice(-14)} hue={hue} />
            </div>
          </div>
          <div className="flex gap-6 text-sm">
            <Stat n={open.length} label="open" />
            <Stat n={visible.filter((x) => stageOf(x) === "doing").length} label="doing" />
            <Stat n={visible.filter((x) => x.done_at).length} label="done" />
          </div>
          <div className="min-w-[8rem] flex-1">
            <div className="mb-1.5 flex justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${hsl(hue, 90, 62)}, ${hsl(hue + 40, 90, 70)})` }} initial={false} animate={{ width: `${progress}%` }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
            </div>
          </div>
        </div>
      </section>

      {/* Projects bar + view switch */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-4 flex min-w-0 basis-full gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-1 sm:basis-0 sm:flex-wrap sm:px-0 [scrollbar-width:none]">
          <Pill active={projectId === "all"} onClick={() => setProjectId("all")} hue={hue}>
            Everything
          </Pill>
          {live.map((p) => (
            <Pill key={p.id} active={projectId === p.id} onClick={() => setProjectId(p.id)} hue={hue}>
              {p.name}
              <span className="ml-1.5 text-faint">{t.list.filter((x) => x.project_id === p.id && !x.done_at).length || ""}</span>
            </Pill>
          ))}
          {t.list.some((x) => !x.project_id) && live.length > 0 && (
            <Pill active={projectId === "none"} onClick={() => setProjectId("none")} hue={hue}>
              No project
            </Pill>
          )}
          <button
            onClick={() => setNewProject((o) => !o)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
          >
            <FolderPlus className="size-3.5" />
            Project
          </button>
        </div>
        <div className="order-first ml-auto flex rounded-full border border-line bg-surface p-1 sm:order-last sm:ml-0" role="group" aria-label="View">
          {([["list", List, "List"], ["board", Kanban, "Board"]] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => pickView(id)}
              aria-pressed={view === id}
              className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors", view === id ? "bg-white/12 text-text ring-1 ring-white/15" : "text-muted hover:text-text")}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {newProject && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <ProjectForm spaceId={space.id} onDone={() => setNewProject(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {projectId !== "all" && projectId !== "none" && projectOf.get(projectId) && (
        <ProjectBanner project={projectOf.get(projectId) as Project} onGone={() => setProjectId("all")} />
      )}

      <AddTask space={space} projects={live} defaultProject={projectId !== "all" && projectId !== "none" ? projectId : ""} />

      {t.error && <p role="alert" className="text-sm text-danger">{t.error}</p>}

      {view === "list" ? (
        <ListView
          tasks={visible}
          todayKey={todayKey}
          projects={live}
          projectOf={projectOf}
          groupByProject={projectId === "all"}
          showDone={showDone}
          setShowDone={setShowDone}
          onOpen={t.openTask}
          onDone={t.setDone}
          space={space}
        />
      ) : (
        <Board tasks={visible} todayKey={todayKey} projectOf={projectOf} onOpen={t.openTask} onStage={t.setStage} hue={hue} />
      )}

      <div className="flex items-center justify-between pt-2 text-xs text-faint">
        <Link href="/life" className="transition-colors hover:text-text">
          All spaces
        </Link>
        <button
          onClick={() => {
            if (confirm(`Archive ${space.name}? Its tasks stay, but the space disappears from your home.`)) startTransition(async () => void (await archiveSpace(space.id)));
          }}
          className="transition-colors hover:text-danger"
        >
          Archive space
        </button>
      </div>

      <TaskSheet task={t.open} spaces={allSpaces} projects={allProjects} onClose={t.closeTask} onPatch={t.patch} onStage={t.setStage} onDelete={t.remove} />
    </div>
  );
}

const Stat = ({ n, label }: { n: number; label: string }) => (
  <div>
    <div className="font-display text-3xl leading-none tabular-nums">{n}</div>
    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">{label}</div>
  </div>
);

function Pill({ active, onClick, hue, children }: { active: boolean; onClick: () => void; hue: number; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors", active ? "text-text" : "border-line bg-surface text-muted hover:text-text")}
      style={active ? { background: hsl(hue, 80, 60, 0.16), borderColor: hsl(hue, 90, 70, 0.4) } : undefined}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- quick add

function AddTask({ space, projects, defaultProject }: { space: Space; projects: Project[]; defaultProject: string }) {
  const [state, add, adding] = useActionState<SpaceActionState, FormData>(addSpaceTask, {});
  const [more, setMore] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={add} className="glass flex flex-col gap-3 p-4">
      <input type="hidden" name="space" value={space.id} />
      <div className="flex items-center gap-3">
        <input
          name="title"
          required
          maxLength={500}
          autoComplete="off"
          placeholder={`Add to ${space.name}…`}
          onFocus={() => setMore(true)}
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint sm:text-[15px]"
        />
        <button
          type="submit"
          disabled={adding}
          aria-label="Add task"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105 disabled:opacity-60"
        >
          <Plus className="size-5" />
        </button>
      </div>
      {more && (
        <div className="grid grid-cols-2 items-end gap-2 border-t border-line pt-3 text-xs text-muted sm:flex sm:flex-wrap sm:items-center">
          <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            Due
            <input name="due" type="date" className={FIELD} />
          </label>
          <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            Time
            <input name="time" type="time" className={FIELD} />
          </label>
          <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            Project
            <select name="project" key={defaultProject} defaultValue={defaultProject} className={FIELD}>
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            Priority
            <select name="priority" defaultValue="0" className={FIELD}>
              {["None", "Low", "Medium", "High"].map((p, i) => (
                <option key={p} value={i}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          {state.error && <span role="alert" className="col-span-2 text-danger">{state.error}</span>}
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------- projects

function ProjectForm({ spaceId, onDone }: { spaceId: string; onDone: () => void }) {
  const [state, create, pending] = useActionState<SpaceActionState, FormData>(createProject, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={create} className="glass flex flex-col gap-3 p-4">
      <input type="hidden" name="space" value={spaceId} />
      <input name="name" required maxLength={120} autoFocus autoComplete="off" placeholder="Project name, e.g. Run a half marathon" className="bg-transparent text-base outline-none placeholder:text-faint sm:text-[15px]" />
      <input name="description" maxLength={1000} autoComplete="off" placeholder="What does done look like? (optional)" className="bg-transparent text-sm text-muted outline-none placeholder:text-faint" />
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3 text-xs text-muted">
        <label className="flex items-center gap-2">
          Target date
          <input name="due" type="date" className={FIELD} />
        </label>
        <button type="submit" disabled={pending} className="ml-auto rounded-full bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-60">
          Create project
        </button>
        {state.error && <span role="alert" className="w-full text-danger">{state.error}</span>}
      </div>
    </form>
  );
}

function ProjectBanner({ project, onGone }: { project: Project; onGone: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{project.name}</div>
        {project.description && <div className="text-xs text-muted">{project.description}</div>}
      </div>
      {project.due_on && <span className="text-xs text-muted">Target {project.due_on}</span>}
      <select
        value={project.status}
        onChange={(e) => startTransition(async () => void (await setProjectStatus(project.id, e.target.value as Project["status"])))}
        aria-label="Project status"
        className="rounded-lg border border-line bg-black/20 px-2 py-1.5 text-xs outline-none [color-scheme:dark]"
      >
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="done">Done</option>
      </select>
      <button
        onClick={() => {
          if (confirm("Delete this project? Its tasks stay in the space.")) {
            onGone();
            startTransition(async () => void (await deleteProject(project.id)));
          }
        }}
        aria-label="Delete project"
        className="rounded-full p-1.5 text-faint transition-colors hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- list

function ListView({
  tasks,
  todayKey,
  projects,
  projectOf,
  groupByProject,
  showDone,
  setShowDone,
  onOpen,
  onDone,
  space,
}: {
  tasks: SpaceTask[];
  todayKey: string;
  projects: Project[];
  projectOf: Map<string, Project>;
  groupByProject: boolean;
  showDone: boolean;
  setShowDone: (v: boolean) => void;
  onOpen: (t: SpaceTask) => void;
  onDone: (t: SpaceTask, done: boolean) => void;
  space: Space;
}) {
  const open = tasks.filter((t) => !t.done_at).sort(byUrgency);
  const done = tasks.filter((t) => t.done_at).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));

  if (!tasks.length) {
    return (
      <div className="glass p-10 text-center">
        <div className="font-display text-3xl">Nothing here yet.</div>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">Add the first thing above. Give it a reason in the details so it stays meaningful.</p>
      </div>
    );
  }

  const groups: { key: string; title: string | null; project?: Project; items: SpaceTask[] }[] = groupByProject
    ? [
        ...projects
          .map((p) => ({ key: p.id, title: p.name, project: p, items: open.filter((t) => t.project_id === p.id) }))
          .filter((g) => g.items.length),
        { key: "none", title: projects.length ? "No project" : null, project: undefined, items: open.filter((t) => !t.project_id || !projectOf.has(t.project_id) || projectOf.get(t.project_id)?.status === "done") },
      ].filter((g) => g.items.length)
    : [{ key: "all", title: null, project: undefined, items: open }];

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.key}>
          {g.title && (
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              <span className="size-2 rounded-full" style={{ background: hsl(space.hue, 90, 66) }} />
              {g.title}
              <span className="font-normal text-faint">{g.items.length}</span>
            </h2>
          )}
          <div className="flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {g.items.map((t) => (
                <motion.div key={t.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
                  <TaskRow task={t} todayKey={todayKey} onOpen={onOpen} onDone={onDone} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      ))}

      {done.length > 0 &&
        (showDone ? (
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Done <span className="font-normal text-faint">{done.length}</span>
            </h2>
            <div className="flex flex-col gap-1.5">
              {done.map((t) => (
                <TaskRow key={t.id} task={t} todayKey={todayKey} onOpen={onOpen} onDone={onDone} />
              ))}
            </div>
          </section>
        ) : (
          <button onClick={() => setShowDone(true)} className="flex items-center gap-2 self-start text-sm text-muted transition-colors hover:text-text">
            <CheckCircle2 className="size-4" />
            Show {done.length} done
          </button>
        ))}
    </div>
  );
}

const byUrgency = (a: SpaceTask, b: SpaceTask) =>
  b.priority - a.priority || (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999") || a.created_at.localeCompare(b.created_at);

// ---------------------------------------------------------------- board

function Board({
  tasks,
  todayKey,
  projectOf,
  onOpen,
  onStage,
  hue,
}: {
  tasks: SpaceTask[];
  todayKey: string;
  projectOf: Map<string, Project>;
  onOpen: (t: SpaceTask) => void;
  onStage: (t: SpaceTask, s: Stage) => void;
  hue: number;
}) {
  const [over, setOver] = useState<Stage | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 [scrollbar-width:none]">
      {STAGES.map((col) => {
        const items = tasks.filter((t) => stageOf(t) === col.id).sort(col.id === "done" ? (a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "") : byUrgency);
        return (
          <section
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(col.id);
            }}
            onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const task = tasks.find((t) => t.id === e.dataTransfer.getData("text/plain"));
              if (task && stageOf(task) !== col.id) onStage(task, col.id);
            }}
            className={cn("flex min-h-[200px] w-[82%] shrink-0 snap-center flex-col gap-2 rounded-2xl border bg-black/15 p-2.5 transition-colors sm:w-auto", over === col.id ? "border-white/30 bg-white/[0.05]" : "border-line")}
          >
            <h2 className="flex items-center gap-2 px-1.5 pb-1 pt-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              <span className="size-2 rounded-full" style={{ background: col.id === "done" ? "var(--lime)" : col.id === "doing" ? hsl(hue, 90, 66) : "var(--faint)" }} />
              {col.label}
              <span className="font-normal text-faint">{items.length}</span>
            </h2>
            {items.map((t) => {
              const next = STAGES[STAGES.findIndex((s) => s.id === col.id) + 1];
              return (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", t.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragging(t.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => onOpen(t)}
                  className={cn("group cursor-grab rounded-xl border border-line bg-surface p-3 transition-all hover:bg-surface-2 active:cursor-grabbing", dragging === t.id && "opacity-40")}
                >
                  <div className={cn("text-sm leading-snug", t.done_at && "text-faint line-through")}>{t.title}</div>
                  <div className="mt-2 flex items-center gap-2">
                    {t.project_id && projectOf.get(t.project_id) && <span className="truncate rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-muted">{projectOf.get(t.project_id)?.name}</span>}
                    <span className="ml-auto flex items-center gap-2">
                      <PriorityBars priority={t.done_at ? 0 : t.priority} />
                      <DueChip task={t} todayKey={todayKey} />
                      {next && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onStage(t, next.id);
                          }}
                          aria-label={`Move to ${next.label}`}
                          className="grid size-7 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-white/10 hover:text-text"
                        >
                          <ArrowRight className="size-3.5" />
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
            {!items.length && <p className="px-2 py-6 text-center text-xs text-faint">{col.id === "done" ? "Finished things land here." : "Drop a task here."}</p>}
          </section>
        );
      })}
    </div>
  );
}
