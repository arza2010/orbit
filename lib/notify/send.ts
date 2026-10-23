import "server-only";
import type { Agent } from "node:https";
import webpush from "web-push";

export type PushSub = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url: string; ref: string };
export type SendResult = "ok" | "gone" | "error";

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/**
 * Push services reject messages over about 4 KB, and some text (Nexus announcements) is written by
 * other people. Keep it short enough to always go through, and short enough to read on a lock screen.
 */
export function fitPayload(p: PushPayload): PushPayload {
  return { title: clip(p.title, 120), body: clip(p.body, 220), url: clip(p.url, 200), ref: clip(p.ref, 120) };
}

export function vapidFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) throw new Error("VAPID keys are not set in the environment");
  return { publicKey, privateKey, subject };
}

/** Sends one push. "gone" means the browser unsubscribed, so the caller should delete the subscription. */
export async function sendPush(
  sub: PushSub,
  payload: PushPayload,
  opts: { vapid?: ReturnType<typeof vapidFromEnv>; urgent?: boolean; agent?: Agent } = {},
): Promise<SendResult> {
  const vapid = opts.vapid ?? vapidFromEnv();
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(fitPayload(payload)), {
      TTL: 60 * 60 * 12, // if the phone is off, still deliver within 12 hours, then drop it
      urgency: opts.urgent ? "high" : "normal",
      vapidDetails: vapid,
      ...(opts.agent ? { agent: opts.agent } : {}),
    });
    return "ok";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("push failed", status ?? (err instanceof Error ? err.message.slice(0, 100) : "unknown"));
    return "error";
  }
}
