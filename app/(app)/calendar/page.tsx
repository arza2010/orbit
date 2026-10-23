import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { WifiOff } from "lucide-react";
import { CalendarSkeleton } from "@/components/calendar/skeleton";
import { CalendarView } from "@/components/calendar/calendar-view";
import { isDateKey, monthGrid, toCalEvent, type CalEvent, type View } from "@/lib/calendar";
import { isGoogleConfigured } from "@/lib/gcal/oauth";
import { DEFAULT_PREFS } from "@/lib/gcal/prefs";
import { readGoogleEvents, status as googleStatus } from "@/lib/gcal/service";
import { nexus } from "@/lib/nexus";
import { createClient } from "@/lib/supabase/server";
import { addDays, dayKey } from "@/lib/time";
import type { GooglePanelStatus, GoogleRead } from "@/components/calendar/google-panel";

// Syncing with Google runs as a Server Action started from this page, so it may take a while on the first run.
export const maxDuration = 120;

export const metadata = { title: "Calendar · Orbit" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type Loaded = { events: CalEvent[]; view: View; date: string; now: string; google: GooglePanelStatus; googleRead: GoogleRead };

const NO_GOOGLE = (configured: boolean): GooglePanelStatus => ({
  configured,
  connected: false,
  needsReconnect: false,
  account: null,
  prefs: DEFAULT_PREFS,
  lastSyncedAtMs: null,
  lastSync: null,
});

/** Google is an extra: if anything about it fails, the calendar still shows Nexus. */
async function loadGoogle(userId: string, fromKey: string, toKey: string): Promise<{ panel: GooglePanelStatus; read: GoogleRead; events: CalEvent[] }> {
  const configured = isGoogleConfigured();
  try {
    const db = await createClient();
    const st = await googleStatus(db, userId, configured);
    const read = st.connected ? await readGoogleEvents(db, userId, fromKey, toKey) : { status: "off" as const, events: [] };
    return {
      panel: { configured, connected: st.connected, needsReconnect: st.needsReconnect, account: st.account, prefs: st.prefs, lastSyncedAtMs: st.lastSyncedAtMs, lastSync: st.lastSync },
      read: read.status,
      events: read.events,
    };
  } catch (err) {
    console.error("Calendar: Google load failed", err instanceof Error ? err.message : err);
    return { panel: NO_GOOGLE(configured), read: "off", events: [] };
  }
}

async function load(sp: Record<string, string | string[] | undefined>): Promise<Loaded | null> {
  const user = await requireUser(); // outside try: redirect() throws
  try {
    const me = await nexus.me();
    const rawView = first(sp.view);
    const view: View = rawView === "month" || rawView === "day" || rawView === "week" ? rawView : "week";
    const rawDate = first(sp.date);
    const date = isDateKey(rawDate) ? rawDate : dayKey(me.now);

    const grid = monthGrid(date);
    const [events, g] = await Promise.all([
      nexus.schedule(`${grid[0]}T00:00:00+05:30`, `${addDays(grid[41], 1)}T00:00:00+05:30`),
      loadGoogle(user.id, grid[0], addDays(grid[41], 1)),
    ]);
    return { events: [...events.map(toCalEvent), ...g.events], view, date, now: me.now, google: g.panel, googleRead: g.read };
  } catch (err) {
    console.error("Calendar: Nexus load failed", err);
    return null;
  }
}

async function CalendarContent({ searchParams }: { searchParams: SearchParams }) {
  const data = await load(await searchParams);

  if (!data) {
    return (
      <div className="glass mx-auto mt-24 max-w-md p-8 text-center">
        <WifiOff className="mx-auto mb-4 size-8 text-muted" />
        <h1 className="font-display text-3xl">Can&apos;t reach Nexus.</h1>
        <p className="mt-2 text-sm text-muted">Check the connection and the token, then refresh.</p>
      </div>
    );
  }

  return (
    <CalendarView
      initialEvents={data.events}
      initialView={data.view}
      initialDate={data.date}
      serverNow={data.now}
      google={data.google}
      googleRead={data.googleRead}
      googleFlash={first((await searchParams).google) ?? null}
    />
  );
}

export default function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <CalendarContent searchParams={searchParams} />
    </Suspense>
  );
}
