// A stand-in for a browser's push service (Apple's, Google's, Mozilla's), over HTTPS with a throwaway
// certificate. It also plays the receiving phone: it holds the subscription's private key and decrypts each
// push the way a real device does (RFC 8291), so tests prove the payload is built and encrypted correctly.
import { createDecipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import https from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Received = { path: string; headers: Record<string, string | string[] | undefined>; body: Buffer };

export type FakeDevice = {
  endpoint: string;
  p256dh: string;
  auth: string;
  /** Decrypts a push body addressed to this device. */
  decrypt(body: Buffer): string;
};

export async function startFakePush() {
  const dir = mkdtempSync(join(tmpdir(), "fakepush-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });

  const received: Received[] = [];
  const statusFor = new Map<string, number>(); // path -> status to answer with
  const server = https.createServer({ key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(statusFor.get(req.url ?? "") ?? 201);
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;

  function device(id: string): FakeDevice {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const authSecret = randomBytes(16);
    const uaPublic = ecdh.getPublicKey();
    return {
      endpoint: `https://localhost:${port}/push/${id}`,
      p256dh: uaPublic.toString("base64url"),
      auth: authSecret.toString("base64url"),
      decrypt(body: Buffer) {
        const salt = body.subarray(0, 16);
        const idLen = body[20];
        const asPublic = body.subarray(21, 21 + idLen);
        const record = body.subarray(21 + idLen);
        const secret = ecdh.computeSecret(asPublic);
        const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
        const ikm = Buffer.from(hkdfSync("sha256", secret, authSecret, keyInfo, 32));
        const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
        const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
        const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
        decipher.setAuthTag(record.subarray(record.length - 16));
        const plain = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
        let end = plain.length;
        while (end > 0 && plain[end - 1] === 0) end--;
        if (plain[end - 1] !== 2) throw new Error("missing padding delimiter");
        return plain.subarray(0, end - 1).toString("utf8");
      },
    };
  }

  return {
    received,
    port,
    device,
    /** Make a device's endpoint answer with this status (410 = unsubscribed). */
    respondWith: (d: FakeDevice, status: number) => statusFor.set(new URL(d.endpoint).pathname, status),
    agent: new https.Agent({ rejectUnauthorized: false }),
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
