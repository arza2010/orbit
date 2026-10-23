"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { updateNotificationSettings, type ActionResult } from "@/app/(app)/inbox/actions";
import type { Settings } from "@/lib/notify/plan";

const TOGGLES: { name: keyof Settings["enabled"]; label: string; help: string }[] = [
  { name: "assignment", label: "Assignment deadlines", help: "1 day, 3 hours and 1 hour before it's due" },
  { name: "task", label: "Your tasks and reminders", help: "At the time you set, like paying a bill or meeting someone" },
  { name: "announcement", label: "New Nexus announcements", help: "Anything staff post" },
  { name: "digest", label: "Morning digest at 8 am", help: "What's due today and in the next two days" },
];

const hours = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}` }));

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(updateNotificationSettings, {});
  return (
    <form action={action} className="glass flex flex-col gap-5 p-5 sm:p-6">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">What to notify me about</h2>
      <ul className="flex flex-col gap-3">
        {TOGGLES.map((t) => (
          <li key={t.name}>
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" name={t.name} defaultChecked={settings.enabled[t.name]} className="mt-1 size-4 accent-[#8b6cff]" />
              <span>
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="block text-xs text-faint">{t.help}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm">
        <span className="text-muted">Quiet hours</span>
        <select name="quietStart" defaultValue={settings.quietStart} className="rounded-lg border border-line bg-black/20 px-2.5 py-1.5 outline-none">
          {hours.map((h) => (
            <option key={h.value} value={h.value}>
              {h.label}
            </option>
          ))}
        </select>
        <span className="text-faint">to</span>
        <select name="quietEnd" defaultValue={settings.quietEnd} className="rounded-lg border border-line bg-black/20 px-2.5 py-1.5 outline-none">
          {hours.map((h) => (
            <option key={h.value} value={h.value}>
              {h.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-faint">Nothing is sent in this window; anything still relevant arrives after it.</span>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-5 text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-60">
          {pending && <Loader2 className="size-4 animate-spin" />} Save
        </button>
        {state.message && <span role="status" className="text-sm text-lime">{state.message}</span>}
        {state.error && <span role="alert" className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
