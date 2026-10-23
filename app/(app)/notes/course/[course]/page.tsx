import { Suspense } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DigestButton } from "@/components/notes/digest-button";
import { Markdown } from "@/components/notes/markdown";
import { StatusChip } from "@/components/notes/status-chip";
import { requireUser } from "@/lib/auth";
import { courseHue, hsl, shortCourse } from "@/lib/course";
import { getDigest, listCourseNotes } from "@/lib/notes/queries";
import type { DigestRow, NoteListRow } from "@/lib/notes/types";
import { dayKey, fmtDayLabel } from "@/lib/time";

export const metadata = { title: "Course notes · Orbit" };

// Writing notes (and syncing Wispr) calls an AI model and can take over a minute.
export const maxDuration = 300;

type Result = { notes: NoteListRow[]; digest: DigestRow | null } | { error: string };

async function load(course: string): Promise<Result> {
  await requireUser(); // outside try: redirect() throws
  try {
    const [notes, digest] = await Promise.all([listCourseNotes(course), getDigest(course).catch(() => null)]);
    return { notes, digest };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

async function Content({ params }: { params: Promise<{ course: string }> }) {
  const { course: raw } = await params;
  let course: string;
  try {
    course = decodeURIComponent(raw);
  } catch {
    notFound();
  }

  const result = await load(course);
  if ("error" in result) {
    return (
      <div className="glass mx-auto mt-20 max-w-md p-8 text-center">
        <h1 className="font-display text-3xl">Couldn&apos;t load these notes.</h1>
        <p className="mt-2 break-words text-xs text-faint">{result.error}</p>
      </div>
    );
  }
  if (result.notes.length === 0) notFound();

  const { notes, digest } = result;
  const hue = courseHue(course);
  const ready = notes.filter((n) => n.status === "done").length;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/notes" className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-text">
        <ArrowLeft className="size-4" /> Notes
      </Link>

      <header className="relative mb-8">
        <div
          className="pointer-events-none absolute -left-16 -top-20 size-[380px] rounded-full opacity-45"
          style={{ background: `radial-gradient(circle, ${hsl(hue, 90, 60, 0.45)}, transparent 68%)` }}
        />
        <div className="relative">
          <h1 className="font-display text-[clamp(2.6rem,7vw,4.6rem)] leading-[0.95] tracking-tight">{shortCourse(course)}</h1>
          <p className="mt-3 text-sm text-muted">
            {ready} of {notes.length} {notes.length === 1 ? "class" : "classes"} ready
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <DigestButton course={course} hasDigest={!!digest} />
            <Link
              href="/notes/new"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-2"
            >
              <Plus className="size-4" /> Add a class
            </Link>
          </div>
        </div>
      </header>

      <section className="glass mb-8 p-6 sm:p-8">
        {digest ? (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs text-faint">
              <span className="font-semibold uppercase tracking-[0.2em] text-muted">Consolidated notes</span>
              <span>
                From {digest.note_count} {digest.note_count === 1 ? "class" : "classes"} · updated {fmtDayLabel(dayKey(digest.updated_at))}
              </span>
            </div>
            <Markdown>{digest.content_md}</Markdown>
          </>
        ) : (
          <div className="py-6 text-center">
            <div className="font-display text-3xl">One document for the whole course.</div>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              Merge all {ready} finished {ready === 1 ? "class" : "classes"} into a single revision sheet, organised by topic.
            </p>
          </div>
        )}
      </section>

      <h2 className="mb-3 font-display text-3xl tracking-tight">Classes</h2>
      <ul className="flex flex-col gap-2">
        {[...notes].reverse().map((n) => (
          <li key={n.id}>
            <Link
              href={`/notes/${n.id}`}
              className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{n.title ?? "Untitled class"}</span>
                <span className="mt-0.5 block truncate text-xs text-faint">{fmtDayLabel(dayKey(n.session_start ?? n.created_at))}</span>
              </span>
              <StatusChip status={n.status} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CourseNotesPage({ params }: { params: Promise<{ course: string }> }) {
  return (
    <Suspense fallback={<div aria-busy className="skeleton mx-auto h-[560px] max-w-3xl rounded-[24px]" />}>
      <Content params={params} />
    </Suspense>
  );
}
