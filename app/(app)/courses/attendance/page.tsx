import { Suspense } from "react";
import { WifiOff } from "lucide-react";
import { AttendanceView } from "@/components/attendance/attendance-view";
import { CoursesTabs } from "@/components/courses/tabs";
import { requireUser } from "@/lib/auth";
import { loadAttendance } from "@/lib/attendance-data";
import type { CourseAttendance } from "@/lib/attendance";

export const metadata = { title: "Attendance · Orbit" };

async function load(): Promise<{ items: CourseAttendance[]; nowMs: number } | null> {
  await requireUser(); // outside try: redirect() throws
  try {
    return await loadAttendance();
  } catch (err) {
    console.error("Attendance: Nexus load failed", err);
    return null;
  }
}

async function AttendanceContent() {
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
  return <AttendanceView items={data.items} />;
}

export default function AttendancePage() {
  return (
    <>
      <CoursesTabs active="attendance" />
      <Suspense fallback={<Skeleton />}>
        <AttendanceContent />
      </Suspense>
    </>
  );
}

function Skeleton() {
  return (
    <div aria-busy aria-label="Loading attendance">
      <div className="skeleton mb-4 h-4 w-28" />
      <div className="skeleton mb-8 h-16 w-[min(26rem,90%)]" />
      <div className="skeleton mb-6 h-44 rounded-[24px]" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-64 rounded-[24px]" />
        ))}
      </div>
    </div>
  );
}
