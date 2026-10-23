import { Suspense } from "react";
import { DatabaseZap } from "lucide-react";
import { PushControls } from "@/components/notify/push-controls";
import { SettingsForm } from "@/components/notify/settings-form";
import { requireUser } from "@/lib/auth";
import { getSettings, listEndpoints, listInbox, type InboxItem } from "@/lib/notify/queries";
import type { Settings } from "@/lib/notify/plan";
import { InboxList } from "@/components/notify/inbox-list";
import { nexus } from "@/lib/nexus";
import { markAllRead } from "./actions";

export const metadata = { title: "Inbox · Orbit" };

type Loaded = { items: InboxItem[]; settings: Settings; endpoints: string[]; details: Record<string, string> } | { error: true };

/** Full text for announcement notifications, keyed by notification id. Nexus being down just means no extra text. */
async function announcementDetails(items: InboxItem[]): Promise<Record<string, string>> {
  const wanted = items.filter((i) => i.kind === "announcement");
  if (!wanted.length) return {};
  try {
    const byId = new Map((await nexus.announcements(60)).map((a) => [a.id, a]));
    const out: Record<string, string> = {};
    for (const i of wanted) {
      const a = byId.get(i.ref.replace(/^announcement:/, ""));
      if (a?.body) out[i.id] = a.body.replace(/<[^>]*>/g, "").trim();
    }
    return out;
  } catch {
    return {};
  }
}

async function load(): Promise<Loaded> {
  await requireUser(); // outside try: redirect() throws
  try {
    const [items, settings, endpoints] = await Promise.all([listInbox(), getSettings(), listEndpoints()]);
    return { items, settings, endpoints, details: await announcementDetails(items) };
  } catch (err) {
    console.error("Inbox: load failed", err instanceof Error ? err.message : err);
    return { error: true };
  }
}

async function Content() {
  const data = await load();
  if ("error" in data) {
    return (
      <div className="glass mx-auto mt-16 max-w-lg p-8 text-center">
        <DatabaseZap className="mx-auto mb-4 size-8 text-muted" />
        <h1 className="font-display text-3xl">The inbox can&apos;t load.</h1>
        <p className="mt-2 text-sm text-muted">
          Run <code className="font-mono">supabase/migrations/20261024000000_notifications.sql</code> in the Supabase SQL editor, then refresh.
        </p>
      </div>
    );
  }

  const { items, settings, endpoints, details } = data;
  const unread = items.filter((i) => !i.read_at).length;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <div className="mb-3 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-muted">
          <span className="h-px w-8 bg-gradient-to-r from-violet to-cyan" />
          Inbox
        </div>
        <h1 className="font-display text-[clamp(2.6rem,7vw,5rem)] leading-[0.95] tracking-tight">
          <span className="text-gradient italic">Everything</span> that needs you.
        </h1>
      </header>

      <div className="flex flex-col gap-5">
        <PushControls vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} knownEndpoints={endpoints} />

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-3xl tracking-tight">
              Recent{unread > 0 && <span className="ml-3 align-middle text-sm font-sans text-pink">{unread} unread</span>}
            </h2>
            {unread > 0 && (
              <form action={markAllRead}>
                <button type="submit" className="text-sm text-muted transition-colors hover:text-text">
                  Mark all read
                </button>
              </form>
            )}
          </div>

          {items.length === 0 ? (
            <div className="glass p-10 text-center">
              <div className="font-display text-3xl">All quiet.</div>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted">Deadlines, task reminders and Nexus announcements will show up here as they happen.</p>
            </div>
          ) : (
            <InboxList items={items} details={details} />
          )}
        </section>

        <SettingsForm settings={settings} />
      </div>
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<div aria-busy className="skeleton mx-auto h-[520px] max-w-3xl rounded-[24px]" />}>
      <Content />
    </Suspense>
  );
}
