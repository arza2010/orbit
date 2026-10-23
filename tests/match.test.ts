import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchSession, type SessionLite } from "../lib/wispr/match";

const t = (iso: string) => Date.parse(iso);
const session = (id: string, course: string, start: string, end: string): SessionLite => ({
  id,
  course,
  title: course,
  startMs: t(start),
  endMs: t(end),
});

// Mon 19 Oct 2026, IST = UTC+5:30. Real classes and real recording times from that day.
const DATA102 = session("s-data", "Data 102 with Vinay Sharma", "2026-10-19T04:00:00Z", "2026-10-19T05:30:00Z"); // 9:30-11:00
const BMM = session("s-bmm", "Business Metrics and Mindset", "2026-10-19T06:00:00Z", "2026-10-19T07:30:00Z"); // 11:30-13:00
const DAY = [DATA102, BMM];

const rec = (start: string, end: string) => ({ startMs: t(start), endMs: t(end) });

describe("matching a recording to a class", () => {
  it("matches the real Data 102 recording (starts late, ends after the class)", () => {
    const m = matchSession(rec("2026-10-19T04:05:11Z", "2026-10-19T05:59:15Z"), DAY);
    assert.equal(m?.session.id, "s-data");
  });

  it("matches the real BMM recording (shorter than the class)", () => {
    const m = matchSession(rec("2026-10-19T06:10:25Z", "2026-10-19T07:17:51Z"), DAY);
    assert.equal(m?.session.id, "s-bmm");
  });

  it("matches on the right class even when classes sit back to back", () => {
    const back = [DATA102, session("s-next", "Next", "2026-10-19T05:30:00Z", "2026-10-19T07:00:00Z")];
    assert.equal(matchSession(rec("2026-10-19T04:00:00Z", "2026-10-19T05:28:00Z"), back)?.session.id, "s-data");
    assert.equal(matchSession(rec("2026-10-19T05:32:00Z", "2026-10-19T06:58:00Z"), back)?.session.id, "s-next");
  });

  it("returns nothing when no class is on at that time", () => {
    assert.equal(matchSession(rec("2026-10-19T05:35:00Z", "2026-10-19T05:55:00Z"), DAY), null); // the gap
    assert.equal(matchSession(rec("2026-10-19T14:00:00Z", "2026-10-19T15:00:00Z"), DAY), null); // evening
    assert.equal(matchSession(rec("2026-10-20T04:00:00Z", "2026-10-20T05:30:00Z"), DAY), null); // next day
  });

  it("does not file a recording that merely brushes a class", () => {
    // 15 minutes at the end of Data 102 and 15 at the start of BMM
    assert.equal(matchSession(rec("2026-10-19T05:15:00Z", "2026-10-19T06:15:00Z"), DAY), null);
  });

  it("refuses to guess when one long recording spans two classes", () => {
    assert.equal(matchSession(rec("2026-10-19T04:00:00Z", "2026-10-19T07:30:00Z"), DAY), null);
  });

  it("rejects a recording that is mostly something else (a long block with a class inside)", () => {
    assert.equal(matchSession(rec("2026-10-19T00:00:00Z", "2026-10-19T08:00:00Z"), [DATA102]), null);
  });

  it("requires the recording to cover at least half the class", () => {
    // 40 minutes of a 90 minute class: 44%
    assert.equal(matchSession(rec("2026-10-19T04:00:00Z", "2026-10-19T04:40:00Z"), [DATA102]), null);
    // 50 minutes: 55%
    assert.equal(matchSession(rec("2026-10-19T04:00:00Z", "2026-10-19T04:50:00Z"), [DATA102])?.session.id, "s-data");
  });

  it("handles empty or invalid input without throwing", () => {
    assert.equal(matchSession(rec("2026-10-19T04:00:00Z", "2026-10-19T05:30:00Z"), []), null);
    assert.equal(matchSession({ startMs: 5, endMs: 5 }, DAY), null);
    assert.equal(matchSession({ startMs: 10, endMs: 5 }, DAY), null);
  });

  it("reports how much of the class was recorded", () => {
    const m = matchSession(rec("2026-10-19T04:00:00Z", "2026-10-19T05:30:00Z"), DAY);
    assert.equal(m?.overlapMs, 90 * 60_000);
  });
});
