import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { WifiOff } from "lucide-react";
import { notFound } from "next/navigation";
import { CourseDetailView } from "@/components/courses/course-detail";
import { buildCourseDetail, type CourseDetail } from "@/lib/courses";
import { nexus } from "@/lib/nexus";
import { addDays, dayKey } from "@/lib/time";

export const metadata = { title: "Course · Orbit" };

type Result = { kind: "ok"; detail: CourseDetail } | { kind: "missing" } | { kind: "error" };

async function load(id: string): Promise<Result> {
  await requireUser(); // outside try: redirect() throws
  try {
    const me = await nexus.me();
    const nowMs = new Date(me.now).getTime();
    const today = dayKey(me.now);

    const courses = await nexus.courses();
    const course = courses.find((c) => c.id === id);
    if (!course) return { kind: "missing" };

    const [assignments, marks, attendance, events] = await Promise.all([
      nexus.assignments("all"),
      nexus.grades(),
      nexus.attendance(),
      nexus.scheduleRange(addDays(today, -45), addDays(today, 60)),
    ]);
    return { kind: "ok", detail: buildCourseDetail(course, assignments, marks, attendance, events, nowMs) };
  } catch (err) {
    console.error("Course: Nexus load failed", err);
    return { kind: "error" };
  }
}

async function CourseContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await load(id);

  if (result.kind === "missing") notFound();
  if (result.kind === "error") {
    return (
      <div className="glass mx-auto mt-24 max-w-md p-8 text-center">
        <WifiOff className="mx-auto mb-4 size-8 text-muted" />
        <h1 className="font-display text-3xl">Can&apos;t reach Nexus.</h1>
        <p className="mt-2 text-sm text-muted">Check the connection and the token, then refresh.</p>
      </div>
    );
  }
  return <CourseDetailView d={result.detail} />;
}

export default function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <CourseContent params={params} />
    </Suspense>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy aria-label="Loading course">
      <div className="skeleton mb-6 h-4 w-24" />
      <div className="skeleton mb-4 h-20 w-[min(30rem,90%)]" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[112px] rounded-[24px]" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="skeleton h-[420px] rounded-[24px]" />
        <div className="skeleton h-[420px] rounded-[24px]" />
      </div>
    </div>
  );
}
