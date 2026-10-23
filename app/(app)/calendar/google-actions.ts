"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { friendlyError, disconnect, dropCaches, listCalendars, savePrefs, status, syncUser } from "@/lib/gcal/service";
import { isOrbitCalendar } from "@/lib/gcal/calendars";
import { isGoogleConfigured } from "@/lib/gcal/oauth";
import { parsePrefs } from "@/lib/gcal/plan";
import { createClient } from "@/lib/supabase/server";

export type GoogleActionState = { status: "idle" | "ok" | "error" | "reconnect" | "setup"; message?: string };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function describe(s: { created: number; updated: number; removed: number; moved: number; errors: number }): string {
  const parts = [
    s.created && `${s.created} added`,
    s.updated && `${s.updated} updated`,
    s.removed && `${s.removed} removed`,
    s.moved && `${plural(s.moved, "task")} moved from Google`,
  ].filter(Boolean);
  const base = parts.length ? parts.join(", ") : "Everything was already up to date";
  return s.errors ? `${base}. ${plural(s.errors, "item")} couldn't be written.` : `${base}.`;
}

async function run(): Promise<GoogleActionState> {
  const user = await requireUser();
  const db = await createClient();
  try {
    const s = await syncUser(db, user.id);
    dropCaches(user.id);
    revalidatePath("/calendar");
    return { status: s.errors ? "error" : "ok", message: describe(s) };
  } catch (err) {
    const f = friendlyError(err);
    if (f.kind === "error") console.error("google sync failed", err instanceof Error ? err.message.slice(0, 300) : err);
    return { status: f.kind, message: f.message };
  }
}

// useActionState passes the previous state as the first argument.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function syncGoogleNow(_prev: GoogleActionState): Promise<GoogleActionState> {
  return run();
}

/** Saves what to sync, then syncs so the change shows up straight away. */
export async function saveGooglePrefs(raw: unknown): Promise<GoogleActionState> {
  const user = await requireUser();
  const db = await createClient();
  await savePrefs(db, user.id, parsePrefs(raw));
  dropCaches(user.id);
  return run();
}

export async function disconnectGoogle() {
  const user = await requireUser();
  await disconnect(await createClient(), user.id);
  dropCaches(user.id);
  revalidatePath("/calendar");
}

export type CalendarChoice = { id: string; name: string; color: string | null; primary: boolean; hidden: boolean; isOrbit: boolean };

export async function loadGoogleCalendars(): Promise<{ calendars: CalendarChoice[]; error?: string }> {
  const user = await requireUser();
  const db = await createClient();
  try {
    const st = await status(db, user.id, isGoogleConfigured());
    const list = await listCalendars(db, user.id);
    return {
      calendars: list
        .filter((c) => c.accessRole !== "freeBusyReader")
        .map((c) => ({ id: c.id, name: c.summary, color: c.backgroundColor ?? null, primary: !!c.primary, hidden: st.prefs.hiddenCalendars.includes(c.id), isOrbit: c.id === st.calendarId || isOrbitCalendar(c) })),
    };
  } catch (err) {
    return { calendars: [], error: friendlyError(err).message };
  }
}
