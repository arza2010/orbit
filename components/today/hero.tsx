import { SplitText } from "@/components/motion/reveal";
import type { TodayData } from "@/lib/today";

export function Hero({ data }: { data: TodayData }) {
  const { classes, open, overdue, personal, tasksDue } = data.stats;
  const bits = [
    classes ? `${classes} ${classes === 1 ? "class" : "classes"} today` : "No classes today",
    personal ? `${personal} ${personal === 1 ? "other event" : "other events"}` : null,
    tasksDue ? `${tasksDue} ${tasksDue === 1 ? "task" : "tasks"} to do` : null,
    open ? `${open} open ${open === 1 ? "deadline" : "deadlines"}` : "no deadlines open",
    overdue ? `${overdue} overdue` : null,
  ].filter(Boolean);

  return (
    <header className="pb-8 pt-2 sm:pb-10">
      <div className="mb-4 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-muted">
        <span className="h-px w-8 bg-gradient-to-r from-violet to-cyan" />
        {data.todayLabel}
      </div>
      <h1 className="font-display text-[clamp(2.9rem,9vw,6.6rem)] leading-[0.95] tracking-tight">
        <SplitText text={`${data.greeting},`} className="text-gradient italic" />
        <br />
        <SplitText text={`${data.firstName}.`} delay={0.25} />
      </h1>
      <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">{bits.join("  ·  ")}</p>
    </header>
  );
}
