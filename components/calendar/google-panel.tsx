"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw, Unplug } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import {
  disconnectGoogle,
  loadGoogleCalendars,
  saveGooglePrefs,
  syncGoogleNow,
  type CalendarChoice,
  type GoogleActionState,
} from "@/app/(app)/calendar/google-actions";
import { CLASS_REMINDER_CHOICES, type Prefs } from "@/lib/gcal/prefs";
import { cn } from "@/lib/utils";

export type GooglePanelStatus = {
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  account: string | null;
  prefs: Prefs;
  lastSyncedAtMs: number | null;
  lastSync: { created: number; updated: number; removed: number; moved: number; errors: number; firstError?: string } | null;
};

export type GoogleRead = "off" | "ok" | "reconnect" | "error";

const AUTO_SYNC_AFTER_MS = 10 * 60_000;

const FLASH: Record<string, { tone: "good" | "bad"; text: string }> = {
  connected: { tone: "good", text: "Google Calendar is connected. Your classes, deadlines and tasks are being added to a calendar called Orbit." },
  denied: { tone: "bad", text: "You didn't approve access, so nothing was connected." },
  norefresh: { tone: "bad", text: "Google didn't allow ongoing access. Connect again and tick every box on the consent screen." },
  unconfigured: { tone: "bad", text: "Google sign-in isn't set up for this app yet (missing Google client ID or secret)." },
  error: { tone: "bad", text: "Couldn't finish connecting Google Calendar. Please try again." },
};

function ago(ms: number | null, now: number): string {
  if (ms === null) return "not synced yet";
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <rect x="3" y="4" width="18" height="17" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 9h18M8 2.5v3M16 2.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.6" fill="currentColor" />
    </svg>
  );
}

function Toggle({ label, hint, on, onChange, disabled }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3", disabled && "opacity-60")}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[var(--cyan)]" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-faint">{hint}</span>
      </span>
    </label>
  );
}

export function GooglePanel({
  status,
  read,
  flash,
  onChanged,
}: {
  status: GooglePanelStatus;
  read: GoogleRead;
  flash: string | null;
  /** Called after anything that may have changed what the calendar should show. */
  onChanged: () => void;
}) {
  const [state, sync, syncing] = useActionState<GoogleActionState>(syncGoogleNow, { status: "idle" });
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(status.prefs);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<GoogleActionState | null>(null);
  const [cals, setCals] = useState<CalendarChoice[] | null>(null);
  const [calError, setCalError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const started = useRef(false);
  const lastState = useRef(state);

  // Sync once when the calendar opens, if it has been a while. The ref stops React's dev double-run.
  useEffect(() => {
    if (!status.connected || status.needsReconnect || started.current) return;
    started.current = true;
    if (status.lastSyncedAtMs === null || Date.now() - status.lastSyncedAtMs > AUTO_SYNC_AFTER_MS) {
      startTransition(() => sync());
    }
  }, [status.connected, status.needsReconnect, status.lastSyncedAtMs, sync]);

  // A finished sync may have changed the calendar.
  useEffect(() => {
    if (state !== lastState.current && state.status !== "idle") {
      lastState.current = state;
      setNow(Date.now());
      onChanged();
    }
  }, [state, onChanged]);

  useEffect(() => {
    if (!open || cals) return;
    void loadGoogleCalendars().then((r) => (r.error ? setCalError(r.error) : setCals(r.calendars)));
  }, [open, cals]);

  const flashInfo = flash ? FLASH[flash] : undefined;
  const reconnect = status.needsReconnect || state.status === "reconnect" || read === "reconnect";
  const shown = note ?? (state.status !== "idle" ? state : null);

  const save = (next: Prefs) => {
    setPrefs(next);
    setSaving(true);
    setNote(null);
    startTransition(async () => {
      const r = await saveGooglePrefs(next);
      setNote(r);
      setSaving(false);
      onChanged();
    });
  };

  const flashBar = flashInfo && (
    <div
      role="status"
      className={cn(
        "mb-3 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
        flashInfo.tone === "good" ? "border-lime/30 bg-lime/10 text-lime" : "border-danger/30 bg-danger/10 text-danger",
      )}
    >
      {flashInfo.tone === "good" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
      {flashInfo.text}
    </div>
  );

  if (!status.configured && !status.connected) {
    return (
      <div className="mb-4">
        {flashBar}
        <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-xs text-faint">
          Google Calendar sync is off until a Google client ID and secret are added. See SETUP.md, “Google Calendar”.
        </p>
      </div>
    );
  }

  if (!status.connected || reconnect) {
    return (
      <div className="mb-4">
        {flashBar}
        <div className="glass flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-cyan">
              <GoogleMark />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{reconnect ? "Reconnect Google Calendar" : "Sync with Google Calendar"}</div>
              <div className="text-xs text-faint">
                {reconnect
                  ? "Google stopped trusting the connection, so syncing is paused."
                  : "Classes, deadlines and tasks show up in Google Calendar with reminders, and your other calendars appear here."}
              </div>
            </div>
          </div>
          <a
            href="/api/google/connect"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-transform hover:scale-[1.02]"
          >
            {reconnect ? "Reconnect" : "Connect"}
          </a>
        </div>
      </div>
    );
  }

  const last = status.lastSync;
  return (
    <div className="mb-4">
      {flashBar}
      <div className="glass overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-cyan">
              <GoogleMark />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                Google Calendar
                <span className="size-1.5 rounded-full bg-lime" aria-hidden />
              </div>
              <div className="truncate text-xs text-faint">
                {status.account ? `${status.account} · ` : ""}synced {ago(status.lastSyncedAtMs, now)}
                {last && last.errors > 0 ? ` · ${last.errors} item${last.errors === 1 ? "" : "s"} failed` : ""}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => startTransition(() => sync())}
              disabled={syncing || saving}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              {syncing || saving ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              <span className="max-sm:hidden">{syncing || saving ? "Syncing…" : "Sync now"}</span>
            </button>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              Settings <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
            </button>
          </div>
        </div>

        {(shown?.message || read === "error") && (
          <p
            role="status"
            className={cn("border-t border-line px-4 py-2.5 text-xs sm:px-5", shown && shown.status !== "ok" ? "text-amber" : "text-muted")}
          >
            {shown?.message ?? "Couldn't load your Google events just now."}
          </p>
        )}

        {open && (
          <div className="grid gap-5 border-t border-line px-4 py-4 sm:px-5">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Send to Google</h3>
              <div className="grid gap-2 sm:grid-cols-3">
                <Toggle label="Classes" hint="Sessions and events from Nexus" on={prefs.classes} disabled={saving} onChange={(v) => save({ ...prefs, classes: v })} />
                <Toggle label="Deadlines" hint="Assignments not yet submitted" on={prefs.deadlines} disabled={saving} onChange={(v) => save({ ...prefs, deadlines: v })} />
                <Toggle label="Tasks" hint="Your tasks that have a date" on={prefs.tasks} disabled={saving} onChange={(v) => save({ ...prefs, tasks: v })} />
              </div>
              <label className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
                Class reminder in Google
                <select
                  value={prefs.classReminder ?? "none"}
                  disabled={saving}
                  onChange={(e) => save({ ...prefs, classReminder: e.target.value === "none" ? null : Number(e.target.value) })}
                  className="rounded-lg border border-line bg-black/30 px-2.5 py-1.5 text-sm text-text outline-none"
                >
                  <option value="none">None</option>
                  {CLASS_REMINDER_CHOICES.map((m) => (
                    <option key={m} value={m}>
                      {m} minutes before
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-2 text-xs text-faint">
                Orbit writes only to its own calendar named “Orbit”. Move a task there and Orbit follows; delete an event there and it stays deleted.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Show from Google</h3>
              {calError ? (
                <p className="text-xs text-amber">{calError}</p>
              ) : !cals ? (
                <p className="text-xs text-faint">Loading your calendars…</p>
              ) : (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {cals
                    .filter((c) => !c.isOrbit)
                    .map((c) => (
                      <li key={c.id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm">
                          <input
                            type="checkbox"
                            checked={!prefs.hiddenCalendars.includes(c.id)}
                            disabled={saving}
                            onChange={(e) => {
                              const hidden = e.target.checked ? prefs.hiddenCalendars.filter((x) => x !== c.id) : [...prefs.hiddenCalendars, c.id];
                              setCals((list) => list && list.map((x) => (x.id === c.id ? { ...x, hidden: !e.target.checked } : x)));
                              save({ ...prefs, hiddenCalendars: hidden });
                            }}
                            className="size-4 accent-[var(--cyan)]"
                          />
                          <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color ?? "var(--faint)" }} />
                          <span className="min-w-0 truncate">{c.name}</span>
                        </label>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            <form action={disconnectGoogle} className="flex justify-end">
              <button type="submit" className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm text-faint transition-colors hover:bg-danger/10 hover:text-danger">
                <Unplug className="size-4" /> Disconnect (keeps the Orbit calendar in Google)
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
