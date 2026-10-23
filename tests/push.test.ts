import assert from "node:assert/strict";
import { createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";
import { after, describe, it } from "node:test";
import webpush from "web-push";
import { fitPayload, sendPush, vapidFromEnv } from "../lib/notify/send";
import { startFakePush } from "./support/fake-push";

const vapidKeys = webpush.generateVAPIDKeys();
const VAPID = { publicKey: vapidKeys.publicKey, privateKey: vapidKeys.privateKey, subject: "mailto:test@example.com" };

describe("sending a web push (real encryption, fake push service)", async () => {
  const svc = await startFakePush();
  after(() => svc.close());
  const last = () => svc.received[svc.received.length - 1];

  it("delivers a payload the receiving device can decrypt exactly", async () => {
    const dev = svc.device("a");
    const payload = { title: "Due in 2h 29m: Mid-Term Assignment", body: "Data 102 · Wed, 21 Oct, 11:59 pm", url: "/courses", ref: "assignment:x:3h" };
    assert.equal(await sendPush({ endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth }, payload, { vapid: VAPID, agent: svc.agent }), "ok");
    assert.deepEqual(JSON.parse(dev.decrypt(last().body)), payload);
  });

  it("round-trips Hindi, Marathi and emoji without corruption", async () => {
    const dev = svc.device("uni");
    const payload = { title: "बिल भरना ₹1,250 💡", body: "आज शाम 5 बजे · भेट", url: "/life?tab=tasks", ref: "task:1" };
    await sendPush({ endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth }, payload, { vapid: VAPID, agent: svc.agent });
    assert.deepEqual(JSON.parse(dev.decrypt(last().body)), payload);
  });

  it("sends the headers push services require", async () => {
    const dev = svc.device("hdr");
    await sendPush({ endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth }, { title: "t", body: "b", url: "/", ref: "r" }, { vapid: VAPID, agent: svc.agent, urgent: true });
    const h = last().headers;
    assert.equal(h["content-encoding"], "aes128gcm");
    assert.equal(h["ttl"], String(60 * 60 * 12));
    assert.equal(h["urgency"], "high");
    assert.match(String(h["authorization"]), /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
  });

  it("uses normal urgency for non-urgent kinds", async () => {
    const dev = svc.device("normal");
    await sendPush({ endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth }, { title: "t", body: "b", url: "/", ref: "r" }, { vapid: VAPID, agent: svc.agent });
    assert.equal(last().headers["urgency"], "normal");
  });

  it("signs with a valid VAPID token: right audience, subject, expiry and signature", async () => {
    const dev = svc.device("jwt");
    await sendPush({ endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth }, { title: "t", body: "b", url: "/", ref: "r" }, { vapid: VAPID, agent: svc.agent });
    const auth = String(last().headers["authorization"]);
    const jwt = /t=([^,]+),/.exec(auth)?.[1] as string;
    const k = /k=(.+)$/.exec(auth)?.[1] as string;
    assert.equal(k, VAPID.publicKey, "the public key sent must be ours");
    const [h, c, sig] = jwt.split(".");
    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    assert.equal(JSON.parse(Buffer.from(h, "base64url").toString()).alg, "ES256");
    assert.equal(claims.aud, `https://localhost:${svc.port}`);
    assert.equal(claims.sub, VAPID.subject);
    const ttl = claims.exp - Math.floor(Date.now() / 1000);
    assert.ok(ttl > 0 && ttl <= 24 * 3600, `token must expire within 24h (was ${ttl}s)`);

    const raw = Buffer.from(VAPID.publicKey, "base64url");
    const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: raw.subarray(1, 33).toString("base64url"), y: raw.subarray(33).toString("base64url") }, format: "jwk" });
    assert.ok(createVerify("SHA256").update(`${h}.${c}`).verify({ key, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url")), "signature must verify");
  });

  it("reports an unsubscribed device (404 or 410) as gone", async () => {
    for (const status of [404, 410]) {
      const dev = svc.device(`gone${status}`);
      svc.respondWith(dev, status);
      assert.equal(await sendPush({ endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth }, { title: "t", body: "b", url: "/", ref: "r" }, { vapid: VAPID, agent: svc.agent }), "gone");
    }
  });

  it("reports transient failures as errors, not gone, so the subscription is kept", async () => {
    for (const status of [429, 500, 503]) {
      const dev = svc.device(`err${status}`);
      svc.respondWith(dev, status);
      assert.equal(await sendPush({ endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth }, { title: "t", body: "b", url: "/", ref: "r" }, { vapid: VAPID, agent: svc.agent }), "error");
    }
  });

  it("shortens very long text so a push service never rejects it, and keeps short text untouched", async () => {
    const dev = svc.device("big");
    const big = { title: "x".repeat(5000), body: "y".repeat(5000), url: "/", ref: "r" };
    assert.equal(await sendPush({ endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth }, big, { vapid: VAPID, agent: svc.agent }), "ok");
    assert.ok(last().body.length < 1500, "encrypted message stays small");
    const got = JSON.parse(dev.decrypt(last().body));
    assert.equal(got.title.length, 120);
    assert.ok(got.title.endsWith("…") && got.body.endsWith("…"));
    assert.deepEqual(fitPayload({ title: "Short", body: "Fine", url: "/a", ref: "r" }), { title: "Short", body: "Fine", url: "/a", ref: "r" });
  });

  it("does not throw on a malformed subscription", async () => {
    const dev = svc.device("bad");
    assert.equal(await sendPush({ endpoint: dev.endpoint, p256dh: "not-a-key", auth: "x" }, { title: "t", body: "b", url: "/", ref: "r" }, { vapid: VAPID, agent: svc.agent }), "error");
  });

  it("fails clearly when the VAPID keys are missing", () => {
    assert.throws(() => vapidFromEnv({} as NodeJS.ProcessEnv), /VAPID/);
    assert.deepEqual(vapidFromEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b", VAPID_SUBJECT: "mailto:x@y.z" } as unknown as NodeJS.ProcessEnv), { publicKey: "a", privateKey: "b", subject: "mailto:x@y.z" });
  });

  void generateKeyPairSync;
});
