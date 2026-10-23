import "server-only";
import type { McpClient } from "./mcp";

export type WisprMeeting = {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  hasTranscript: boolean;
  finalized: boolean;
};

type RawMeeting = {
  id?: unknown;
  title?: unknown;
  start?: unknown;
  end?: unknown;
  has_transcript?: unknown;
  finalized?: unknown;
};

const ms = (v: unknown): number | null => {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
};

/** Defensive: anything malformed is dropped rather than crashing a sync. */
export function parseMeetings(raw: unknown): WisprMeeting[] {
  const list = (raw as { meetings?: RawMeeting[] } | null)?.meetings;
  if (!Array.isArray(list)) return [];
  const out: WisprMeeting[] = [];
  for (const m of list) {
    const start = ms(m.start);
    const end = ms(m.end);
    if (typeof m.id !== "string" || start === null || end === null || end <= start) continue;
    out.push({
      id: m.id,
      title: typeof m.title === "string" && m.title.trim() ? m.title.trim() : "Untitled recording",
      startMs: start,
      endMs: end,
      hasTranscript: m.has_transcript === true,
      finalized: m.finalized !== false, // treat a missing flag as finished
    });
  }
  return out;
}

/** All recordings that started in the window, newest pages first, following the cursor. */
export async function listMeetings(client: McpClient, sinceIso: string, untilIso: string): Promise<WisprMeeting[]> {
  const all: WisprMeeting[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await client.callTool<{ meetings?: unknown[]; has_more?: boolean; next_cursor?: string }>("search_meetings", {
      since: sinceIso,
      until: untilIso,
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    all.push(...parseMeetings(res));
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return [...new Map(all.map((m) => [m.id, m])).values()];
}

// --- Transcripts ----------------------------------------------------------------------------

// The marker is followed by the closing <<<END TRANSCRIPT>>> line, so it must not be anchored to the end.
const TRUNCATION = /\n*\(\.\.\.truncated[^\n]*?start_char=(\d+)[^\n]*\)/;

/** Removes the wrapper lines Wispr adds, and reports where the next page starts (null when done). */
export function cleanTranscriptPage(raw: string): { text: string; next: number | null } {
  let text = raw;
  let next: number | null = null;
  const m = TRUNCATION.exec(text);
  if (m) {
    next = Number(m[1]);
    text = text.slice(0, m.index);
  }
  text = text
    .split("\n")
    .filter((line) => !/^<<<.*>>>\s*$/.test(line.trim()))
    .join("\n");
  return { text, next };
}

const PAGE_CHARS = 40_000;

export async function fetchTranscript(client: McpClient, meetingId: string): Promise<string> {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < 40; i++) {
    const res = await client.callTool<{ transcript?: string }>("get_meeting", {
      meeting_id: meetingId,
      view_content: { char_limit: 1 },
      view_transcript: { start_char: start, char_limit: PAGE_CHARS },
    });
    const { text, next } = cleanTranscriptPage(res.transcript ?? "");
    parts.push(text);
    if (next === null || next <= start) break;
    start = next;
  }
  return parts.join("").trim();
}
