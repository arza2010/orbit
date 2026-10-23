import { Users } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { hsl } from "@/lib/course";
import { cn } from "@/lib/utils";
import type { Deadline } from "@/lib/today";

const TONE: Record<Deadline["tone"], string> = {
  overdue: "bg-danger/15 text-danger",
  soon: "bg-amber/15 text-amber",
  later: "bg-white/8 text-muted",
  undated: "bg-white/6 text-faint",
};

export function Deadlines({ items }: { items: Deadline[] }) {
  const shown = items.slice(0, 7);
  return (
    <Reveal delay={0.15}>
      <div className="glass p-5 sm:p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">Deadlines</h3>
          <span className="text-xs text-faint">{items.length} open</span>
        </div>
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">All clear. Nothing waiting on you.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown.map((d) => (
              <li
                key={d.id}
                className="group flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 transition-colors hover:bg-surface-2"
              >
                <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: hsl(d.hue, 90, 66) }} />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm font-medium leading-snug">{d.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-faint">
                    <span className="truncate">{d.course}</span>
                    {d.group && <Users className="size-3 shrink-0" aria-label="Group assignment" />}
                  </div>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", TONE[d.tone])}>
                  {d.dueLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
        {items.length > shown.length && (
          <p className="mt-3 text-center text-xs text-faint">+{items.length - shown.length} more</p>
        )}
      </div>
    </Reveal>
  );
}
