import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { decrypt, encrypt } from "../lib/crypto";

const key = () => randomBytes(32).toString("base64");

describe("token encryption", () => {
  it("round-trips, including unicode and long values", () => {
    const k = key();
    for (const v of ["", "a", "at_abc123", "नमस्ते 🔐 token", "x".repeat(5000)]) {
      assert.equal(decrypt(encrypt(v, k), k), v);
    }
  });

  it("never produces the same ciphertext twice (fresh IV each time)", () => {
    const k = key();
    assert.notEqual(encrypt("same", k), encrypt("same", k));
  });

  it("does not contain the plaintext", () => {
    const k = key();
    assert.ok(!encrypt("super-secret-refresh-token", k).includes("super-secret"));
  });

  it("rejects the wrong key", () => {
    const blob = encrypt("secret", key());
    assert.throws(() => decrypt(blob, key()));
  });

  it("rejects tampered data (authenticated encryption)", () => {
    const k = key();
    const [v, iv, tag, ct] = encrypt("secret", k).split(".");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 0xff;
    assert.throws(() => decrypt([v, iv, tag, flipped.toString("base64url")].join("."), k));
    assert.throws(() => decrypt([v, iv, Buffer.alloc(16).toString("base64url"), ct].join("."), k));
  });

  it("rejects malformed input and bad keys with clear errors", () => {
    const k = key();
    assert.throws(() => decrypt("garbage", k), /Unrecognised/);
    assert.throws(() => decrypt("v9.a.b.c", k), /Unrecognised/);
    assert.throws(() => encrypt("x", ""), /not set/); // an empty key counts as missing, whatever the environment holds
    assert.throws(() => encrypt("x", "dG9vc2hvcnQ="), /32 bytes/);
  });
});
