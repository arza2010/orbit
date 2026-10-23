export type NoteStatus = "pending" | "processing" | "done" | "failed" | "unmatched" | "ignored";

export type ActionItem = { task: string; due?: string };
export type UnsureTerm = { heard: string; guess?: string; context?: string };

export type NoteRow = {
  id: string;
  course: string;
  title: string | null;
  session_start: string | null;
  session_end: string | null;
  nexus_event_id: string | null;
  source: "paste" | "upload" | "wispr";
  transcript: string | null;
  summary: string | null;
  notes_md: string | null;
  action_items: ActionItem[];
  exam_hints: string[];
  unsure_terms: UnsureTerm[];
  status: NoteStatus;
  error: string | null;
  model: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** List rows skip the heavy transcript and notes text. */
export type NoteListRow = Pick<
  NoteRow,
  "id" | "course" | "title" | "session_start" | "summary" | "status" | "error" | "created_at"
>;

/** A Wispr recording waiting to be filed under a class. */
export type UnmatchedRow = { id: string; wispr_title: string | null; wispr_start: string | null; wispr_end: string | null };

export type DigestRow = {
  course: string;
  content_md: string;
  note_count: number;
  model: string | null;
  updated_at: string;
};

export const LIST_COLUMNS = "id,course,title,session_start,summary,status,error,created_at";
