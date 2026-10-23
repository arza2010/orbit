import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import webpush from "web-push";
import type { Planned, Settings, TaskIn } from "../lib/notify/plan";
import { runNotifications, type RunDeps, type UserData, type UserState } from "../lib/notify/run";
import { sendPush, type PushSub } from "../lib/notify/send";
import { startFakePush, type FakeDevice } from "./support/fake-push";

const ist = (s: string) => Date.parse(s.replace(" ", "T") + ":00+05:30");
const iso = (s: string) => new Date(ist(s)).toISOString();
const NOW = ist("2026-10-21 21:30");

const k = webpush.generateVAPIDKeys();
const VAPID = { publicKey: k.publicKey, privateKey: k.privateKey, subject: "mailto:test@example.com" };

const SETTINGS: Settings = {
  enabled: { assignment: true, task: true, announcement: true, digest: false },
  quietStart: 23,
  quietEnd: 7,
  announcementsCursor: "2026-10-20T00:00:00.000Z",
};

type Row = { id: string; userId: string; n: Planned; createdAt: number; sent: boolean };

describe("a full scheduler run", async () => {
  const svc = await startFakePush();
  after(() => svc.close());

  let rows: Row[];
  let subs: Map<string, (PushSub & { dev: FakeDevice })[]>;
  let tasks: TaskIn[];
  let cursors: Map<string, string>;
  let counts: { push: number; markSent: number };
  let seq: number;
  let users: UserState[];
  let data: (id: string) => Promise<UserData>;
  let nowMs: number;

  const device = (id: string) => {
    const dev = svc.device(id);
    return { endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth, dev };
  };

  const deps = (): RunDeps => ({
    users: async () => users,
    data: (id) => data(id),
    recentRefs: async (id) => new Set(rows.filter((r) => r.userId === id).map((r) => r.n.ref)),
    insertNotification: async (userId, n) => {
      if (rows.some((r) => r.userId === userId && r.n.ref === n.ref)) return null; // the unique key
      const id = `row-${++seq}`;
      rows.push({ id, userId, n, createdAt: nowMs, sent: false });
      return id;
    },
    markSent: async (id) => {
      counts.markSent++;
      const r = rows.find((x) => x.id === id);
      if (r) r.sent = true;
    },
    undelivered: async (userId) => rows.filter((r) => r.userId === userId && !r.sent && nowMs - r.createdAt < 3 * 3_600_000).map((r) => ({ id: r.id, n: r.n })),
    subscriptions: async (userId) => subs.get(userId) ?? [],
    push: async (sub, payload, urgent) => {
      counts.push++;
      return sendPush(sub, payload, { vapid: VAPID, urgent, agent: svc.agent });
    },
    deleteSubscription: async (endpoint) => {
      for (const [u, list] of subs) subs.set(u, list.filter((s) => s.endpoint !== endpoint));
    },
    stampTasks: async (_u, ids) => {
      tasks = tasks.map((t) => (ids.includes(t.id) ? { ...t, reminded_at: new Date(nowMs).toISOString() } : t));
    },
    saveCursor: async (u, c) => void cursors.set(u, c),
  });

  const run = () => runNotifications(deps(), nowMs);
  const decrypted = (d: FakeDevice) => svc.received.filter((r) => r.path === new URL(d.endpoint).pathname).map((r) => JSON.parse(d.decrypt(r.body)));

  beforeEach(() => {
    rows = [];
    subs = new Map();
    cursors = new Map();
    counts = { push: 0, markSent: 0 };
    seq = 0;
    nowMs = NOW;
    svc.received.length = 0;
    tasks = [{ id: "bill", title: "Pay electricity bill", due_at: iso("2026-10-21 22:00"), due_has_time: true, remind_at: iso("2026-10-21 21:00"), reminded_at: null, done_at: null }];
    users = [{ userId: "u1", settings: SETTINGS }];
    data = async () => ({
      assignments: [{ id: "a1", title: "Mid-Term Assignment", course: "Data 102", dueAt: iso("2026-10-21 23:59"), submitted: false }],
      tasks,
      announcements: [],
    });
  });

  it("creates inbox rows, pushes to the phone, and stamps the task", async () => {
    const phone = device("phone");
    subs.set("u1", [phone]);
    const s = await run();
    assert.equal(s.created, 2);
    assert.equal(s.delivered, 2);
    assert.deepEqual(decrypted(phone.dev).map((p) => p.title).sort(), ["Due in 2h 29m: Mid-Term Assignment", "Pay electricity bill"]);
    assert.equal(rows.filter((r) => r.sent).length, 2);
    assert.ok(tasks[0].reminded_at, "the task is stamped so it never fires again");
  });

  it("is idempotent: a second run sends nothing more", async () => {
    subs.set("u1", [device("phone")]);
    await run();
    const before = counts.push;
    const s = await run();
    assert.equal(s.created, 0);
    assert.equal(counts.push, before);
  });

  it("sends each alert once even when two runs overlap", async () => {
    const phone = device("phone");
    subs.set("u1", [phone]);
    await Promise.all([run(), run()]);
    assert.equal(rows.length, 2);
    assert.equal(decrypted(phone.dev).length, 2, "exactly one push per notification");
  });

  it("delivers to every device", async () => {
    const phone = device("phone");
    const mac = device("mac");
    subs.set("u1", [phone, mac]);
    await run();
    assert.equal(decrypted(phone.dev).length, 2);
    assert.equal(decrypted(mac.dev).length, 2);
  });

  it("removes a device that has unsubscribed and still reaches the others", async () => {
    const dead = device("dead");
    const live = device("live");
    svc.respondWith(dead.dev, 410);
    subs.set("u1", [dead, live]);
    const s = await run();
    assert.equal(s.removedSubscriptions, 2); // it was tried for each of the two notifications
    assert.equal(subs.get("u1")?.length, 1);
    assert.equal(subs.get("u1")?.[0].endpoint, live.endpoint);
    assert.equal(decrypted(live.dev).length, 2);
    assert.equal(rows.filter((r) => r.sent).length, 2);
  });

  it("keeps notifications in the inbox when no device is registered, and delivers them once one is", async () => {
    const s1 = await run();
    assert.equal(s1.created, 2);
    assert.equal(s1.delivered, 0);
    assert.equal(counts.markSent, 0);
    assert.equal(rows.length, 2, "they are in the inbox either way");

    const phone = device("late");
    subs.set("u1", [phone]);
    nowMs += 10 * 60_000;
    const s2 = await run();
    assert.equal(s2.created, 0);
    assert.equal(s2.delivered, 2, "the earlier ones are retried");
    assert.equal(decrypted(phone.dev).length, 2);
  });

  it("retries a push that failed, without creating a duplicate", async () => {
    const phone = device("flaky");
    svc.respondWith(phone.dev, 503);
    subs.set("u1", [phone]);
    const s1 = await run();
    assert.equal(s1.delivered, 0);
    assert.equal(rows.length, 2);

    svc.respondWith(phone.dev, 201);
    nowMs += 5 * 60_000;
    const s2 = await run();
    assert.equal(s2.created, 0);
    assert.equal(s2.delivered, 2);
    assert.equal(rows.length, 2);
  });

  it("stops retrying after three hours", async () => {
    const phone = device("old");
    svc.respondWith(phone.dev, 503);
    subs.set("u1", [phone]);
    await run();
    svc.respondWith(phone.dev, 201);
    nowMs += 3 * 3_600_000 + 60_000; // also past the quiet window start? 00:31 is quiet, so wait until morning
    nowMs = ist("2026-10-22 08:00");
    const s = await run();
    assert.equal(s.delivered, 0);
  });

  it("does nothing during quiet hours, not even retries", async () => {
    const phone = device("quiet");
    svc.respondWith(phone.dev, 503);
    subs.set("u1", [phone]);
    await run();
    svc.respondWith(phone.dev, 201);
    const before = counts.push;
    nowMs = ist("2026-10-21 23:30");
    const s = await run();
    assert.equal(s.created, 0);
    assert.equal(counts.push, before);
  });

  it("one user's failure does not stop the others", async () => {
    const phone = device("u2phone");
    subs.set("u2", [phone]);
    users = [
      { userId: "u1", settings: SETTINGS },
      { userId: "u2", settings: SETTINGS },
    ];
    data = async (id) => {
      if (id === "u1") throw new Error("Nexus is down");
      return { assignments: [{ id: "a2", title: "Case write-up", course: null, dueAt: iso("2026-10-21 22:30"), submitted: false }], tasks: [], announcements: [] };
    };
    const s = await run();
    assert.equal(s.users, 2);
    assert.equal(s.errors.length, 1);
    assert.match(s.errors[0].message, /Nexus is down/);
    assert.equal(decrypted(phone.dev).length, 1);
  });

  it("saves the announcement cursor only when it moved", async () => {
    data = async () => ({ assignments: [], tasks: [], announcements: [{ id: "n1", title: "Office hours open", postedAt: iso("2026-10-21 20:00") }] });
    subs.set("u1", [device("p")]);
    await run();
    assert.equal(cursors.get("u1"), iso("2026-10-21 20:00"));
    cursors.clear();
    users = [{ userId: "u1", settings: { ...SETTINGS, announcementsCursor: iso("2026-10-21 20:00") } }];
    await run();
    assert.equal(cursors.size, 0);
  });

  it("pushes a Nexus announcement to the phone", async () => {
    const phone = device("ann");
    subs.set("u1", [phone]);
    data = async () => ({ assignments: [], tasks: [], announcements: [{ id: "n1", title: "Parth is opening 10 office hour slots", postedAt: iso("2026-10-21 20:00") }] });
    await run();
    const got = decrypted(phone.dev);
    assert.equal(got.length, 1);
    assert.equal(got[0].title, "Parth is opening 10 office hour slots");
    assert.equal(got[0].url, "/inbox");
  });
});
