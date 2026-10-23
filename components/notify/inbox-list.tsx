"use client";

import { BellRing, BookOpen, ChevronDown, ListChecks, Megaphone, Sun } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { markRead } from "@/app/(app)/inbox/actions";
import type { InboxItem } from "@/lib/notify/queries";
import { dayKey, fmtDayLabel, fmtTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const ICON = { assignment: BookOpen, task: ListChecks, announcement: Megaphone, digest: Sun, test: BellRing } as const;

const ROW = "flex w-full items-start gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-colors hover:bg-surface-2";

export function InboxList({ items, details }: { items: InboxItem[]; details: Record<string, string> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [, start] = useTransition();

  const seen = (id: string) => {
    setRead((prev) => new Set(prev).add(id));
    start(() => void markRead(id));
  };

  return (
    <ul className="flex flex-col gap-2">
      {items.map((n) => {
        const Icon = ICON[n.kind];
        const unread = !n.read_at && !read.has(n.id);
        const tone = cn(ROW, unread ? "border-white/20 bg-white/[0.06]" : "border-line bg-surface");
        // Anything that points at another page navigates there; the rest (announcements, tests) open in place.
        const elsewhere = n.url && n.url !== "/inbox";
        const isOpen = open === n.id;
        const text = details[n.id] ?? n.body;

        const inner = (
          <>
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface text-cyan">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm leading-snug", unread ? "font-semibold" : "text-muted")}>{n.title}</span>
              {!isOpen && n.body && <span className="mt-0.5 block truncate text-xs text-faint">{n.body}</span>}
              <span className="mt-1 block text-[11px] text-faint">
                {fmtDayLabel(dayKey(n.created_at))}, {fmtTime(n.created_at)}
              </span>
            </span>
            {unread && <span className="mt-2 size-2 shrink-0 rounded-full bg-pink" aria-label="Unread" />}
            {!elsewhere && <ChevronDown className={cn("mt-2 size-4 shrink-0 text-faint transition-transform", isOpen && "rotate-180")} />}
          </>
        );

        return (
          <li key={n.id}>
            {elsewhere ? (
              <Link href={n.url as string} onClick={() => unread && seen(n.id)} className={tone}>
                {inner}
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => {
                    setOpen(isOpen ? null : n.id);
                    if (unread) seen(n.id);
                  }}
                  className={tone}
                >
                  {inner}
                </button>
                {isOpen && text && (
                  <div data-lenis-prevent className="mx-2 mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-black/20 px-4 py-3 text-sm leading-relaxed text-muted">
                    {text}
                  </div>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
