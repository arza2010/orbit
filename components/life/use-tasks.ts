"use client";

import { startTransition, useCallback, useOptimistic, useState } from "react";
import { deleteTask } from "@/app/(app)/life/actions";
import { moveTask, updateSpaceTask, type SpaceActionState, type TaskPatch } from "@/app/(app)/life/space-actions";
import type { SpaceTask, Stage } from "@/lib/life/spaces";
import { dueDateValue, dueFromDateKey } from "@/lib/life/tasks";

type Op = { type: "stage"; id: string; stage: Stage } | { type: "patch"; id: string; patch: TaskPatch } | { type: "delete"; id: string };

function applyPatch(t: SpaceTask, p: TaskPatch): SpaceTask {
  const { due, time, remind, ...rest } = p;
  void remind; // the reminder is stored server-side only
  let next: SpaceTask = { ...t, ...rest } as SpaceTask;
  if (due !== undefined || time !== undefined) {
    const day = due === undefined ? (dueDateValue(t) || null) : due;
    if (!day) next = { ...next, due_at: null, due_has_time: false };
    else if (time) next = { ...next, due_at: `${day}T${time}:00+05:30`, due_has_time: true };
    else next = { ...next, due_at: dueFromDateKey(day), due_has_time: false };
  }
  return next;
}

/** Optimistic task changes shared by the space view, the planner and the home screen. */
export function useTasks(initial: SpaceTask[]) {
  const [list, apply] = useOptimistic(initial, (state: SpaceTask[], op: Op) => {
    switch (op.type) {
      case "delete":
        return state.filter((t) => t.id !== op.id);
      case "stage":
        return state.map((t) =>
          t.id !== op.id ? t : op.stage === "done" ? { ...t, done_at: new Date().toISOString() } : { ...t, done_at: null, stage: op.stage },
        );
      case "patch":
        return state.map((t) => (t.id === op.id ? applyPatch(t, op.patch) : t));
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const run = useCallback(
    (op: Op, call: () => Promise<SpaceActionState>) =>
      startTransition(async () => {
        setError(null);
        apply(op);
        const r = await call();
        if (r.error) setError(r.error);
      }),
    [apply],
  );

  return {
    list,
    error,
    open: list.find((t) => t.id === openId) ?? null,
    openTask: (t: SpaceTask) => setOpenId(t.id),
    closeTask: () => setOpenId(null),
    setDone: (t: SpaceTask, done: boolean) => run({ type: "stage", id: t.id, stage: done ? "done" : "todo" }, () => moveTask(t.id, done ? "done" : "todo")),
    setStage: (t: SpaceTask, stage: Stage) => run({ type: "stage", id: t.id, stage }, () => moveTask(t.id, stage)),
    patch: (t: SpaceTask, patch: TaskPatch) => run({ type: "patch", id: t.id, patch }, () => updateSpaceTask(t.id, patch)),
    remove: (t: SpaceTask) => {
      setOpenId(null);
      run({ type: "delete", id: t.id }, () => deleteTask(t.id));
    },
  };
}
