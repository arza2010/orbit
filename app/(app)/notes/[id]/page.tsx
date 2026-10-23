import { Suspense } from "react";
import { ArrowLeft, ChevronDown, CircleHelp, ClipboardList, GraduationCap, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/notes/auto-refresh";
import { Markdown } from "@/components/notes/markdown";
import { fixEscapes } from "@/lib/notes/clean";
import { StatusChip } from "@/components/notes/status-chip";
import { requireUser } from "@/lib/auth";
import { courseHue, hsl, shortCourse } from "@/lib/course";
import { getNote } from "@/lib/notes/queries";
import type { NoteRow } from "@/lib/notes/types";
import { dayKey, fmtDayLabel, fmtTime } from "@/lib/time";
import { deleteNote, reprocessNote } from "../actions";

export const metadata = { title: "Class notes · Orbit" };

// Writing notes (and syncing Wispr) calls an AI model and can take over a minute.
export const maxDuration = 300;

type Result = { kind: "ok"; note: NoteRow } | { kind: "missing" } | { kind: "error"; message: string };

async function load(id: string): Promise<Result> {
  await requireUser(); // outside try: redirect() throws
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { kind: "missing" };
  try {
    const note = await getNote(id);
    return note ? { kind: "ok", note } : { kind: "missing" };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : "Unknown error" };
  }
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="glass p-5 sm:p-6">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await load(id);
  if (result.kind === "missing") notFound();
  if (result.kind === "error") {
    return (
      <div className="glass mx-auto mt-20 max-w-md p-8 text-center">
        <h1 className="font-display text-3xl">Couldn&apos;t load this note.</h1>
        <p className="mt-2 break-words text-xs text-faint">{result.message}</p>
      </div>
    );
  }

  const n = result.note;
  const hue = courseHue(n.course);
  const working = n.status === "pending" || n.status === "processing";
  const when = n.session_start ? `${fmtDayLabel(dayKey(n.session_start))} · ${fmtTime(n.session_start)}` : "Date not set";

  return (
    <div className="mx-auto max-w-3xl">
      {working && <AutoRefresh />}

      <Link
        href={`/notes/course/${encodeURIComponent(n.course)}`}
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-text"
      >
        <ArrowLeft className="size-4" /> {shortCourse(n.course)}
      </Link>

      <header className="relative mb-8">
        <div
          className="pointer-events-none absolute -left-16 -top-20 size-[360px] rounded-full opacity-45"
          style={{ background: `radial-gradient(circle, ${hsl(hue, 90, 60, 0.45)}, transparent 68%)` }}
        />
        <div className="relative">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold uppercase tracking-[0.2em]" style={{ color: hsl(hue, 90, 72) }}>
              {shortCourse(n.course)}
            </span>
            <span className="text-faint">{when}</span>
            <StatusChip status={n.status} />
          </div>
          <h1 className="font-display text-[clamp(2.2rem,6vw,3.8rem)] leading-[1] tracking-tight">
            {n.title ?? (working ? "Writing your notes…" : "Untitled class")}
          </h1>
          {n.summary && <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">{fixEscapes(n.summary)}</p>}
        </div>
      </header>

      {working && (
        <div className="glass mb-6 p-6 text-sm text-muted">
          Gemini is reading the transcript and writing your notes. This page refreshes on its own.
        </div>
      )}

      {n.status === "failed" && (
        <div role="alert" className="mb-6 rounded-2xl border border-danger/30 bg-danger/10 p-5">
          <div className="text-sm font-semibold text-danger">Couldn&apos;t write the notes</div>
          <p className="mt-1 break-words text-sm text-danger/90">{n.error ?? "Something went wrong."}</p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {n.status === "done" && n.notes_md && (
          <section className="glass p-6 sm:p-8">
            <Markdown>{n.notes_md}</Markdown>
          </section>
        )}

        {n.action_items.length > 0 && (
          <Card title="Action items" icon={<ClipboardList className="size-3.5" />}>
            <ul className="flex flex-col gap-2">
              {n.action_items.map((a, i) => (
                <li key={i} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm">
                  <span>{fixEscapes(a.task)}</span>
                  {a.due && <span className="shrink-0 text-xs text-amber">{a.due}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {n.exam_hints.length > 0 && (
          <Card title="Likely exam points" icon={<GraduationCap className="size-3.5" />}>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted marker:text-faint">
              {n.exam_hints.map((h, i) => (
                <li key={i}>{fixEscapes(h)}</li>
              ))}
            </ul>
          </Card>
        )}

        {n.unsure_terms.length > 0 && (
          <Card title="Words to double-check" icon={<CircleHelp className="size-3.5" />}>
            <p className="mb-3 text-xs text-faint">The transcript was unclear on these. The notes avoid guessing.</p>
            <ul className="flex flex-col gap-2">
              {n.unsure_terms.map((t, i) => (
                <li key={i} className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm">
                  <b className="text-text">“{t.heard}”</b>
                  {t.guess && <span className="text-muted"> · maybe {t.guess}</span>}
                  {t.context && <span className="mt-0.5 block text-xs text-faint">{t.context}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {n.transcript && (
          <details className="group glass p-5 sm:p-6">
            <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted [&::-webkit-details-marker]:hidden">
              Original transcript
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <p data-lenis-prevent className="mt-4 max-h-[420px] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-faint">{n.transcript}</p>
          </details>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <form action={reprocessNote.bind(null, n.id)}>
            <button
              type="submit"
              disabled={working}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-50"
            >
              <RefreshCw className="size-4" /> Write again
            </button>
          </form>
          <form action={deleteNote.bind(null, n.id)}>
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-faint transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="size-4" /> Delete
            </button>
          </form>
          {n.model && <span className="ml-auto text-xs text-faint">Written by {n.model}</span>}
        </div>
      </div>
    </div>
  );
}

export default function NotePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div aria-busy className="skeleton mx-auto h-[560px] max-w-3xl rounded-[24px]" />}>
      <Content params={params} />
    </Suspense>
  );
}
