import { Suspense } from "react";
import { ArrowUpRight, DatabaseZap, NotebookPen, Plus } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/motion/reveal";
import { StatusChip } from "@/components/notes/status-chip";
import { WisprPanel, type UnmatchedItem } from "@/components/notes/wispr-panel";
import { requireUser } from "@/lib/auth";
import { courseHue, hsl, shortCourse } from "@/lib/course";
import { listDigests, listNotes, listUnmatched } from "@/lib/notes/queries";
import { recentSessions } from "@/lib/notes/sessions";
import type { SessionOption } from "@/components/notes/new-note-form";
import { connectionStatus } from "@/lib/wispr/service";
import type { DigestRow, NoteListRow } from "@/lib/notes/types";
import { dayKey, fmtDayLabel, fmtTime } from "@/lib/time";

export const metadata = { title: "Notes · Orbit" };

// Writing notes (and syncing Wispr) calls an AI model and can take over a minute.
export const maxDuration = 300;

type Loaded =
  | {
      notes: NoteListRow[];
      digests: DigestRow[];
      wispr: { connected: boolean; lastSynced: string | null; lastSyncedAtMs: number | null };
      unmatched: UnmatchedItem[];
      sessions: SessionOption[];
    }
  | { error: string };

async function load(): Promise<Loaded> {
  await requireUser(); // outside try: redirect() throws
  try {
    const [notes, digests, status, unmatchedRows] = await Promise.all([
      listNotes(),
      listDigests().catch(() => [] as DigestRow[]),
      // These need migration 3. Until it is run, the rest of the page still works.
      connectionStatus().catch(() => ({ connected: false, lastSyncedAt: null as string | null })),
      listUnmatched().catch(() => []),
    ]);
    const sessions = unmatchedRows.length ? await recentSessions() : [];
    return {
      notes,
      digests,
      wispr: {
        connected: status.connected,
        lastSynced: status.lastSyncedAt ? `${fmtDayLabel(dayKey(status.lastSyncedAt))}, ${fmtTime(status.lastSyncedAt)}` : null,
        lastSyncedAtMs: status.lastSyncedAt ? Date.parse(status.lastSyncedAt) : null,
      },
      unmatched: unmatchedRows.map((u) => {
        const start = u.wispr_start ? Date.parse(u.wispr_start) : null;
        const end = u.wispr_end ? Date.parse(u.wispr_end) : null;
        return {
          id: u.id,
          title: u.wispr_title ?? "Untitled recording",
          when: start ? `${fmtDayLabel(dayKey(new Date(start)))}, ${fmtTime(new Date(start))}` : "Unknown time",
          durationMin: start && end ? Math.max(1, Math.round((end - start) / 60_000)) : 0,
        };
      }),
      sessions,
    };
  } catch (err) {
    console.error("Notes: load failed", err);
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

const whenOf = (n: NoteListRow) => fmtDayLabel(dayKey(n.session_start ?? n.created_at));

async function NotesContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await load();
  const sp = await searchParams;
  const flash = (Array.isArray(sp.wispr) ? sp.wispr[0] : sp.wispr) ?? null;

  if ("error" in data) {
    return (
      <div className="glass mx-auto mt-20 max-w-lg p-8 text-center">
        <DatabaseZap className="mx-auto mb-4 size-8 text-muted" />
        <h1 className="font-display text-3xl">Notes can&apos;t load.</h1>
        <p className="mt-2 text-sm text-muted">
          The notes tables may not be set up. Run both SQL files in <code className="font-mono">supabase/migrations</code>{" "}
          in the Supabase SQL editor, then refresh.
        </p>
        <p className="mt-3 break-words text-xs text-faint">{data.error}</p>
      </div>
    );
  }

  const { notes, digests, wispr, unmatched, sessions } = data;
  const byCourse = new Map<string, NoteListRow[]>();
  for (const n of notes) byCourse.set(n.course, [...(byCourse.get(n.course) ?? []), n]);
  const digestFor = new Map(digests.map((d) => [d.course, d]));

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-3 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-muted">
            <span className="h-px w-8 bg-gradient-to-r from-violet to-cyan" />
            Notes
          </div>
          <h1 className="font-display text-[clamp(2.6rem,7vw,5rem)] leading-[0.95] tracking-tight">
            <span className="text-gradient italic">Every class,</span>
            <br />
            written up.
          </h1>
        </div>
        <Link
          href="/notes/new"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-5 text-[15px] font-semibold text-black transition-transform hover:scale-[1.02]"
        >
          <Plus className="size-4" /> Add class notes
        </Link>
      </header>

      <WisprPanel
        connected={wispr.connected}
        lastSynced={wispr.lastSynced}
        lastSyncedAtMs={wispr.lastSyncedAtMs}
        flash={flash}
        unmatched={unmatched}
        sessions={sessions}
      />

      {notes.length === 0 ? (
        <div className="glass p-10 text-center">
          <NotebookPen className="mx-auto mb-4 size-9 text-muted" />
          <h2 className="font-display text-3xl">No notes yet.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Paste a Wispr Flow transcript and Gemini turns it into clean English notes, filed under the right course.
          </p>
          <Link href="/notes/new" className="mt-6 inline-flex h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-medium hover:bg-surface-2">
            Add your first class
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[...byCourse.entries()].map(([course, list], i) => {
              const hue = courseHue(course);
              const ready = list.filter((n) => n.status === "done").length;
              const digest = digestFor.get(course);
              return (
                <Reveal key={course} delay={Math.min(i * 0.05, 0.3)}>
                  <Link
                    href={`/notes/course/${encodeURIComponent(course)}`}
                    className="glass group relative block h-full overflow-hidden p-5 transition-transform hover:-translate-y-1"
                  >
                    <div
                      className="pointer-events-none absolute -right-14 -top-14 size-48 rounded-full opacity-45"
                      style={{ background: `radial-gradient(circle, ${hsl(hue, 90, 60, 0.5)}, transparent 68%)` }}
                    />
                    <div className="relative flex items-start justify-between gap-3">
                      <h2 className="font-display text-[1.7rem] leading-tight tracking-tight">{shortCourse(course)}</h2>
                      <ArrowUpRight className="size-4 shrink-0 text-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-text" />
                    </div>
                    <p className="relative mt-3 text-sm text-muted">
                      <b className="text-text">{ready}</b> of {list.length} {list.length === 1 ? "class" : "classes"} ready
                    </p>
                    <p className="relative mt-1 text-xs text-faint">
                      {digest ? `Consolidated from ${digest.note_count} classes` : "Not consolidated yet"}
                    </p>
                  </Link>
                </Reveal>
              );
            })}
          </div>

          <section className="mt-12">
            <h2 className="mb-4 font-display text-3xl tracking-tight">Recent classes</h2>
            <ul className="flex flex-col gap-2">
              {notes.slice(0, 12).map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/notes/${n.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2"
                  >
                    <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: hsl(courseHue(n.course), 90, 66) }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{n.title ?? `${shortCourse(n.course)} class`}</span>
                      <span className="mt-0.5 block truncate text-xs text-faint">
                        {shortCourse(n.course)} · {whenOf(n)}
                      </span>
                    </span>
                    <StatusChip status={n.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

export default function NotesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <NotesContent searchParams={searchParams} />
    </Suspense>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy aria-label="Loading notes">
      <div className="skeleton mb-4 h-4 w-24" />
      <div className="skeleton mb-8 h-24 w-[min(28rem,90%)]" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-[140px] rounded-[24px]" />
        ))}
      </div>
    </div>
  );
}
