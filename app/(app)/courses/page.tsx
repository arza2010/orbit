import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { WifiOff } from "lucide-react";
import { CoursesView, type ProgramTeaser } from "@/components/courses/courses-view";
import { CoursesTabs } from "@/components/courses/tabs";
import { buildCourseCards, termOrder, type CourseCard } from "@/lib/courses";
import { nexus } from "@/lib/nexus";
import { buildPrograms } from "@/lib/programs-data";
import { isAcademicCourse } from "@/lib/programs";
import { addDays, dayKey, fmtDayLabel } from "@/lib/time";

export const metadata = { title: "Courses · Orbit" };

type Loaded = { cards: CourseCard[]; terms: string[]; teasers: ProgramTeaser[] };

async function load(): Promise<Loaded | null> {
  await requireUser(); // outside try: redirect() throws
  try {
    const me = await nexus.me();
    const nowMs = new Date(me.now).getTime();
    const today = dayKey(me.now);

    const [courses, assignments, marks, attendance, events, announcements] = await Promise.all([
      nexus.courses(),
      nexus.assignments("all"),
      nexus.grades(),
      nexus.attendance(),
      nexus.scheduleRange(today, addDays(today, 60)),
      nexus.announcements(),
    ]);

    const academic = courses.filter((c) => isAcademicCourse(c.title));
    const cards = buildCourseCards(academic, assignments, marks, attendance, events, nowMs);
    const terms = termOrder(academic);

    const teasers = buildPrograms(events, assignments, announcements, nowMs).map((p) => ({
      id: p.id,
      upcoming: p.upcoming.length,
      next: p.upcoming[0] ? fmtDayLabel(p.upcoming[0].dayKey) : null,
    }));

    return { cards, terms, teasers };
  } catch (err) {
    console.error("Courses: Nexus load failed", err);
    return null;
  }
}

async function CoursesContent() {
  const data = await load();
  if (!data) {
    return (
      <div className="glass mx-auto mt-24 max-w-md p-8 text-center">
        <WifiOff className="mx-auto mb-4 size-8 text-muted" />
        <h1 className="font-display text-3xl">Can&apos;t reach Nexus.</h1>
        <p className="mt-2 text-sm text-muted">Check the connection and the token, then refresh.</p>
      </div>
    );
  }
  return <CoursesView cards={data.cards} terms={data.terms} teasers={data.teasers} />;
}

export default function CoursesPage() {
  return (
    <>
      <CoursesTabs active="courses" />
      <Suspense fallback={<ListSkeleton />}>
        <CoursesContent />
      </Suspense>
    </>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy aria-label="Loading courses">
      <div className="skeleton mb-4 h-4 w-28" />
      <div className="skeleton mb-3 h-16 w-[min(30rem,90%)]" />
      <div className="skeleton mb-8 h-16 w-[min(22rem,70%)]" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-[250px] rounded-[24px]" />
        ))}
      </div>
    </div>
  );
}
