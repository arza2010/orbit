import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM. Output: "v1.<iv>.<tag>.<ciphertext>" (base64url). GCM authenticates the data,
// so a tampered or wrongly-keyed value fails loudly instead of decrypting to garbage.

const VERSION = "v1";

function loadKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY is not set in .env.local");
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return key;
}

export function encrypt(plain: string, rawKey: string | undefined = process.env.TOKEN_ENCRYPTION_KEY): string {
  const key = loadKey(rawKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string, rawKey: string | undefined = process.env.TOKEN_ENCRYPTION_KEY): string {
  const key = loadKey(rawKey);
  const parts = payload.split(".");
  const [version, iv, tag, ct] = parts;
  // An empty plaintext has an empty ciphertext, so check presence, not truthiness.
  if (parts.length !== 4 || version !== VERSION || !iv || !tag) throw new Error("Unrecognised encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
