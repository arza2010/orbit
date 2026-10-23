import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { SessionLite } from "../lib/wispr/match";
import { MIN_TRANSCRIPT_CHARS, runSync, type MeetingLite, type NewRow, type SyncDeps } from "../lib/wispr/sync";

const t = (iso: string) => Date.parse(iso);
const NOW = t("2026-10-21T04:00:00Z");

const DATA102: SessionLite = { id: "ev-data", course: "Data 102 with Vinay Sharma", title: "Data 102", startMs: t("2026-10-19T04:00:00Z"), endMs: t("2026-10-19T05:30:00Z") };
const BMM: SessionLite = { id: "ev-bmm", course: "Business Metrics and Mindset with Meet Kotak", title: "BMM", startMs: t("2026-10-19T06:00:00Z"), endMs: t("2026-10-19T07:30:00Z") };
const SESSIONS = [DATA102, BMM];

const meeting = (id: string, start: string, end: string, extra: Partial<MeetingLite> = {}): MeetingLite => ({
  id, title: `Recording ${id}`, startMs: t(start), endMs: t(end), hasTranscript: true, finalized: true, ...extra,
});
const REC_DATA = meeting("w-data", "2026-10-19T04:05:11Z", "2026-10-19T05:59:15Z");
const REC_BMM = meeting("w-bmm", "2026-10-19T06:10:25Z", "2026-10-19T07:17:51Z");
const REC_RANDOM = meeting("w-random", "2026-10-19T14:00:00Z", "2026-10-19T15:00:00Z"); // no class then

const LONG = "Speaker 1: " + "यह एक लंबी कक्षा है, this is a long class. ".repeat(40);

type Harness = ReturnType<typeof harness>;

function harness(meetings: MeetingLite[], overrides: Partial<SyncDeps> = {}) {
  const rows = new Map<string, NewRow & { id: string }>();
  const calls = { fetch: [] as string[], list: [] as [string, string][], sessions: [] as [string, string][] };
  let seq = 0;
  const deps: SyncDeps = {
    async listMeetings(a, b) {
      calls.list.push([a, b]);
      return meetings;
    },
    async fetchTranscript(id) {
      calls.fetch.push(id);
      return LONG;
    },
    async sessions(a, b) {
      calls.sessions.push([a, b]);
      return SESSIONS;
    },
    async existingIds() {
      return new Set([...rows.values()].map((r) => r.wispr_meeting_id));
    },
    async insert(row) {
      if ([...rows.values()].some((r) => r.wispr_meeting_id === row.wispr_meeting_id)) return null;
      const id = `note-${++seq}`;
      rows.set(id, { ...row, id });
      return id;
    },
    ...overrides,
  };
  return { deps, rows, calls, run: () => runSync(deps, { now: NOW }) };
}

describe("Wispr sync", () => {
  let h: Harness;
  beforeEach(() => {
    h = harness([REC_DATA, REC_BMM]);
  });

  it("imports each recording under the right course, with the class's own times", async () => {
    const r = await h.run();
    assert.equal(r.imported.length, 2);
    const byMeeting = new Map([...h.rows.values()].map((x) => [x.wispr_meeting_id, x]));

    const data = byMeeting.get("w-data");
    assert.equal(data?.course, "Data 102 with Vinay Sharma");
    assert.equal(data?.nexus_event_id, "ev-data");
    assert.equal(data?.status, "pending");
    assert.equal(data?.source, "wispr");
    assert.equal(data?.transcript, LONG);
    assert.equal(data?.session_start, "2026-10-19T04:00:00.000Z", "uses the Nexus class time, not the recording's");
    assert.equal(data?.wispr_start, "2026-10-19T04:05:11.000Z");

    assert.equal(byMeeting.get("w-bmm")?.course, "Business Metrics and Mindset with Meet Kotak");
  });

  it("is idempotent: running again adds nothing and fetches nothing", async () => {
    await h.run();
    h.calls.fetch.length = 0;
    const again = await h.run();
    assert.equal(again.imported.length, 0);
    assert.equal(again.alreadyHave, 2);
    assert.equal(h.rows.size, 2);
    assert.equal(h.calls.fetch.length, 0, "must not re-download transcripts it already has");
  });

  it("keeps unmatched recordings (without a transcript) for the user to assign", async () => {
    const h2 = harness([REC_DATA, REC_RANDOM]);
    const r = await h2.run();
    assert.equal(r.imported.length, 1);
    assert.equal(r.unmatched.length, 1);
    const row = [...h2.rows.values()].find((x) => x.wispr_meeting_id === "w-random");
    assert.equal(row?.status, "unmatched");
    assert.equal(row?.transcript, null);
    assert.equal(row?.nexus_event_id, null);
    assert.ok(!h2.calls.fetch.includes("w-random"), "no point downloading a transcript we cannot file");

    const again = await h2.run();
    assert.equal(again.unmatched.length, 0, "an unmatched recording is not re-reported every sync");
  });

  it("skips recordings that are still going, and picks them up once they finish", async () => {
    const live = meeting("w-live", "2026-10-19T04:05:11Z", "2026-10-19T05:59:15Z", { finalized: false });
    const h2 = harness([live]);
    const first = await h2.run();
    assert.equal(first.stillRecording, 1);
    assert.equal(h2.rows.size, 0, "must not be recorded as done");

    const finished = [{ ...live, finalized: true }];
    const h3 = harness(finished);
    assert.equal((await h3.run()).imported.length, 1);
  });

  it("skips recordings with no transcript, and does not record them", async () => {
    const h2 = harness([meeting("w-none", "2026-10-19T04:05:11Z", "2026-10-19T05:59:15Z", { hasTranscript: false })]);
    const r = await h2.run();
    assert.equal(r.noTranscript, 1);
    assert.equal(h2.rows.size, 0);
  });

  it("ignores tiny transcripts but remembers them so they are not fetched again", async () => {
    const h2 = harness([REC_DATA], { fetchTranscript: async (id) => (h2calls.push(id), "Speaker 1: test test") });
    const h2calls: string[] = [];
    const r = await h2.run();
    assert.equal(r.tooShort, 1);
    assert.equal(r.imported.length, 0);
    assert.equal([...h2.rows.values()][0].status, "ignored");
    await h2.run();
    assert.equal(h2calls.length, 1, "fetched only once");
    assert.ok("x".repeat(MIN_TRANSCRIPT_CHARS - 1).length < MIN_TRANSCRIPT_CHARS);
  });

  it("one failing recording does not block the others, and is retried next time", async () => {
    let failBmm = true;
    const h2 = harness([REC_DATA, REC_BMM], {
      fetchTranscript: async (id) => {
        if (id === "w-bmm" && failBmm) throw new Error("network blip");
        return LONG;
      },
    });
    const r = await h2.run();
    assert.equal(r.imported.length, 1);
    assert.equal(r.failed.length, 1);
    assert.match(r.failed[0].reason, /network blip/);
    assert.equal(h2.rows.size, 1, "the failed one is not stored");

    failBmm = false;
    const retry = await h2.run();
    assert.equal(retry.imported.length, 1);
    assert.equal(h2.rows.size, 2);
  });

  it("does not count a recording a concurrent sync already inserted", async () => {
    const h2 = harness([REC_DATA], { insert: async () => null });
    const r = await h2.run();
    assert.equal(r.imported.length, 0);
    assert.equal(r.failed.length, 0);
  });

  it("looks back 14 days by default, with a day of slack either side for classes", async () => {
    await h.run();
    const [since, until] = h.calls.list[0];
    assert.equal(Date.parse(since), NOW - 14 * 86_400_000);
    assert.equal(Date.parse(until), NOW + 86_400_000);
    const [sFrom] = h.calls.sessions[0];
    assert.equal(Date.parse(sFrom), NOW - 15 * 86_400_000);
  });

  it("copes with no recordings at all", async () => {
    const r = await harness([]).run();
    assert.deepEqual(
      { i: r.imported.length, u: r.unmatched.length, f: r.failed.length, a: r.alreadyHave },
      { i: 0, u: 0, f: 0, a: 0 },
    );
  });

  it("propagates a total failure (e.g. Wispr unreachable) instead of hiding it", async () => {
    const h2 = harness([], { listMeetings: async () => { throw new Error("Wispr returned HTTP 502"); } });
    await assert.rejects(() => h2.run(), /502/);
  });

  it("processes recordings oldest first", async () => {
    const order: string[] = [];
    const h2 = harness([REC_BMM, REC_DATA], { fetchTranscript: async (id) => (order.push(id), LONG) });
    await h2.run();
    assert.deepEqual(order, ["w-data", "w-bmm"]);
  });
});
