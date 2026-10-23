import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nexus } from "@/lib/nexus";
import { vapidFromEnv, sendPush } from "./send";
import type { AnnouncementIn, AssignmentIn, Planned, Settings, TaskIn } from "./plan";
import type { RunDeps } from "./run";

// Connects the scheduler to the real world. Uses the admin client, which skips row-level security,
// so EVERY query below filters by user_id by hand.

export type NexusSource = {
  assignments(): Promise<AssignmentIn[]>;
  announcements(): Promise<AnnouncementIn[]>;
};

/** The student's own Nexus data, read with their personal token from the server environment. */
export const liveNexus: NexusSource = {
  async assignments() {
    const all = await nexus.assignments("all");
    return all.map((a) => ({ id: a.id, title: a.title, course: a.course, dueAt: a.dueAt, submitted: a.submissionStatus === "submitted" }));
  },
  async announcements() {
    const all = await nexus.announcements(3);
    return all.map((a) => ({ id: a.id, title: a.title.replace(/^Important Announcement\s*:\s*/i, ""), postedAt: a.postedAt }));
  },
};

const DAY = 86_400_000;
const DEFAULT_ENABLED: Settings["enabled"] = { assignment: true, task: true, announcement: true, digest: true };
const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? ([] as unknown)) as T;
};

export function buildDeps(admin: SupabaseClient, source: NexusSource = liveNexus, opts: { agent?: import("node:https").Agent } = {}): RunDeps {
  const vapid = vapidFromEnv();

  return {
    async users() {
      const rows = must(await admin.from("notification_settings").select("user_id,enabled,quiet_start,quiet_end,announcements_cursor")) as {
        user_id: string;
        enabled: Partial<Settings["enabled"]> | null;
        quiet_start: number;
        quiet_end: number;
        announcements_cursor: string | null;
      }[];
      return rows.map((r) => ({
        userId: r.user_id,
        settings: {
          enabled: { ...DEFAULT_ENABLED, ...(r.enabled ?? {}) },
          quietStart: r.quiet_start,
          quietEnd: r.quiet_end,
          announcementsCursor: r.announcements_cursor,
        },
      }));
    },

    async data(userId) {
      const [assignments, announcements, tasks] = await Promise.all([
        source.assignments(),
        source.announcements(),
        admin
          .from("tasks")
          .select("id,title,due_at,due_has_time,remind_at,reminded_at,done_at")
          .eq("user_id", userId)
          .is("done_at", null)
          .limit(500)
          .then(must) as Promise<TaskIn[]>,
      ]);
      return { assignments, announcements, tasks };
    },

    async recentRefs(userId) {
      const since = new Date(Date.now() - 7 * DAY).toISOString();
      const rows = must(await admin.from("notifications").select("ref").eq("user_id", userId).gte("created_at", since)) as { ref: string }[];
      return new Set(rows.map((r) => r.ref));
    },

    async insertNotification(userId, n: Planned) {
      // The unique (user_id, ref) key makes a duplicate a silent no-op, so overlapping runs cannot double-send.
      const res = await admin
        .from("notifications")
        .upsert({ user_id: userId, kind: n.kind, ref: n.ref, title: n.title, body: n.body, url: n.url }, { onConflict: "user_id,ref", ignoreDuplicates: true })
        .select("id");
      const rows = must(res) as { id: string }[];
      return rows[0]?.id ?? null;
    },

    async markSent(id) {
      await admin.from("notifications").update({ sent_at: new Date().toISOString() }).eq("id", id);
    },

    async undelivered(userId) {
      const since = new Date(Date.now() - 3 * 3_600_000).toISOString();
      const rows = must(
        await admin
          .from("notifications")
          .select("id,kind,ref,title,body,url")
          .eq("user_id", userId)
          .is("sent_at", null)
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .limit(5),
      ) as { id: string; kind: Planned["kind"]; ref: string; title: string; body: string | null; url: string | null }[];
      return rows.filter((r) => r.kind !== "test").map((r) => ({ id: r.id, n: { kind: r.kind, ref: r.ref, title: r.title, body: r.body ?? "", url: r.url ?? "/" } }));
    },

    async subscriptions(userId) {
      return must(await admin.from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", userId)) as { endpoint: string; p256dh: string; auth: string }[];
    },

    push: (sub, payload, urgent) => sendPush(sub, payload, { vapid, urgent, agent: opts.agent }),

    async deleteSubscription(endpoint) {
      await admin.from("push_subscriptions").delete().eq("endpoint", endpoint);
    },

    async stampTasks(userId, ids) {
      await admin.from("tasks").update({ reminded_at: new Date().toISOString() }).eq("user_id", userId).in("id", ids);
    },

    async saveCursor(userId, cursor) {
      await admin.from("notification_settings").update({ announcements_cursor: cursor, updated_at: new Date().toISOString() }).eq("user_id", userId);
    },
  };
}
