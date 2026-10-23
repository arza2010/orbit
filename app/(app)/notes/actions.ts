"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { buildDigest, processNote } from "@/lib/notes/process";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string };

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const Fields = z.object({
  course: z.string().trim().min(1, "Pick the class (or type a course name)."),
  session_start: z.string().trim().optional(),
  session_end: z.string().trim().optional(),
  nexus_event_id: z.string().trim().optional(),
});

/** Plain text, or JSON with a transcript-like string field. */
function textFromFile(name: string, raw: string): string {
  if (!name.toLowerCase().endsWith(".json")) return raw;
  try {
    const data = JSON.parse(raw) as unknown;
    if (typeof data === "string") return data;
    if (data && typeof data === "object") {
      for (const key of ["transcript", "text", "content", "body"]) {
        const v = (data as Record<string, unknown>)[key];
        if (typeof v === "string") return v;
      }
    }
  } catch {
    /* not JSON after all */
  }
  return raw;
}

const isoOrNull = (v: string | undefined) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export async function createNote(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();

  const parsed = Fields.safeParse({
    course: formData.get("course"),
    session_start: formData.get("session_start") || undefined,
    session_end: formData.get("session_end") || undefined,
    nexus_event_id: formData.get("nexus_event_id") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  let transcript = String(formData.get("transcript") ?? "").trim();
  let source: "paste" | "upload" = "paste";

  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) return { error: "That file is over 5 MB." };
    transcript = textFromFile(file.name, await file.text()).trim();
    source = "upload";
  }
  if (transcript.length < 200) return { error: "That transcript looks too short. Paste the full text or upload the file." };
  if (transcript.length > 600_000) return { error: "That transcript is too long to process in one go." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_notes")
    .insert({
      course: parsed.data.course,
      session_start: isoOrNull(parsed.data.session_start),
      session_end: isoOrNull(parsed.data.session_end),
      nexus_event_id: parsed.data.nexus_event_id ?? null,
      transcript,
      source,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    const missing = /column|schema cache|does not exist/i.test(error?.message ?? "");
    return {
      error: missing
        ? "The database is missing the notes columns. Run supabase/migrations/20261022000000_class_notes_v2.sql in the SQL editor."
        : "Couldn't save the transcript. Please try again.",
    };
  }

  const id = data.id as string;
  after(() => processNote(id));
  redirect(`/notes/${id}`);
}

export async function reprocessNote(id: string) {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("class_notes").update({ status: "pending", error: null }).eq("id", id);
  after(() => processNote(id));
  revalidatePath(`/notes/${id}`);
}

export async function deleteNote(id: string) {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("class_notes").delete().eq("id", id);
  redirect("/notes");
}

// useActionState passes the previous state as the second argument.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function rebuildDigest(course: string, _prev: FormState): Promise<FormState> {
  await requireUser();
  const result = await buildDigest(course);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/notes/course/${encodeURIComponent(course)}`);
  return {};
}
