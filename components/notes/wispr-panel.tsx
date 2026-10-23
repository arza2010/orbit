"use client";

import { AlertTriangle, CheckCircle2, Link2, Loader2, RefreshCw, Unplug, Waves } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef } from "react";
import {
  assignRecording,
  disconnectWispr,
  dismissRecording,
  syncWispr,
  type AssignState,
  type SyncState,
} from "@/app/(app)/notes/wispr-actions";
import { cn } from "@/lib/utils";
import type { SessionOption } from "./new-note-form";

export type UnmatchedItem = { id: string; title: string; when: string; durationMin: number };

const AUTO_SYNC_AFTER_MS = 20 * 60_000;

const FLASH: Record<string, { tone: "good" | "bad"; text: string }> = {
  connected: { tone: "good", text: "Wispr is connected. Your recent classes are being pulled in." },
  denied: { tone: "bad", text: "You didn't approve the connection, so nothing was connected." },
  error: { tone: "bad", text: "Couldn't finish connecting Wispr. Please try again." },
};

function UnmatchedCard({ item, sessions }: { item: UnmatchedItem; sessions: SessionOption[] }) {
  const [state, action, pending] = useActionState<AssignState, FormData>(assignRecording.bind(null, item.id), {});
  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{item.title}</span>
        <span className="text-xs text-faint">
          {item.when} · {item.durationMin} min
        </span>
      </div>
      <p className="mt-1 text-xs text-faint">No class on your calendar lines up with this recording. Which class was it?</p>
      <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
        <select
          name="event"
          defaultValue=""
          required
          className="min-w-0 flex-1 rounded-xl border border-line bg-black/30 px-3 py-2 text-sm text-text outline-none focus:border-white/30 sm:flex-none sm:basis-72"
        >
          <option value="" disabled>
            Choose a class…
          </option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.short} · {s.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black disabled:opacity-60"
        >
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          {pending ? "Fetching…" : "Use this class"}
        </button>
      </form>
      {state.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
      <form action={dismissRecording.bind(null, item.id)} className="mt-2">
        <button type="submit" className="text-xs text-faint underline-offset-4 transition-colors hover:text-text hover:underline">
          Not a class, dismiss
        </button>
      </form>
    </li>
  );
}

export function WisprPanel({
  connected,
  lastSynced,
  lastSyncedAtMs,
  flash,
  unmatched,
  sessions,
}: {
  connected: boolean;
  lastSynced: string | null;
  lastSyncedAtMs: number | null;
  flash: string | null;
  unmatched: UnmatchedItem[];
  sessions: SessionOption[];
}) {
  const [state, sync, syncing] = useActionState<SyncState>(syncWispr, { status: "idle" });
  const started = useRef(false);

  // Sync once when the page opens, if it has been a while. The ref stops React's dev double-run.
  useEffect(() => {
    if (!connected || started.current) return;
    started.current = true;
    if (lastSyncedAtMs === null || Date.now() - lastSyncedAtMs > AUTO_SYNC_AFTER_MS) {
      startTransition(() => sync());
    }
  }, [connected, lastSyncedAtMs, sync]);

  const flashInfo = flash ? FLASH[flash] : undefined;
  const needsReconnect = state.status === "reconnect";

  return (
    <section className="mb-10 flex flex-col gap-4">
      {flashInfo && (
        <div
          role="status"
          className={cn(
            "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
            flashInfo.tone === "good" ? "border-lime/30 bg-lime/10 text-lime" : "border-danger/30 bg-danger/10 text-danger",
          )}
        >
          {flashInfo.tone === "good" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          {flashInfo.text}
        </div>
      )}

      <div className="glass flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <span className="grid size-11 place-items-center rounded-2xl border border-line bg-surface">
            <Waves className="size-5 text-cyan" />
          </span>
          <div>
            <div className="text-sm font-semibold">Wispr Flow</div>
            <div className="text-xs text-faint">
              {connected ? (lastSynced ? `Connected · last synced ${lastSynced}` : "Connected · not synced yet") : "Not connected"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {connected && !needsReconnect ? (
            <>
              <button
                onClick={() => startTransition(() => sync())}
                disabled={syncing}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-60"
              >
                {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                {syncing ? "Syncing…" : "Sync now"}
              </button>
              <form action={disconnectWispr}>
                <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm text-faint transition-colors hover:bg-danger/10 hover:text-danger">
                  <Unplug className="size-4" /> Disconnect
                </button>
              </form>
            </>
          ) : (
            <a
              href="/api/wispr/connect"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-transform hover:scale-[1.02]"
            >
              <Link2 className="size-4" /> {needsReconnect ? "Reconnect Wispr" : "Connect Wispr"}
            </a>
          )}
        </div>

        {!connected && (
          <p className="w-full text-xs leading-relaxed text-faint">
            Connect once and your class recordings flow in on their own: each one is matched to the right class by its time and written up
            automatically. You approve it in your browser, and the connection is stored encrypted.
          </p>
        )}

        {state.message && (
          <p
            role="status"
            className={cn("w-full text-sm", state.status === "ok" ? "text-muted" : "text-danger")}
          >
            {state.message}
          </p>
        )}
      </div>

      {unmatched.length > 0 && (
        <div className="glass p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber">
            {unmatched.length} {unmatched.length === 1 ? "recording needs" : "recordings need"} a class
          </h2>
          <ul className="flex flex-col gap-3">
            {unmatched.map((u) => (
              <UnmatchedCard key={u.id} item={u} sessions={sessions} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
