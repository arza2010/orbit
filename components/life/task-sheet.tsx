"use client";

import { AnimatePresence, motion } from "motion/react";
import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { TaskPatch } from "@/app/(app)/life/space-actions";
import { hsl } from "@/lib/course";
import { STAGES, stageOf, type Project, type Space, type SpaceTask, type Stage } from "@/lib/life/spaces";
import { dueDateValue, dueTimeValue, PRIORITY_LABEL } from "@/lib/life/tasks";
import { cn } from "@/lib/utils";
import { PRIORITY_COLOR } from "./bits";

const FIELD = "w-full rounded-xl border border-line bg-black/20 px-3 py-2.5 text-base text-text outline-none transition-colors focus:border-white/30 sm:text-sm [color-scheme:dark]";
const LABEL = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-faint";

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

export function TaskSheet({
  task,
  spaces,
  projects,
  onClose,
  onPatch,
  onStage,
  onDelete,
}: {
  task: SpaceTask | null;
  spaces: Space[];
  projects: Project[];
  onClose: () => void;
  onPatch: (task: SpaceTask, patch: TaskPatch) => void;
  onStage: (task: SpaceTask, stage: Stage) => void;
  onDelete: (task: SpaceTask) => void;
}) {
  const desktop = useIsDesktop();
  const off = desktop ? { x: "108%" } : { y: "108%" };

  useEffect(() => {
    if (!task) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, onClose]);

  return (
    <AnimatePresence>
      {task && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            key="sheet"
            role="dialog"
            aria-label="Task details"
            data-lenis-prevent
            className="glass fixed inset-x-2 bottom-2 z-50 max-h-[90dvh] overflow-y-auto bg-[#0b0b15] p-5 md:inset-y-3 md:left-auto md:right-3 md:max-h-none md:w-[460px] md:p-7"
            initial={off}
            animate={{ x: 0, y: 0 }}
            exit={off}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            <SheetBody key={task.id} task={task} spaces={spaces} projects={projects} onClose={onClose} onPatch={onPatch} onStage={onStage} onDelete={onDelete} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function SheetBody({
  task,
  spaces,
  projects,
  onClose,
  onPatch,
  onStage,
  onDelete,
}: {
  task: SpaceTask;
  spaces: Space[];
  projects: Project[];
  onClose: () => void;
  onPatch: (task: SpaceTask, patch: TaskPatch) => void;
  onStage: (task: SpaceTask, stage: Stage) => void;
  onDelete: (task: SpaceTask) => void;
}) {
  const stage = stageOf(task);
  const space = spaces.find((s) => s.id === task.space_id);
  const choices = projects.filter((p) => p.space_id === task.space_id && p.status !== "done");
  const [date, setDate] = useState(dueDateValue(task));
  const [time, setTime] = useState(dueTimeValue(task));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <textarea
          defaultValue={task.title}
          rows={2}
          maxLength={500}
          aria-label="Task name"
          onBlur={(e) => e.target.value.trim() && e.target.value !== task.title && onPatch(task, { title: e.target.value })}
          className="min-w-0 flex-1 resize-none bg-transparent font-display text-3xl leading-tight tracking-tight outline-none"
        />
        <button onClick={onClose} aria-label="Close" className="mt-1 rounded-full border border-line p-2 text-muted transition-colors hover:text-text">
          <X className="size-4" />
        </button>
      </div>

      <div>
        <span className={LABEL}>Status</span>
        <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-line bg-black/20 p-1">
          {STAGES.map((s) => (
            <button
              key={s.id}
              onClick={() => s.id !== stage && onStage(task, s.id)}
              aria-pressed={stage === s.id}
              className={cn(
                "rounded-lg py-2 text-sm font-medium transition-colors",
                stage === s.id ? (s.id === "done" ? "bg-lime text-black" : "bg-white/12 text-text ring-1 ring-white/15") : "text-muted hover:text-text",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="why">
          Why this matters
        </label>
        <textarea
          id="why"
          defaultValue={task.why ?? ""}
          rows={2}
          maxLength={500}
          placeholder="The reason behind it. Future you will want this on a bad day."
          onBlur={(e) => e.target.value !== (task.why ?? "") && onPatch(task, { why: e.target.value })}
          className={cn(FIELD, "resize-none")}
          style={space ? { borderColor: hsl(space.hue, 80, 60, 0.35) } : undefined}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          defaultValue={task.notes ?? ""}
          rows={5}
          maxLength={4000}
          placeholder="Details, links, a first step, a checklist…"
          onBlur={(e) => e.target.value !== (task.notes ?? "") && onPatch(task, { notes: e.target.value })}
          className={cn(FIELD, "resize-y")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="due">
            Due
          </label>
          <input
            id="due"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (!e.target.value) setTime("");
              onPatch(task, { due: e.target.value || null });
            }}
            className={FIELD}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="time">
            Time
          </label>
          <input
            id="time"
            type="time"
            value={time}
            disabled={!date}
            onChange={(e) => {
              setTime(e.target.value);
              onPatch(task, { time: e.target.value || null });
            }}
            className={cn(FIELD, "disabled:opacity-40")}
          />
        </div>
      </div>

      <div>
        <span className={LABEL}>Priority</span>
        <div className="grid grid-cols-4 gap-1.5">
          {PRIORITY_LABEL.map((label, p) => (
            <button
              key={label}
              onClick={() => onPatch(task, { priority: p })}
              aria-pressed={task.priority === p}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-medium transition-colors",
                task.priority === p ? "border-white/30 bg-white/10 text-text" : "border-line text-muted hover:text-text",
              )}
            >
              {p > 0 && <span className={cn("size-2 rounded-full", PRIORITY_COLOR[p])} />}
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="space">
            Space
          </label>
          <select
            id="space"
            value={task.space_id ?? ""}
            onChange={(e) => onPatch(task, { space_id: e.target.value || null, project_id: null })}
            className={FIELD}
          >
            <option value="">No space</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.emoji} {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="project">
            Project
          </label>
          <select
            id="project"
            value={task.project_id ?? ""}
            disabled={!task.space_id}
            onChange={(e) => onPatch(task, { project_id: e.target.value || null })}
            className={cn(FIELD, "disabled:opacity-40")}
          >
            <option value="">No project</option>
            {choices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={() => onDelete(task)}
        className="flex items-center justify-center gap-2 self-start rounded-full px-3 py-2 text-sm text-faint transition-colors hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 className="size-4" />
        Delete task
      </button>
    </div>
  );
}
