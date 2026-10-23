"use server";

import { io, revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { sendPush } from "@/lib/notify/send";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok?: boolean; error?: string; message?: string };

const b64url = z.string().regex(/^[A-Za-z0-9_-]+$/).min(10).max(200);

const Subscription = z.object({
  endpoint: z.string().url().max(2000).refine((u) => u.startsWith("https://"), "Push endpoints are always https."),
  p256dh: b64url,
  auth: b64url,
  userAgent: z.string().max(300).optional(),
});

/** Makes sure this user has a settings row, so the scheduler knows to look after them. */
async function ensureSettings() {
  const supabase = await createClient();
  await supabase.from("notification_settings").upsert({}, { onConflict: "user_id", ignoreDuplicates: true });
}

export async function savePushSubscription(input: z.input<typeof Subscription>): Promise<ActionResult> {
  await requireUser();
  const p = Subscription.safeParse(input);
  if (!p.success) return { error: "That device didn't give a valid subscription." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ endpoint: p.data.endpoint, p256dh: p.data.p256dh, auth: p.data.auth, user_agent: p.data.userAgent ?? null }, { onConflict: "endpoint" });
  if (error) return { error: "Couldn't save this device." };
  await ensureSettings();
  revalidatePath("/inbox");
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  await requireUser();
  if (!z.string().url().safeParse(endpoint).success) return { error: "Bad request." };
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  revalidatePath("/inbox");
  return { ok: true };
}

export async function sendTestNotification(): Promise<ActionResult> {
  await requireUser();
  await io();
  const supabase = await createClient();
  const { data: subs, error } = await supabase.from("push_subscriptions").select("endpoint,p256dh,auth");
  if (error) return { error: "Couldn't read your devices." };
  if (!subs?.length) return { error: "No device is registered yet. Turn notifications on first." };

  const payload = { title: "Notifications are working", body: "This is a test from Orbit.", url: "/inbox", ref: `test:${Date.now()}` };
  await supabase.from("notifications").insert({ kind: "test", ref: payload.ref, title: payload.title, body: payload.body, url: payload.url, sent_at: new Date().toISOString() });

  let ok = 0;
  for (const s of subs) {
    const r = await sendPush(s as { endpoint: string; p256dh: string; auth: string }, payload);
    if (r === "ok") ok++;
    if (r === "gone") await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
  }
  revalidatePath("/inbox");
  return ok ? { ok: true, message: `Sent to ${ok} ${ok === 1 ? "device" : "devices"}.` } : { error: "The push service didn't accept it. Try turning notifications off and on again." };
}

const Settings = z.object({
  assignment: z.boolean(),
  task: z.boolean(),
  announcement: z.boolean(),
  digest: z.boolean(),
  quietStart: z.coerce.number().int().min(0).max(23),
  quietEnd: z.coerce.number().int().min(0).max(23),
});

export async function updateNotificationSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const p = Settings.safeParse({
    assignment: fd.get("assignment") === "on",
    task: fd.get("task") === "on",
    announcement: fd.get("announcement") === "on",
    digest: fd.get("digest") === "on",
    quietStart: fd.get("quietStart"),
    quietEnd: fd.get("quietEnd"),
  });
  if (!p.success) return { error: "Check the quiet hours." };

  const supabase = await createClient();
  const { error } = await supabase.from("notification_settings").upsert(
    {
      enabled: { assignment: p.data.assignment, task: p.data.task, announcement: p.data.announcement, digest: p.data.digest },
      quiet_start: p.data.quietStart,
      quiet_end: p.data.quietEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: "Couldn't save the settings." };
  revalidatePath("/inbox");
  return { ok: true, message: "Saved." };
}

export async function markRead(id: string): Promise<void> {
  await requireUser();
  if (!z.string().uuid().safeParse(id).success) return;
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  revalidatePath("/inbox");
  revalidatePath("/", "layout");
}

export async function markAllRead(): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/inbox");
  revalidatePath("/", "layout");
}
