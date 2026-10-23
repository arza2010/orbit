import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { NewNoteForm } from "@/components/notes/new-note-form";
import { requireUser } from "@/lib/auth";
import { recentSessions } from "@/lib/notes/sessions";

export const metadata = { title: "Add class notes · Orbit" };

// Writing notes (and syncing Wispr) calls an AI model and can take over a minute.
export const maxDuration = 300;

async function Content() {
  await requireUser();
  const sessions = await recentSessions();
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/notes" className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-text">
        <ArrowLeft className="size-4" /> Notes
      </Link>
      <header className="mb-8">
        <h1 className="font-display text-[clamp(2.4rem,6vw,4.2rem)] leading-[0.95] tracking-tight">
          <span className="text-gradient italic">Add</span> class notes.
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted">
          Pick the class, paste the transcript, and Gemini writes clean English notes and files them under the course.
        </p>
      </header>
      <NewNoteForm sessions={sessions} />
    </div>
  );
}

export default function NewNotePage() {
  return (
    <Suspense fallback={<div aria-busy className="skeleton mx-auto h-[520px] max-w-3xl rounded-[24px]" />}>
      <Content />
    </Suspense>
  );
}
