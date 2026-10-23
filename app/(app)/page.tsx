import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { WifiOff } from "lucide-react";
import { AttendanceWatch } from "@/components/today/attendance-watch";
import { Deadlines } from "@/components/today/deadlines";
import { Hero } from "@/components/today/hero";
import { LifeTodayLoader } from "@/components/today/life-today-loader";
import { LiveNow } from "@/components/today/live-now";
import { OrbitClock } from "@/components/today/orbit-clock";
import { TodaySkeleton } from "@/components/today/skeleton";
import { Stats } from "@/components/today/stats";
import { TasksTodayLoader } from "@/components/today/tasks-today-loader";
import { Timeline } from "@/components/today/timeline";
import { Upcoming } from "@/components/today/upcoming";
import { nexus } from "@/lib/nexus";
import { loadPersonal } from "@/lib/today-personal";
import { buildToday, type TodayData } from "@/lib/today";
import { addDays, dayKey } from "@/lib/time";

async function loadToday(): Promise<TodayData | null> {
  const user = await requireUser(); // outside try: redirect() throws
  try {
    const me = await nexus.me();
    const today = dayKey(me.now);
    const [schedule, assignments, personal] = await Promise.all([
      nexus.schedule(`${today}T00:00:00+05:30`, `${addDays(today, 8)}T00:00:00+05:30`),
      nexus.assignments("all"),
      loadPersonal(user.id, today), // never throws: Google and tasks each fail on their own
    ]);
    return buildToday(me, schedule, assignments, personal);
  } catch (err) {
    console.error("Today: Nexus load failed", err);
    return null;
  }
}

async function TodayContent() {
  const data = await loadToday();

  if (!data) {
    return (
      <div className="glass mx-auto mt-24 max-w-md p-8 text-center">
        <WifiOff className="mx-auto mb-4 size-8 text-muted" />
        <h1 className="font-display text-3xl">Can&apos;t reach Nexus.</h1>
        <p className="mt-2 text-sm text-muted">
          Check the connection and the token in <code className="font-mono">.env.local</code>, then refresh.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-2 grid items-center gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <Hero data={data} />
        <OrbitClock events={data.events} serverNow={data.now} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="flex min-w-0 flex-col gap-5">
          <LiveNow events={data.events} serverNow={data.now} />
          <Timeline events={data.events} serverNow={data.now} allDay={data.allDay} free={data.free} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Stats data={data} />
          <Suspense fallback={null}>
            <AttendanceWatch />
          </Suspense>
          <Suspense fallback={null}>
            <TasksTodayLoader />
          </Suspense>
          <Suspense fallback={null}>
            <LifeTodayLoader />
          </Suspense>
          <Deadlines items={data.deadlines} />
          <Upcoming days={data.upcoming} />
        </div>
      </div>
    </>
  );
}

export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <TodayContent />
    </Suspense>
  );
}
