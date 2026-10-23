import { CountUp } from "@/components/motion/count-up";
import { Reveal } from "@/components/motion/reveal";
import type { TodayData } from "@/lib/today";

function Stat({
  label,
  value,
  decimals = 0,
  suffix,
  tint,
  delay,
}: {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  tint: string;
  delay: number;
}) {
  return (
    <Reveal delay={delay}>
      <div className="glass relative overflow-hidden p-5">
        <div
          className="pointer-events-none absolute -bottom-10 -right-10 size-32 rounded-full opacity-50"
          style={{ background: `radial-gradient(circle, ${tint}, transparent 70%)` }}
        />
        <div className="relative font-display text-6xl leading-none tracking-tight">
          <CountUp value={value} decimals={decimals} />
          {suffix && <span className="ml-1 text-2xl text-muted">{suffix}</span>}
        </div>
        <div className="relative mt-3 text-xs font-medium uppercase tracking-[0.18em] text-muted">{label}</div>
      </div>
    </Reveal>
  );
}

export function Stats({ data }: { data: TodayData }) {
  const s = data.stats;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Stat label="Classes today" value={s.classes} tint="rgb(139 108 255 / 0.5)" delay={0.1} />
      <Stat label="In class" value={s.hoursInClass} decimals={1} suffix="h" tint="rgb(53 224 255 / 0.4)" delay={0.18} />
      <Stat label="Open deadlines" value={s.open} tint="rgb(255 180 84 / 0.4)" delay={0.26} />
      <Stat label="Tasks to do" value={s.tasksDue} tint="rgb(255 92 157 / 0.4)" delay={0.34} />
    </div>
  );
}
