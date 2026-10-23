import { planNotifications, type AnnouncementIn, type AssignmentIn, type Planned, type Settings, type TaskIn } from "./plan";
import type { PushPayload, PushSub, SendResult } from "./send";

// One scheduler run for every user. Free of any framework or network code; everything it touches is
// passed in, so it can be driven by tests. Order matters: the inbox row is written FIRST, and its
// unique key is what guarantees one alert is never sent twice, even if two runs overlap.

export type UserState = { userId: string; settings: Settings };
export type UserData = { assignments: AssignmentIn[]; tasks: TaskIn[]; announcements: AnnouncementIn[] };

export type RunDeps = {
  users(): Promise<UserState[]>;
  data(userId: string): Promise<UserData>;
  /** `ref`s of notifications created recently, for the planner's own de-duplication. */
  recentRefs(userId: string): Promise<Set<string>>;
  /** Returns the new row's id, or null if that ref already exists. */
  insertNotification(userId: string, n: Planned): Promise<string | null>;
  markSent(id: string): Promise<void>;
  /** Recent notifications that never reached any device (every push failed, or none was registered yet). */
  undelivered(userId: string): Promise<{ id: string; n: Planned }[]>;
  subscriptions(userId: string): Promise<PushSub[]>;
  push(sub: PushSub, payload: PushPayload, urgent: boolean): Promise<SendResult>;
  deleteSubscription(endpoint: string): Promise<void>;
  stampTasks(userId: string, taskIds: string[]): Promise<void>;
  saveCursor(userId: string, cursor: string): Promise<void>;
};

export type RunSummary = {
  users: number;
  created: number;
  delivered: number;
  removedSubscriptions: number;
  errors: { userId: string; message: string }[];
};

export async function runNotifications(deps: RunDeps, nowMs: number): Promise<RunSummary> {
  const summary: RunSummary = { users: 0, created: 0, delivered: 0, removedSubscriptions: 0, errors: [] };

  for (const user of await deps.users()) {
    summary.users++;
    try {
      const [data, sentRefs] = await Promise.all([deps.data(user.userId), deps.recentRefs(user.userId)]);
      const plan = planNotifications({ nowMs, ...data, settings: user.settings, sentRefs });

      const retries = plan.quiet ? [] : await deps.undelivered(user.userId);
      const subs = plan.notifications.length || retries.length ? await deps.subscriptions(user.userId) : [];
      const stamped: string[] = [];

      /** Pushes to every device. Returns true if at least one received it. */
      const deliver = async (n: Planned): Promise<boolean> => {
        let delivered = false;
        for (const sub of subs) {
          const result = await deps.push(sub, { title: n.title, body: n.body, url: n.url, ref: n.ref }, n.kind === "assignment" || n.kind === "task");
          if (result === "ok") delivered = true;
          if (result === "gone") {
            await deps.deleteSubscription(sub.endpoint);
            summary.removedSubscriptions++;
          }
        }
        return delivered;
      };

      for (const n of plan.notifications) {
        const id = await deps.insertNotification(user.userId, n);
        if (n.kind === "task") stamped.push(n.ref.slice("task:".length));
        if (!id) continue; // another run got there first
        summary.created++;
        if (await deliver(n)) {
          summary.delivered++;
          await deps.markSent(id);
        }
      }

      // Anything created earlier that never reached a device gets another go.
      if (subs.length) {
        for (const r of retries) {
          if (await deliver(r.n)) {
            summary.delivered++;
            await deps.markSent(r.id);
          }
        }
      }

      if (stamped.length) await deps.stampTasks(user.userId, stamped);
      if (plan.announcementsCursor && plan.announcementsCursor !== user.settings.announcementsCursor) {
        await deps.saveCursor(user.userId, plan.announcementsCursor);
      }
    } catch (err) {
      // One user's failure must not stop the others.
      summary.errors.push({ userId: user.userId, message: err instanceof Error ? err.message.slice(0, 160) : "Unknown error" });
    }
  }
  return summary;
}
