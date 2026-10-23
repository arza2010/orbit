"use client";

import { CalendarCheck } from "lucide-react";
import { addDays, dayKey, fmtDayLabel } from "@/lib/time";
import { dueDateValue } from "@/lib/life/tasks";
import type { Project, Space, SpaceTask } from "@/lib/life/spaces";
import { cn } from "@/lib/utils";
import { TaskRow } from "./bits";
import { TaskSheet } from "./task-sheet";
import { useTasks } from "./use-tasks";

type Group = { key: string; title: string; tone?: string; tasks: SpaceTask[] };

export function Planner({ spaces, projects, tasks, todayKey }: { spaces: Space[]; projects: Project[]; tasks: SpaceTask[]; todayKey: string }) {
  const t = useTasks(tasks);
  const spaceOf = new Map(spaces.map((s) => [s.id, s]));
  const projectOf = new Map(projects.map((p) => [p.id, p]));

  const open = t.list.filter((x) => !x.done_at);
  const day = (x: SpaceTask) => dueDateValue(x);
  const urgent = (a: SpaceTask, b: SpaceTask) => (a.due_at ?? "").localeCompare(b.due_at ?? "") || b.priority - a.priority || a.created_at.localeCompare(b.created_at);

  const groups: Group[] = [
    { key: "overdue", title: "Overdue", tone: "text-danger", tasks: open.filter((x) => day(x) && day(x) < todayKey).sort(urgent) },
    { key: "today", title: "Today", tone: "text-amber", tasks: open.filter((x) => day(x) === todayKey).sort(urgent) },
    ...Array.from({ length: 6 }, (_, i) => {
      const key = addDays(todayKey, i + 1);
      return { key, title: i === 0 ? `Tomorrow · ${fmtDayLabel(key)}` : fmtDayLabel(key), tasks: open.filter((x) => day(x) === key).sort(urgent) };
    }),
    { key: "later", title: "Later", tasks: open.filter((x) => day(x) > addDays(todayKey, 6)).sort(urgent) },
    { key: "doing", title: "In progress, no date", tasks: open.filter((x) => !day(x) && x.stage === "doing").sort(urgent) },
    { key: "someday", title: "Someday", tasks: open.filter((x) => !day(x) && x.stage !== "doing").sort((a, b) => b.priority - a.priority || a.created_at.localeCompare(b.created_at)) },
  ].filter((g) => g.tasks.length);

  const doneToday = t.list.filter((x) => x.done_at && dayKey(x.done_at) === todayKey).length;

  if (!groups.length) {
    return (
      <div className="glass p-10 text-center">
        <CalendarCheck className="mx-auto mb-3 size-8 text-lime" />
        <div className="font-display text-3xl">Clear.</div>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">Nothing open. Add tasks from any space and they&apos;ll line up here by day.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className={cn("mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]", g.tone ?? "text-muted")}>
            {g.title}
            <span className="font-normal text-faint">{g.tasks.length}</span>
          </h2>
          <div className="flex flex-col gap-1.5">
            {g.tasks.map((x) => (
              <TaskRow key={x.id} task={x} todayKey={todayKey} space={x.space_id ? spaceOf.get(x.space_id) : undefined} project={x.project_id ? projectOf.get(x.project_id) : undefined} onOpen={t.openTask} onDone={t.setDone} />
            ))}
          </div>
        </section>
      ))}
      {t.error && <p role="alert" className="text-sm text-danger">{t.error}</p>}
      <p className="text-center text-xs text-faint">
        {open.length} open{doneToday > 0 && ` · ${doneToday} done today`}
      </p>
      <TaskSheet task={t.open} spaces={spaces} projects={projects} onClose={t.closeTask} onPatch={t.patch} onStage={t.setStage} onDelete={t.remove} />
    </div>
  );
}
