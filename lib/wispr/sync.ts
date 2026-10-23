import { matchSession, type SessionLite } from "./match";

// The sync algorithm, free of any framework or network code. Everything it touches is passed in,
// so the tests can drive it with fakes.

export type MeetingLite = {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  hasTranscript: boolean;
  finalized: boolean;
};

export type NewRow = {
  course: string;
  title: string;
  session_start: string | null;
  session_end: string | null;
  nexus_event_id: string | null;
  source: "wispr";
  transcript: string | null;
  wispr_meeting_id: string;
  wispr_title: string;
  wispr_start: string;
  wispr_end: string;
  status: "pending" | "unmatched" | "ignored";
};

export type SyncDeps = {
  listMeetings(sinceIso: string, untilIso: string): Promise<MeetingLite[]>;
  fetchTranscript(meetingId: string): Promise<string>;
  sessions(sinceIso: string, untilIso: string): Promise<SessionLite[]>;
  /** wispr_meeting_id values already in the database (any status). */
  existingIds(): Promise<Set<string>>;
  /** Returns the new row's id, or null if it already existed (a concurrent sync won the race). */
  insert(row: NewRow): Promise<string | null>;
};

export type SyncResult = {
  imported: { id: string; title: string; course: string }[];
  unmatched: { title: string }[];
  alreadyHave: number;
  stillRecording: number;
  noTranscript: number;
  tooShort: number;
  failed: { title: string; reason: string }[];
};

export const MIN_TRANSCRIPT_CHARS = 200;
const DAY = 86_400_000;

export async function runSync(deps: SyncDeps, opts: { now: number; lookbackDays?: number }): Promise<SyncResult> {
  const since = opts.now - (opts.lookbackDays ?? 14) * DAY;
  const sinceIso = new Date(since).toISOString();
  const untilIso = new Date(opts.now + DAY).toISOString();

  const result: SyncResult = { imported: [], unmatched: [], alreadyHave: 0, stillRecording: 0, noTranscript: 0, tooShort: 0, failed: [] };

  const [meetings, sessions, existing] = await Promise.all([
    deps.listMeetings(sinceIso, untilIso),
    deps.sessions(new Date(since - DAY).toISOString(), untilIso),
    deps.existingIds(),
  ]);

  // Oldest first, so a failure part-way leaves the newest still to do next time.
  for (const m of [...meetings].sort((a, b) => a.startMs - b.startMs)) {
    if (existing.has(m.id)) {
      result.alreadyHave++;
      continue;
    }
    if (!m.finalized) {
      result.stillRecording++; // not recorded in the DB: a later sync will pick it up
      continue;
    }
    if (!m.hasTranscript) {
      result.noTranscript++;
      continue;
    }

    const base = {
      source: "wispr" as const,
      wispr_meeting_id: m.id,
      wispr_title: m.title,
      wispr_start: new Date(m.startMs).toISOString(),
      wispr_end: new Date(m.endMs).toISOString(),
    };

    try {
      const match = matchSession(m, sessions);

      if (!match) {
        const id = await deps.insert({
          ...base,
          course: "Unmatched",
          title: m.title,
          session_start: null,
          session_end: null,
          nexus_event_id: null,
          transcript: null,
          status: "unmatched",
        });
        if (id) result.unmatched.push({ title: m.title });
        continue;
      }

      const transcript = await deps.fetchTranscript(m.id);
      if (transcript.length < MIN_TRANSCRIPT_CHARS) {
        // A test or accidental recording. Remember it so we don't fetch it again.
        await deps.insert({
          ...base,
          course: match.session.course,
          title: m.title,
          session_start: new Date(match.session.startMs).toISOString(),
          session_end: new Date(match.session.endMs).toISOString(),
          nexus_event_id: match.session.id,
          transcript: null,
          status: "ignored",
        });
        result.tooShort++;
        continue;
      }

      const id = await deps.insert({
        ...base,
        course: match.session.course,
        title: m.title,
        session_start: new Date(match.session.startMs).toISOString(),
        session_end: new Date(match.session.endMs).toISOString(),
        nexus_event_id: match.session.id,
        transcript,
        status: "pending",
      });
      if (id) result.imported.push({ id, title: m.title, course: match.session.course });
    } catch (err) {
      result.failed.push({ title: m.title, reason: err instanceof Error ? err.message.slice(0, 160) : "Unknown error" });
    }
  }
  return result;
}
