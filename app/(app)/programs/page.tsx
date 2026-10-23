import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { WifiOff } from "lucide-react";
import { ProgramSection } from "@/components/programs/program-section";
import { nexus } from "@/lib/nexus";
import { buildPrograms, type ProgramBlock } from "@/lib/programs-data";
import { addDays, dayKey } from "@/lib/time";

export const metadata = { title: "Programs · Orbit" };

async function load(): Promise<ProgramBlock[] | null> {
  await requireUser(); // outside try: redirect() throws
  try {
    const me = await nexus.me();
    const nowMs = new Date(me.now).getTime();
    const today = dayKey(me.now);
    const [events, assignments, announcements] = await Promise.all([
      nexus.scheduleRange(addDays(today, -30), addDays(today, 75)),
      nexus.assignments("all"),
      nexus.announcements(60),
    ]);
    return buildPrograms(events, assignments, announcements, nowMs);
  } catch (err) {
    console.error("Programs: Nexus load failed", err);
    return null;
  }
}

async function ProgramsContent() {
  const blocks = await load();
  if (!blocks) {
    return (
      <div className="glass mx-auto mt-24 max-w-md p-8 text-center">
        <WifiOff className="mx-auto mb-4 size-8 text-muted" />
        <h1 className="font-display text-3xl">Can&apos;t reach Nexus.</h1>
        <p className="mt-2 text-sm text-muted">Check the connection and the token, then refresh.</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-8">
        <div className="mb-3 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-muted">
          <span className="h-px w-8 bg-gradient-to-r from-violet to-cyan" />
          Programs
        </div>
        <h1 className="font-display text-[clamp(2.6rem,7vw,5rem)] leading-[0.95] tracking-tight">
          <span className="text-gradient italic">Beyond</span> the classroom.
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted">
          Founder sessions, sprint labs and office hours, pulled from the same Nexus calendar.
        </p>
      </header>
      <div className="flex flex-col gap-6">
        {blocks.map((b, i) => (
          <ProgramSection key={b.id} block={b} delay={i * 0.05} />
        ))}
      </div>
    </div>
  );
}

export default function ProgramsPage() {
  return (
    <Suspense fallback={<ProgramsSkeleton />}>
      <ProgramsContent />
    </Suspense>
  );
}

function ProgramsSkeleton() {
  return (
    <div aria-busy aria-label="Loading programs">
      <div className="skeleton mb-4 h-4 w-28" />
      <div className="skeleton mb-8 h-20 w-[min(30rem,90%)]" />
      <div className="flex flex-col gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-[360px] rounded-[24px]" />
        ))}
      </div>
    </div>
  );
}
