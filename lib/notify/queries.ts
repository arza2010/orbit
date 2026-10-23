import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Kind, Settings } from "./plan";

// Reads for the signed-in user (row-level security applies).

export type InboxItem = { id: string; ref: string; kind: Kind; title: string; body: string | null; url: string | null; created_at: string; read_at: string | null };

export const DEFAULT_SETTINGS: Settings = {
  enabled: { assignment: true, task: true, announcement: true, digest: true },
  quietStart: 23,
  quietEnd: 7,
  announcementsCursor: null,
};

export async function listInbox(limit = 60): Promise<InboxItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id,ref,kind,title,body,url,created_at,read_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as InboxItem[];
}

export async function unreadCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getSettings(): Promise<Settings> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("notification_settings").select("enabled,quiet_start,quiet_end,announcements_cursor").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return DEFAULT_SETTINGS;
  return {
    enabled: { ...DEFAULT_SETTINGS.enabled, ...((data.enabled as Partial<Settings["enabled"]> | null) ?? {}) },
    quietStart: data.quiet_start as number,
    quietEnd: data.quiet_end as number,
    announcementsCursor: (data.announcements_cursor as string | null) ?? null,
  };
}

export async function listEndpoints(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("push_subscriptions").select("endpoint");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.endpoint as string);
}
