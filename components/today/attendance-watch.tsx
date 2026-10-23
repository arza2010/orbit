import { ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/motion/reveal";
import { loadAttendance } from "@/lib/attendance-data";
import { MIN_PCT, bySeverity, needsAttention, type CourseAttendance } from "@/lib/attendance";
import { dayKey, fmtTime } from "@/lib/time";
import { cn } from "@/lib/utils";

/** Today's classes with what skipping each one would do, plus any class near or under the line. */
function verdict(c: CourseAttendance): { text: string; bad: boolean } {
  const a = c.analysis;
  const bad = a.ifMissNext < MIN_PCT || a.canMiss === 0;
  return bad ? { text: `Don't skip: drops to ${a.ifMissNext}%`, bad } : { text: `Skipping is fine: stays at ${a.ifMissNext}%`, bad };
}

export async function AttendanceWatch() {
  let data;
  try {
    data = await loadAttendance();
  } catch {
    return null; // the Today page already explains a Nexus outage
  }
  const today = dayKey(new Date(data.nowMs));
  const current = data.items.filter((c) => c.analysis.remaining > 0);

  const todays = current.filter((c) => c.next && dayKey(new Date(c.next.startMs)) === today).sort((a, b) => (a.next?.startMs ?? 0) - (b.next?.startMs ?? 0));
  const ids = new Set(todays.map((c) => c.course));
  const watch = current
    .filter((c) => needsAttention(c.analysis.standing) && !ids.has(c.course))
    .sort((a, b) => bySeverity(a.analysis.standing, b.analysis.standing))
    .slice(0, 3);
  const trouble = data.items.some((c) => c.analysis.standing === "recover" || c.analysis.standing === "lost");

  return (
    <Reveal delay={0.1}>
      <div className="glass p-5 sm:p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-muted">
            {trouble ? <ShieldAlert className="size-4 text-amber" /> : <ShieldCheck className="size-4" />} Attendance
          </h3>
          <Link href="/courses/attendance" className="text-xs text-faint transition-colors hover:text-text">
            Details →
          </Link>
        </div>

        {todays.length === 0 && watch.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted">Every class is above {MIN_PCT}%. Keep it up.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {todays.map((c) => {
              const v = verdict(c);
              return (
                <li key={c.course} className="rounded-2xl border border-line bg-surface px-3.5 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium">{c.short}</span>
                    <span className="shrink-0 text-xs text-faint">{c.next ? fmtTime(new Date(c.next.startMs)) : ""}</span>
                  </div>
                  <div className={cn("mt-0.5 text-xs", v.bad ? "text-danger" : "text-muted")}>{v.text}</div>
                </li>
              );
            })}
            {watch.map((c) => (
              <li key={c.course} className="rounded-2xl border border-amber/25 bg-amber/8 px-3.5 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">{c.short}</span>
                  <span className="shrink-0 text-xs font-semibold text-amber">{c.analysis.pct}%</span>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {c.analysis.standing === "tight"
                    ? c.analysis.canMiss === 0
                      ? "No spare classes left."
                      : "One spare class left."
                    : c.analysis.standing === "lost"
                      ? "Out of reach this term."
                      : `Attend ${c.analysis.mustAttend} of the next ${c.analysis.remaining}.`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Reveal>
  );
}
