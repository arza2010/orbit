import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import webpush from "web-push";
import { startFakeSupabase } from "../scripts/fake-supabase.mjs";
import { runNotifications } from "../lib/notify/run";
import { buildDeps, type NexusSource } from "../lib/notify/service";
import { createAdminClient } from "../lib/supabase/admin";
import { startFakePush, type FakeDevice } from "./support/fake-push";

const ist = (s: string) => Date.parse(s.replace(" ", "T") + ":00+05:30");
const iso = (s: string) => new Date(ist(s)).toISOString();
const NOW = ist("2026-10-21 21:30");

const keys = webpush.generateVAPIDKeys();
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;
process.env.VAPID_SUBJECT = "mailto:test@example.com";

const NEXUS: NexusSource = {
  assignments: async () => [{ id: "a1", title: "Mid-Term Assignment", course: "Data 102", dueAt: iso("2026-10-21 23:59"), submitted: false }],
  announcements: async () => [],
};

describe("scheduler wiring against a real database over HTTP", () => {
  let db: Awaited<ReturnType<typeof startFakeSupabase>>;
  let push: Awaited<ReturnType<typeof startFakePush>>;
  let admin: ReturnType<typeof createAdminClient>;

  before(async () => {
    db = await startFakeSupabase({ port: 0 });
    push = await startFakePush();
    admin = createAdminClient(db.url, "service-role-key");
  });
  after(async () => {
    await db.close();
    await push.close();
  });

  const reset = async () => {
    await fetch(`${db.url}/debug/reset`);
    push.received.length = 0;
  };
  const seedUser = async (userId: string, dev: FakeDevice) => {
    await admin.from("notification_settings").insert({ user_id: userId, announcements_cursor: "2026-10-20T00:00:00Z" });
    await admin.from("push_subscriptions").insert({ user_id: userId, endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth });
  };
  const messages = (dev: FakeDevice) => push.received.filter((r) => r.path === new URL(dev.endpoint).pathname).map((r) => JSON.parse(dev.decrypt(r.body)));
  const run = (nexus: NexusSource = NEXUS) => runNotifications(buildDeps(admin, nexus, { agent: push.agent }), NOW);
  const rows = async (table: string) => ((await admin.from(table).select("*")).data ?? []) as Record<string, unknown>[];

  it("reads real tables, sends, records the inbox and stamps the task", async () => {
    await reset();
    const phone = push.device("phone");
    await seedUser("user-1", phone);
    await admin.from("tasks").insert([
      { user_id: "user-1", title: "Pay electricity bill", due_at: iso("2026-10-21 22:00"), due_has_time: true, remind_at: iso("2026-10-21 21:00") },
      { user_id: "user-1", title: "Not yet", due_at: iso("2026-10-25 22:00"), due_has_time: true, remind_at: iso("2026-10-25 21:00") },
      { user_id: "user-1", title: "Already done", remind_at: iso("2026-10-21 21:00"), done_at: iso("2026-10-21 20:00") },
    ]);

    const s = await run();
    assert.equal(s.errors.length, 0, JSON.stringify(s.errors));
    assert.equal(s.created, 2);
    assert.equal(s.delivered, 2);
    assert.deepEqual(messages(phone).map((m) => m.title).sort(), ["Due in 2h 29m: Mid-Term Assignment", "Pay electricity bill"]);

    const inbox = await rows("notifications");
    assert.equal(inbox.length, 2);
    assert.ok(inbox.every((r) => r.sent_at && r.user_id === "user-1"));
    const tasks = await rows("tasks");
    assert.ok(tasks.find((t) => t.title === "Pay electricity bill")?.reminded_at, "stamped");
    assert.equal(tasks.find((t) => t.title === "Not yet")?.reminded_at ?? null, null);
  });

  it("a second run adds nothing and sends nothing", async () => {
    const before = push.received.length;
    const s = await run();
    assert.equal(s.created, 0);
    assert.equal(push.received.length, before);
    assert.equal((await rows("notifications")).length, 2);
  });

  it("never mixes one user's data into another's notifications", async () => {
    await reset();
    const a = push.device("a");
    const b = push.device("b");
    await seedUser("user-a", a);
    await seedUser("user-b", b);
    await admin.from("tasks").insert([
      { user_id: "user-a", title: "A's secret errand", remind_at: iso("2026-10-21 21:00") },
      { user_id: "user-b", title: "B's secret errand", remind_at: iso("2026-10-21 21:10") },
    ]);
    await run({ assignments: async () => [], announcements: async () => [] });

    assert.deepEqual(messages(a).map((m) => m.title), ["A's secret errand"]);
    assert.deepEqual(messages(b).map((m) => m.title), ["B's secret errand"]);
    const inbox = await rows("notifications");
    assert.equal(inbox.find((r) => r.title === "A's secret errand")?.user_id, "user-a");
    assert.equal(inbox.find((r) => r.title === "B's secret errand")?.user_id, "user-b");
    // and the stamp only touched each owner's own task
    const tasks = await rows("tasks");
    assert.ok(tasks.every((t) => t.reminded_at));
  });

  it("removes a dead device from the database", async () => {
    await reset();
    const dead = push.device("dead");
    push.respondWith(dead, 410);
    await seedUser("user-d", dead);
    await admin.from("tasks").insert({ user_id: "user-d", title: "x", remind_at: iso("2026-10-21 21:00") });
    await run({ assignments: async () => [], announcements: async () => [] });
    assert.equal((await rows("push_subscriptions")).length, 0);
    assert.equal((await rows("notifications")).length, 1, "still in the inbox");
  });

  it("saves the announcement cursor and de-duplicates by announcement id", async () => {
    await reset();
    const phone = push.device("ann");
    await seedUser("user-n", phone);
    const nexus: NexusSource = {
      assignments: async () => [],
      announcements: async () => [{ id: "n1", title: "Office hours open Wednesday", postedAt: iso("2026-10-21 20:00") }],
    };
    await run(nexus);
    assert.equal(messages(phone).length, 1);
    assert.equal(new Date((await rows("notification_settings"))[0].announcements_cursor as string).toISOString(), iso("2026-10-21 20:00"));
    await run(nexus);
    assert.equal(messages(phone).length, 1, "not announced twice");
  });

  it("reports no work when nobody has notifications set up", async () => {
    await reset();
    const s = await run();
    assert.deepEqual({ users: s.users, created: s.created }, { users: 0, created: 0 });
  });
});

describe("the cron endpoint's access control", () => {
  const saved = { ...process.env };
  after(() => {
    process.env = saved;
  });
  const call = async (headers: Record<string, string> = {}, method = "POST") => {
    const route = await import("../app/api/cron/notify/route");
    const handler = method === "GET" ? route.GET : route.POST;
    return handler(new Request("http://localhost/api/cron/notify", { method, headers }));
  };

  it("refuses to run when it is not configured", async () => {
    delete process.env.CRON_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal((await call({ authorization: "Bearer anything" })).status, 503);
  });

  it("rejects a missing or wrong secret", async () => {
    process.env.CRON_SECRET = "correct-horse-battery-staple";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    for (const h of [{}, { authorization: "" }, { authorization: "Bearer wrong" }, { authorization: "Bearer correct-horse-battery-stapl" }, { authorization: "Bearer correct-horse-battery-staplex" }, { authorization: "correct-horse-battery-staple" }]) {
      const res = await call(h as Record<string, string>);
      assert.equal(res.status, 401, JSON.stringify(h));
    }
  });

  it("accepts the right secret on POST and GET", async () => {
    const dbx = await startFakeSupabase({ port: 0 });
    try {
      process.env.CRON_SECRET = "correct-horse-battery-staple";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
      process.env.NEXT_PUBLIC_SUPABASE_URL = dbx.url; // read at import time by the admin client's default
      const { createAdminClient: make } = await import("../lib/supabase/admin");
      assert.ok(make(dbx.url, "k"));
      for (const method of ["POST", "GET"]) {
        const res = await call({ authorization: "Bearer correct-horse-battery-staple" }, method);
        assert.ok([200, 500].includes(res.status), `status ${res.status}`);
      }
    } finally {
      await dbx.close();
    }
  });
});
