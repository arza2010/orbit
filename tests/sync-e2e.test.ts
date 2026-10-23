import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { fetchTranscript, listMeetings } from "../lib/wispr/api";
import type { SessionLite } from "../lib/wispr/match";
import { runSync, type NewRow } from "../lib/wispr/sync";
import { getWisprClient, type ConnectionStore, type StoredConnection } from "../lib/wispr/tokens";
import { startMock } from "./support/mock-wispr";

const t = (iso: string) => Date.parse(iso);
const NOW = t("2026-10-21T04:00:00Z");

const SESSIONS: SessionLite[] = [
  { id: "ev-data", course: "Data 102 with Vinay Sharma", title: "Data 102", startMs: t("2026-10-19T04:00:00Z"), endMs: t("2026-10-19T05:30:00Z") },
  { id: "ev-bmm", course: "Business Metrics and Mindset with Meet Kotak", title: "BMM", startMs: t("2026-10-19T06:00:00Z"), endMs: t("2026-10-19T07:30:00Z") },
];

const classText = (label: string, lines: number) =>
  Array.from({ length: lines }, (_, i) => `Speaker ${(i % 2) + 1}: ${label} बात ${i}, point ${i} of the lecture.`).join("\n");

const DATA_TEXT = classText("Data", 400);
const BMM_TEXT = classText("BMM", 250);

class MemoryStore implements ConnectionStore {
  readonly key = "e2e-user";
  saves = 0;
  constructor(public conn: StoredConnection) {}
  async load() {
    return { ...this.conn };
  }
  async save(c: StoredConnection) {
    this.saves++;
    this.conn = { ...c };
  }
}

describe("sync end to end (real client code, fake Wispr, in-memory database)", () => {
  const closers: (() => Promise<void>)[] = [];
  after(async () => {
    for (const c of closers) await c();
  });

  async function boot(accessTtlSec = 3600) {
    const mock = await startMock({
      accessTtlSec,
      pageChars: 2500, // forces many pages per transcript
      requireSession: true,
      sse: true,
      meetings: [
        { id: "w-data", title: "Data-Driven Problem Solving Framework", start: "2026-10-19T04:05:11Z", end: "2026-10-19T05:59:15Z" },
        { id: "w-bmm", title: "BMM Session 1 - 19/10/2026", start: "2026-10-19T06:10:25Z", end: "2026-10-19T07:17:51Z" },
        { id: "w-chat", title: "Quick chat", start: "2026-10-19T14:00:00Z", end: "2026-10-19T14:40:00Z" },
        { id: "w-live", title: "Happening now", start: "2026-10-21T03:30:00Z", end: "2026-10-21T04:30:00Z", finalized: false },
      ],
      transcripts: { "w-data": DATA_TEXT, "w-bmm": BMM_TEXT, "w-chat": "Speaker 1: " + "unrelated talk ".repeat(30), "w-live": "partial" },
    });
    closers.push(mock.close);
    const minted = mock.mintTokens("client_e2e");
    const store = new MemoryStore({ clientId: "client_e2e", accessToken: minted.access, refreshToken: minted.refresh, expiresAt: Date.now() + accessTtlSec * 1000 });

    const db = new Map<string, NewRow & { id: string }>();
    let seq = 0;
    const sync = async () => {
      const client = await getWisprClient(store, { mcpUrl: mock.mcpUrl });
      return runSync(
        {
          listMeetings: (a, b) => listMeetings(client, a, b),
          fetchTranscript: (id) => fetchTranscript(client, id),
          sessions: async () => SESSIONS,
          existingIds: async () => new Set([...db.values()].map((r) => r.wispr_meeting_id)),
          insert: async (row) => {
            if ([...db.values()].some((r) => r.wispr_meeting_id === row.wispr_meeting_id)) return null;
            const id = `n${++seq}`;
            db.set(id, { ...row, id });
            return id;
          },
        },
        { now: NOW },
      );
    };
    return { mock, store, db, sync };
  }

  it("files each class correctly and keeps the full multi-page transcripts intact", async () => {
    const { db, sync, mock } = await boot();
    const r = await sync();

    assert.equal(r.imported.length, 2);
    assert.equal(r.unmatched.length, 1, "the evening chat belongs to no class");
    assert.equal(r.stillRecording, 1, "the live recording is left for later");
    assert.equal(r.failed.length, 0);

    const row = (id: string) => [...db.values()].find((x) => x.wispr_meeting_id === id);
    assert.ok(row("w-data")?.transcript === DATA_TEXT, "Data 102 transcript must match exactly across all pages");
    assert.ok(row("w-bmm")?.transcript === BMM_TEXT, "BMM transcript must match exactly across all pages");
    assert.equal(row("w-data")?.course, "Data 102 with Vinay Sharma");
    assert.equal(row("w-bmm")?.course, "Business Metrics and Mindset with Meet Kotak");
    assert.equal(row("w-chat")?.status, "unmatched");
    assert.equal(row("w-chat")?.transcript, null);
    assert.equal(row("w-live"), undefined);

    const pages = mock.state.toolCalls.filter((c) => c.name === "get_meeting").length;
    assert.ok(pages > 10, `long transcripts should take many pages (took ${pages})`);
    assert.equal(mock.state.initCount, 1, "one MCP session for the whole sync");
  });

  it("a second sync adds nothing and downloads no transcripts", async () => {
    const { sync, mock, db } = await boot();
    await sync();
    const before = mock.state.toolCalls.filter((c) => c.name === "get_meeting").length;
    const again = await sync();
    assert.equal(again.imported.length, 0);
    assert.equal(again.alreadyHave, 3);
    assert.equal(db.size, 3);
    assert.equal(mock.state.toolCalls.filter((c) => c.name === "get_meeting").length, before);
  });

  it("survives the access token expiring in the middle of a sync", async () => {
    const { sync, store, mock, db } = await boot(2); // tokens last 2 seconds
    // Let the stored token lapse so the sync has to refresh before it starts, and again while running.
    await new Promise((r) => setTimeout(r, 2200));
    const r = await sync();
    assert.equal(r.failed.length, 0, "no recording should fail because of an expired token");
    assert.equal(r.imported.length, 2);
    assert.ok(mock.state.refreshCount >= 1);
    assert.ok(store.saves >= 1, "the rotated tokens were saved");
    assert.ok([...db.values()].find((x) => x.wispr_meeting_id === "w-data")?.transcript === DATA_TEXT);
  });

  it("a recording that finishes later is picked up on the next sync", async () => {
    const { sync, mock, db } = await boot();
    await sync();
    assert.equal([...db.values()].some((x) => x.wispr_meeting_id === "w-live"), false);

    const live = mock.opts.meetings?.find((m) => m.id === "w-live");
    if (live) live.finalized = true; // the recording ends
    // It is still not a class, so it lands in "needs a class" rather than being lost.
    const next = await sync();
    assert.equal(next.unmatched.length, 1);
    assert.equal([...db.values()].find((x) => x.wispr_meeting_id === "w-live")?.status, "unmatched");
  });
});
