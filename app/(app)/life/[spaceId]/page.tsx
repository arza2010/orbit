import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SetupNeeded } from "@/components/life/setup-needed";
import { SpaceView } from "@/components/life/space-view";
import { requireUser } from "@/lib/auth";
import { listProjects, listRatings, listSpaceTasks, listSpaces } from "@/lib/life/queries";
import { todayKey as getTodayKey } from "@/lib/life/today-key";

export const metadata = { title: "Space · Orbit" };

async function Content({ params }: { params: Promise<{ spaceId: string }> }) {
  await requireUser();
  const { spaceId } = await params;
  const today = await getTodayKey();

  let data;
  try {
    const [spaces, projects, tasks, ratings] = await Promise.all([listSpaces(), listProjects(), listSpaceTasks(today, spaceId), listRatings(today)]);
    data = { spaces, projects, tasks, ratings };
  } catch (err) {
    console.error("Space: load failed", err);
    return <SetupNeeded />;
  }

  const space = data.spaces.find((s) => s.id === spaceId);
  if (!space) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/life" className="mb-5 inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-text">
        <ChevronLeft className="size-4" />
        Life
      </Link>
      <SpaceView
        space={space}
        projects={data.projects.filter((p) => p.space_id === spaceId)}
        allProjects={data.projects}
        tasks={data.tasks}
        allSpaces={data.spaces}
        ratings={data.ratings}
        todayKey={today}
      />
    </div>
  );
}

export default function SpacePage({ params }: { params: Promise<{ spaceId: string }> }) {
  return (
    <Suspense fallback={<div aria-busy className="skeleton mx-auto h-[520px] max-w-4xl rounded-[24px]" />}>
      <Content params={params} />
    </Suspense>
  );
}
