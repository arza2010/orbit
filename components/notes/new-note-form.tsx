"use client";

import { AlertTriangle, FileUp, Loader2, Sparkles } from "lucide-react";
import { useActionState, useState } from "react";
import { createNote, type FormState } from "@/app/(app)/notes/actions";
import { hsl } from "@/lib/course";
import { cn } from "@/lib/utils";

export type SessionOption = {
  id: string;
  course: string; // full Nexus title
  short: string;
  start: string;
  end: string;
  label: string; // "Mon 19 Oct · 9:30 am"
  hue: number;
};

const OTHER = "__other";

export function NewNoteForm({ sessions }: { sessions: SessionOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createNote, {});
  const [picked, setPicked] = useState(sessions[0]?.id ?? OTHER);
  const [fileName, setFileName] = useState("");

  const session = sessions.find((s) => s.id === picked) ?? null;

  return (
    <form action={action} className="flex flex-col gap-6">
      {/* The class */}
      <section className="glass p-5 sm:p-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Which class?</h2>

        {sessions.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {sessions.slice(0, 8).map((s) => (
              <label
                key={s.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-3 transition-colors",
                  picked === s.id ? "border-white/30 bg-white/[0.08]" : "border-line bg-surface hover:bg-surface-2",
                )}
              >
                <input
                  type="radio"
                  name="_pick"
                  value={s.id}
                  checked={picked === s.id}
                  onChange={() => setPicked(s.id)}
                  className="sr-only"
                />
                <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: hsl(s.hue, 90, 66) }} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{s.short}</span>
                  <span className="block text-xs text-faint">{s.label}</span>
                </span>
              </label>
            ))}
            <label
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed px-3.5 py-3 text-sm transition-colors",
                picked === OTHER ? "border-white/30 bg-white/[0.08]" : "border-line text-muted hover:bg-surface-2",
              )}
            >
              <input type="radio" name="_pick" value={OTHER} checked={picked === OTHER} onChange={() => setPicked(OTHER)} className="sr-only" />
              Something else
            </label>
          </div>
        )}

        {session ? (
          <>
            <input type="hidden" name="course" value={session.course} />
            <input type="hidden" name="session_start" value={session.start} />
            <input type="hidden" name="session_end" value={session.end} />
            <input type="hidden" name="nexus_event_id" value={session.id} />
          </>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              Course name
              <input
                name="course"
                required
                placeholder="e.g. Data 102 with Vinay Sharma"
                className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-text outline-none placeholder:text-faint focus:border-white/30"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              Class date and time
              <input
                name="session_start"
                type="datetime-local"
                className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-text outline-none focus:border-white/30 [color-scheme:dark]"
              />
            </label>
          </div>
        )}
      </section>

      {/* The transcript */}
      <section className="glass p-5 sm:p-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted">The transcript</h2>
        <textarea
          name="transcript"
          rows={10}
          placeholder="Paste the full Wispr Flow transcript here. Hindi, Marathi and English mixed is fine."
          className="w-full resize-y rounded-2xl border border-line bg-black/20 px-4 py-3 text-sm leading-relaxed text-text outline-none placeholder:text-faint focus:border-white/30"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 transition-colors hover:bg-surface-2 hover:text-text">
            <FileUp className="size-4" />
            {fileName || "Or upload a .txt, .md or .json file"}
            <input
              name="file"
              type="file"
              accept=".txt,.md,.json,text/plain"
              className="sr-only"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            />
          </label>
          {fileName && <span className="text-faint">The uploaded file replaces the pasted text.</span>}
        </div>
      </section>

      {state.error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-12 items-center gap-2.5 rounded-full bg-white px-6 text-[15px] font-semibold text-black transition-transform hover:scale-[1.02] active:scale-[0.99] disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {pending ? "Saving…" : "Make notes"}
        </button>
        <p className="text-xs text-faint">Takes about a minute. You can leave the page while it works.</p>
      </div>
    </form>
  );
}
