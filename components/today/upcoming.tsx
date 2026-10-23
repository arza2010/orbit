import { Reveal } from "@/components/motion/reveal";
import { hsl } from "@/lib/course";
import type { UpcomingDay } from "@/lib/today";

export function Upcoming({ days }: { days: UpcomingDay[] }) {
  if (!days.length) return null;
  return (
    <Reveal delay={0.1}>
      <div className="glass p-5 sm:p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-muted">Coming up</h3>
        <div className="flex flex-col gap-5">
          {days.map((day) => (
            <div key={day.key}>
              <div className="mb-2 text-xs font-semibold text-text">{day.label}</div>
              <ul className="flex flex-col gap-1.5">
                {day.events.map((ev) => (
                  <li key={ev.id} className="flex items-center gap-3 text-sm">
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: hsl(ev.hue, 90, 66) }} />
                    <span className="w-[4.4rem] shrink-0 text-xs tabular-nums text-faint">{ev.range.split(" – ")[0]}</span>
                    <span className="truncate text-muted">{ev.course}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}
