import { CheckCircle2, Users } from "lucide-react";
import { hsl } from "@/lib/course";
import { cn } from "@/lib/utils";
import type { Deadline } from "@/lib/today";

const TONE: Record<Deadline["tone"], string> = {
  overdue: "bg-danger/15 text-danger",
  soon: "bg-amber/15 text-amber",
  later: "bg-white/8 text-muted",
  undated: "bg-white/6 text-faint",
};

export function DeadlineList({
  items,
  showCourse = false,
  done = false,
  empty = "Nothing here.",
}: {
  items: Deadline[];
  showCourse?: boolean;
  done?: boolean;
  empty?: string;
}) {
  if (!items.length) return <p className="py-5 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((d) => (
        <li
          key={d.id}
          className={cn(
            "flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 transition-colors hover:bg-surface-2",
            done && "opacity-70",
          )}
        >
          <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: hsl(d.hue, 90, 66) }} />
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-sm font-medium leading-snug">{d.title}</div>
            {(showCourse || d.group) && (
              <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-faint">
                {showCourse && <span className="truncate">{d.course}</span>}
                {d.group && <Users className="size-3 shrink-0" aria-label="Group assignment" />}
              </div>
            )}
          </div>
          {done ? (
            <CheckCircle2 className="size-4 shrink-0 text-lime" aria-label="Submitted" />
          ) : (
            <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", TONE[d.tone])}>
              {d.dueLabel}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
