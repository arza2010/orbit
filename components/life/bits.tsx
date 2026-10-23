"use client";

import { Check, ChevronRight } from "lucide-react";
import { burstFrom } from "@/lib/fx/confetti";
import { hsl } from "@/lib/course";
import { RATING_LABEL, stageOf, type Project, type Space, type SpaceTask } from "@/lib/life/spaces";
import { bucketOf, dueLabel, PRIORITY_LABEL, type TaskBucket } from "@/lib/life/tasks";
import { cn } from "@/lib/utils";

export const PRIORITY_COLOR = ["", "bg-cyan", "bg-amber", "bg-pink"];

const DUE_TONE: Record<TaskBucket, string> = {
  overdue: "bg-danger/15 text-danger",
  today: "bg-amber/15 text-amber",
  upcoming: "bg-white/8 text-muted",
  later: "bg-white/6 text-faint",
  nodate: "",
  done: "",
};

export function PriorityBars({ priority }: { priority: number }) {
  if (priority <= 0) return null;
  return (
    <span className="flex shrink-0 gap-0.5" title={`${PRIORITY_LABEL[priority]} priority`}>
      {Array.from({ length: priority }, (_, i) => (
        <span key={i} className={cn("h-3.5 w-1 rounded-full", PRIORITY_COLOR[priority])} />
      ))}
    </span>
  );
}

export function DueChip({ task, todayKey }: { task: SpaceTask; todayKey: string }) {
  const label = dueLabel(task, todayKey);
  if (!label || task.done_at) return null;
  return <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", DUE_TONE[bucketOf(task, todayKey)])}>{label}</span>;
}

export function SpaceChip({ space, project }: { space?: Space; project?: Project }) {
  if (!space && !project) return null;
  const hue = space?.hue ?? 258;
  return (
    <span
      className="inline-flex max-w-[11rem] shrink-0 items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: hsl(hue, 80, 60, 0.14), color: hsl(hue, 90, 82) }}
    >
      {space && <span aria-hidden>{space.emoji}</span>}
      <span className="truncate">{project ? project.name : space?.name}</span>
    </span>
  );
}

export function CheckCircle({ done, onToggle }: { done: boolean; onToggle: (el: HTMLElement) => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle(e.currentTarget);
      }}
      aria-label={done ? "Mark as not done" : "Mark as done"}
      aria-pressed={done}
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-all",
        done ? "border-lime bg-lime text-black" : "border-white/25 hover:border-white/60",
      )}
    >
      {done && <Check className="size-3.5" strokeWidth={3.5} />}
    </button>
  );
}

/** One task as a row: used by the list view, the planner and the home screen. */
export function TaskRow({
  task,
  todayKey,
  space,
  project,
  onOpen,
  onDone,
}: {
  task: SpaceTask;
  todayKey: string;
  space?: Space;
  project?: Project;
  onOpen: (t: SpaceTask) => void;
  onDone: (t: SpaceTask, done: boolean) => void;
}) {
  const done = !!task.done_at;
  const doing = stageOf(task) === "doing";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), onOpen(task))}
      className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 transition-colors hover:bg-surface-2"
    >
      <CheckCircle
        done={done}
        onToggle={(el) => {
          if (!done) burstFrom(el);
          onDone(task, !done);
        }}
      />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[15px] leading-snug", done && "text-faint line-through")}>{task.title}</span>
        {(space || project) && !done && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <SpaceChip space={space} project={project} />
          </span>
        )}
      </span>
      {doing && !done && <span className="shrink-0 rounded-full bg-violet/20 px-2 py-0.5 text-[11px] font-semibold text-violet">Doing</span>}
      {!done && <PriorityBars priority={task.priority} />}
      <DueChip task={task} todayKey={todayKey} />
      <ChevronRight className="size-4 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100 max-md:hidden" />
    </div>
  );
}

/** Five dots for how an area feels. Tap one to rate, tap the current one again to clear. */
export function RatingDots({
  value,
  hue,
  onRate,
  size = "md",
}: {
  value: number | null;
  hue: number;
  onRate?: (v: number | null) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex items-center gap-1" role={onRate ? "radiogroup" : undefined} aria-label="How this area feels">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value !== null && n <= value;
        const dot = (
          <span
            className={cn("block rounded-full transition-all", size === "sm" ? "size-2" : "size-3.5", !on && "bg-white/12")}
            style={on ? { background: hsl(hue, 90, 66), boxShadow: `0 0 10px ${hsl(hue, 90, 66, 0.55)}` } : undefined}
          />
        );
        return onRate ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} of 5, ${RATING_LABEL[n]}`}
            onClick={(e) => {
              e.stopPropagation();
              onRate(value === n ? null : n);
            }}
            className="grid size-6 place-items-center rounded-full transition-transform hover:scale-125"
          >
            {dot}
          </button>
        ) : (
          <span key={n}>{dot}</span>
        );
      })}
    </div>
  );
}

/** A tiny line of the last few ratings. */
export function Spark({ values, hue, w = 72, h = 22 }: { values: number[]; hue: number; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - 1) / 4) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={pts} fill="none" stroke={hsl(hue, 90, 66)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
