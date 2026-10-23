import "server-only";
import { createClient } from "@/lib/supabase/server";
import { LIST_COLUMNS, type DigestRow, type NoteListRow, type NoteRow, type UnmatchedRow } from "./types";

const HIDDEN = "(unmatched,ignored)";

// All reads go through the signed-in user's session, so row-level security applies.

export async function listNotes(): Promise<NoteListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_notes")
    .select(LIST_COLUMNS)
    .not("status", "in", HIDDEN)
    .order("session_start", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as NoteListRow[];
}

export async function getNote(id: string): Promise<NoteRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("class_notes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as NoteRow | null) ?? null;
}

export async function listCourseNotes(course: string): Promise<NoteListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_notes")
    .select(LIST_COLUMNS)
    .eq("course", course)
    .not("status", "in", HIDDEN)
    .order("session_start", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as NoteListRow[];
}

export async function getDigest(course: string): Promise<DigestRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("course_digests")
    .select("course,content_md,note_count,model,updated_at")
    .eq("course", course)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DigestRow | null) ?? null;
}

export async function listDigests(): Promise<DigestRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("course_digests").select("course,content_md,note_count,model,updated_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as DigestRow[];
}

export async function listUnmatched(): Promise<UnmatchedRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_notes")
    .select("id,wispr_title,wispr_start,wispr_end")
    .eq("status", "unmatched")
    .order("wispr_start", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as UnmatchedRow[];
}
