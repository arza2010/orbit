import "server-only";
import { z } from "zod";
import { fmtDayLabel, dayKey } from "@/lib/time";
import { shortCourse } from "@/lib/course";
import { nexus } from "@/lib/nexus";
import { createClient } from "@/lib/supabase/server";
import { fixEscapes } from "./clean";
import { generateJson, generateText } from "./gemini";
import { DIGEST_RULES, NOTE_RULES, NOTE_SCHEMA, NOTES_MD_FORMAT } from "./rules";
import type { NoteRow } from "./types";

const MAX_TRANSCRIPT_CHARS = 600_000;

const Output = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1),
  notes_md: z.string().min(1),
  action_items: z.array(z.object({ task: z.string(), due: z.string().optional() })).default([]),
  exam_hints: z.array(z.string()).default([]),
  unsure_terms: z
    .array(z.object({ heard: z.string(), guess: z.string().optional(), context: z.string().optional() }))
    .default([]),
});

// Words in assignment titles that are not names worth telling the model about.
const STOP = new Set(
  "session workbook async assignment assessment mid term end final quiz presentation submission pre work case practice important group form snapshot graded written the and of for with in on at to a an linkedin profile template".split(" "),
);

/** Company names and key terms the model should expect, taken from the student's own Nexus data. */
async function expectedTerms(course: string): Promise<string[]> {
  const [assignments, courses] = await Promise.all([nexus.assignments("all"), nexus.courses()]);
  const found = new Map<string, number>();
  for (const a of assignments) {
    for (const raw of a.title.split(/[\s\-–:/&,()]+/)) {
      const w = raw.trim();
      if (w.length < 3 || /^\d+$/.test(w) || STOP.has(w.toLowerCase())) continue;
      found.set(w, (found.get(w) ?? 0) + 1);
    }
  }
  const terms = [...found.keys()];
  const match = courses.find((c) => c.title === course);
  if (match?.instructor) terms.unshift(match.instructor);
  terms.unshift(shortCourse(course));
  return [...new Set(terms)].slice(0, 80);
}

async function setStatus(id: string, patch: Record<string, unknown>) {
  const supabase = await createClient();
  await supabase.from("class_notes").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

const safeMessage = (err: unknown) => {
  const msg = err instanceof Error ? err.message : "Unknown error";
  return msg.replace(/key=[^&\s]+/gi, "key=…").slice(0, 400);
};

/** Turns one stored transcript into structured notes. Always leaves the row 'done' or 'failed'. */
export async function processNote(id: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.from("class_notes").select("*").eq("id", id).maybeSingle();
  const note = data as NoteRow | null;
  if (!note) return;

  await setStatus(id, { status: "processing", error: null });

  try {
    const transcript = (note.transcript ?? "").trim();
    if (transcript.length < 200) throw new Error("The transcript is too short to make notes from.");
    if (transcript.length > MAX_TRANSCRIPT_CHARS) throw new Error("The transcript is too long to process in one go.");

    const terms = await expectedTerms(note.course).catch(() => [shortCourse(note.course)]);
    const when = note.session_start ? fmtDayLabel(dayKey(note.session_start)) : "date unknown";

    const system = `${NOTE_RULES}\n\n## Output\nReturn JSON matching the schema. ${NOTES_MD_FORMAT}`;
    const user = [
      `Course: ${note.course}`,
      `Class date: ${when}`,
      `Terms likely to appear (company names, people, course words). Use them to fix mis-heard words:`,
      terms.join(", "),
      "",
      "<transcript>",
      transcript,
      "</transcript>",
    ].join("\n");

    const { data: raw, model } = await generateJson({ system, user, schema: NOTE_SCHEMA as unknown as Record<string, unknown> });
    const out = Output.parse(raw);

    await setStatus(id, {
      status: "done",
      title: out.title,
      summary: fixEscapes(out.summary),
      notes_md: fixEscapes(out.notes_md),
      action_items: out.action_items.map((a) => ({ ...a, task: fixEscapes(a.task) })),
      exam_hints: out.exam_hints.map(fixEscapes),
      unsure_terms: out.unsure_terms,
      model,
      error: null,
      processed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("processNote failed", id, safeMessage(err));
    await setStatus(id, { status: "failed", error: safeMessage(err) });
  }
}

/** Rebuilds the consolidated revision document for one course from its finished session notes. */
export async function buildDigest(course: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_notes")
    .select("id,title,summary,notes_md,session_start,action_items,exam_hints")
    .eq("course", course)
    .eq("status", "done")
    .order("session_start", { ascending: true, nullsFirst: false });
  if (error) return { ok: false, error: error.message };

  const notes = (data ?? []).filter((n) => n.notes_md);
  if (notes.length === 0) return { ok: false, error: "No finished notes for this course yet." };

  try {
    const body = notes
      .map((n, i) => {
        const when = n.session_start ? fmtDayLabel(dayKey(n.session_start)) : "date unknown";
        return `### [S${i + 1}] ${n.title ?? "Untitled"} (${when})\n${fixEscapes(n.notes_md)}`;
      })
      .join("\n\n---\n\n");

    const { text, model } = await generateText({
      system: DIGEST_RULES,
      user: `Course: ${course}\nSessions: ${notes.length}\n\n${body}`,
    });

    const { error: upErr } = await supabase.from("course_digests").upsert(
      { course, content_md: fixEscapes(text), note_count: notes.length, model, updated_at: new Date().toISOString() },
      { onConflict: "user_id,course" },
    );
    if (upErr) return { ok: false, error: upErr.message };
    return { ok: true };
  } catch (err) {
    console.error("buildDigest failed", course, safeMessage(err));
    return { ok: false, error: safeMessage(err) };
  }
}
