import assert from "node:assert/strict";
import { test } from "node:test";
import { fixEscapes } from "../lib/notes/clean";

test("turns literal \\n written by a double-escaping model into real line breaks", () => {
  const bad = "# Title\\n\\n## Key concepts\\n\\n- **Outcome**: x\\n- **Gap**: y";
  assert.equal(fixEscapes(bad), "# Title\n\n## Key concepts\n\n- **Outcome**: x\n- **Gap**: y");
});

test("leaves well-formed notes alone", () => {
  const ok = "# Title\n\n## Key concepts\n\n- one\n- two";
  assert.equal(fixEscapes(ok), ok);
});

test("keeps a deliberate \\n inside otherwise normal text", () => {
  const code = "Line one\nLine two\nLine three\nUse `printf(\"a\\n\")` to print.";
  assert.equal(fixEscapes(code), code);
});

test("handles carriage returns and stray escaped quotes", () => {
  assert.equal(fixEscapes('a\\r\\nb says \\"hi\\"'), 'a\nb says "hi"');
});
