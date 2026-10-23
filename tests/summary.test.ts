import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarise } from "../lib/wispr/summary";
import type { SyncResult } from "../lib/wispr/sync";

const empty = (): SyncResult => ({ imported: [], unmatched: [], alreadyHave: 0, stillRecording: 0, noTranscript: 0, tooShort: 0, failed: [] });

describe("sync summary wording", () => {
  it("handles singular and plural", () => {
    assert.equal(summarise({ ...empty(), imported: [{ id: "1", title: "a", course: "c" }] }), "Imported 1 class. Writing the notes now.");
    assert.match(summarise({ ...empty(), imported: [{ id: "1", title: "a", course: "c" }, { id: "2", title: "b", course: "c" }] }), /Imported 2 classes/);
    assert.match(summarise({ ...empty(), unmatched: [{ title: "x" }] }), /^1 recording needs a class\.$/);
    assert.match(summarise({ ...empty(), unmatched: [{ title: "x" }, { title: "y" }] }), /^2 recordings need a class\.$/);
  });
  it("says so when nothing happened", () => {
    assert.equal(summarise(empty()), "No new recordings found.");
    assert.equal(summarise({ ...empty(), alreadyHave: 3 }), "Everything is up to date.");
  });
  it("reports failures and in-progress recordings together", () => {
    const out = summarise({ ...empty(), failed: [{ title: "x", reason: "r" }], stillRecording: 2 });
    assert.match(out, /1 recording failed and will be retried/);
    assert.match(out, /2 recordings still in progress/);
  });
});
