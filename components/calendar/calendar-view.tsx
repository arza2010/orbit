"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNow } from "@/hooks/use-now";
import {
  addMonths,
  mondayOf,
  monthGrid,
  monthKeyOf,
  monthsCovering,
  periodLabel,
  visibleDays,
  type CalEvent,
  type View,
} from "@/lib/calendar";
import { hsl } from "@/lib/course";
import { addDays, dayKey } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Agenda } from "./agenda";
import { EventSheet } from "./event-sheet";
import { GooglePanel, type GooglePanelStatus, type GoogleRead } from "./google-panel";
import { MonthView } from "./month-view";
import { TimeGrid } from "./time-grid";

const CHIP_LIMIT = 8;

const VIEWS: { id: View; label: string; key: string }[] = [
  { id: "month", label: "Month", key: "m" },
  { id: "week", label: "Week", key: "w" },
  { id: "day", label: "Day", key: "d" },
];

export function CalendarView({
  initialEvents,
  initialView,
  initialDate,
  serverNow,
  google,
  googleRead,
  googleFlash,
}: {
  initialEvents: CalEvent[];
  initialView: View;
  initialDate: string;
  serverNow: string;
  google: GooglePanelStatus;
  googleRead: GoogleRead;
  googleFlash: string | null;
}) {
  const now = useNow(serverNow, 30_000);
  const todayKey = dayKey(new Date(now));

  const [view, setView] = useState<View>(initialView);
  const [dateKey, setDateKey] = useState(initialDate);
  const [picked, setPicked] = useState(initialDate); // selected day in the phone month view
  const [dir, setDir] = useState(1);
  const [events, setEvents] = useState(() => new Map(initialEvents.map((e) => [e.id, e])));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);
  const [chipsOpen, setChipsOpen] = useState(false);
  // First paint is static; entrance animation only plays once the user navigates.
  const [animated, setAnimated] = useState(false);

  const [reloadTick, setReloadTick] = useState(0);
  const [googleNow, setGoogleNow] = useState<GoogleRead>(googleRead);
  const loaded = useRef(new Set([monthKeyOf(initialDate)]));
  const inflight = useRef(new Set<string>());

  const loadMonth = useCallback(async (mk: string) => {
    if (loaded.current.has(mk) || inflight.current.has(mk)) return;
    inflight.current.add(mk);
    setPending((n) => n + 1);
    try {
      const grid = monthGrid(`${mk}-01`);
      const res = await fetch(`/api/schedule?from=${grid[0]}&to=${addDays(grid[41], 1)}`);
      if (!res.ok) throw new Error(String(res.status));
      const body: { events: CalEvent[]; google?: GoogleRead } = await res.json();
      if (body.google) setGoogleNow(body.google);
      setEvents((prev) => {
        const next = new Map(prev);
        for (const e of body.events) next.set(e.id, e);
        return next;
      });
      loaded.current.add(mk);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      inflight.current.delete(mk);
      setPending((n) => n - 1);
    }
  }, []);

  // After a Google sync or a settings change: forget Google's events and fetch the visible months again.
  const reloadGoogle = useCallback(() => {
    setEvents((prev) => new Map([...prev].filter(([, e]) => e.source !== "google")));
    loaded.current.clear();
    setReloadTick((n) => n + 1);
  }, []);

  const days = useMemo(() => visibleDays(view, dateKey), [view, dateKey]);

  // Load whatever the visible range needs, then quietly prefetch the neighbouring months.
  useEffect(() => {
    const needed = monthsCovering(days);
    needed.forEach((mk) => void loadMonth(mk));
    const t = setTimeout(() => {
      const anchor = `${monthKeyOf(dateKey)}-01`;
      void loadMonth(monthKeyOf(addMonths(anchor, -1)));
      void loadMonth(monthKeyOf(addMonths(anchor, 1)));
    }, 700);
    return () => clearTimeout(t);
  }, [days, dateKey, loadMonth, reloadTick]);

  // Keep the URL shareable without triggering navigation.
  useEffect(() => {
    window.history.replaceState(null, "", `/calendar?view=${view}&date=${dateKey}`);
  }, [view, dateKey]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events.values()) {
      if (e.type !== "holiday" && hidden.has(e.group ?? e.course)) continue;
      const list = map.get(e.dayKey);
      if (list) list.push(e);
      else map.set(e.dayKey, [e]);
    }
    for (const list of map.values()) list.sort((a, b) => a.startMs - b.startMs);
    return map;
  }, [events, hidden]);

  const courses = useMemo(() => {
    const seen = new Map<string, number>();
    const range = new Set(days);
    for (const e of events.values()) {
      if (e.type === "holiday" || !range.has(e.dayKey)) continue;
      seen.set(e.group ?? e.course, e.hue);
    }
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [events, days]);

  const count = days.reduce(
    (n, d) => n + (byDay.get(d) ?? []).filter((e) => e.type !== "holiday" && (view !== "month" || monthKeyOf(d) === monthKeyOf(dateKey))).length,
    0,
  );

  const openEvent = openId ? (events.get(openId) ?? null) : null;
  const closeSheet = useCallback(() => setOpenId(null), []);

  const go = useCallback(
    (delta: number) => {
      const next = view === "month" ? addMonths(dateKey, delta) : addDays(dateKey, delta * (view === "week" ? 7 : 1));
      setAnimated(true);
      setDir(delta);
      setDateKey(next);
      setPicked(next);
    },
    [view, dateKey],
  );

  const goToday = useCallback(() => {
    setAnimated(true);
    setDir(todayKey >= dateKey ? 1 : -1);
    setDateKey(todayKey);
    setPicked(todayKey);
  }, [todayKey, dateKey]);

  const pickDay = (key: string) => {
    setAnimated(true);
    if (window.matchMedia("(min-width: 768px)").matches) {
      setDateKey(key);
      setPicked(key);
      setView("day");
    } else {
      setPicked(key);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || openId) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "t") goToday();
      else {
        const v = VIEWS.find((x) => x.key === e.key);
        if (v) setView(v.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, goToday, openId]);

  const label = periodLabel(view, dateKey);
  const stageKey = view === "month" ? monthKeyOf(dateKey) : view === "week" ? mondayOf(dateKey) : dateKey;

  return (
    <div>
      <header className="mb-5 flex flex-col gap-4 sm:mb-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-muted">
            <span className="h-px w-8 bg-gradient-to-r from-violet to-cyan" />
            Calendar
            <span className="text-faint normal-case tracking-normal">· {count} {count === 1 ? "event" : "events"}</span>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.h1
              key={`${view}-${stageKey}`}
              initial={{ opacity: 0, y: 14 * dir }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 * dir }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-[clamp(2.2rem,6vw,4.2rem)] leading-none tracking-tight"
            >
              <span className="text-gradient italic">{label.main}</span>
              {label.sub && <span className="ml-3 text-muted">{label.sub}</span>}
            </motion.h1>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="flex items-center rounded-full border border-line bg-surface p-1">
            <button
              onClick={() => go(-1)}
              aria-label="Previous"
              className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              <ChevronLeft className="size-[18px]" />
            </button>
            <button
              onClick={goToday}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text sm:px-3.5"
            >
              Today
            </button>
            <button
              onClick={() => go(1)}
              aria-label="Next"
              className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              <ChevronRight className="size-[18px]" />
            </button>
          </div>

          <div className="relative flex rounded-full border border-line bg-surface p-1" role="tablist" aria-label="Calendar view">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                role="tab"
                aria-selected={view === v.id}
                onClick={() => {
                  setAnimated(true);
                  setView(v.id);
                }}
                className={cn(
                  "relative rounded-full px-3 py-2 text-sm font-medium transition-colors sm:px-3.5",
                  view === v.id ? "text-text" : "text-muted hover:text-text",
                )}
              >
                {view === v.id && (
                  <motion.span
                    layoutId="view-pill"
                    className="absolute inset-0 rounded-full bg-white/12 ring-1 ring-white/15"
                    transition={{ type: "spring", stiffness: 460, damping: 36 }}
                  />
                )}
                <span className="relative">{v.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <GooglePanel status={google} read={googleNow} flash={googleFlash} onChanged={reloadGoogle} />

      {courses.length > 0 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none]">
          {courses
            .filter(([name], i) => chipsOpen || i < CHIP_LIMIT || hidden.has(name))
            .map(([name, hue]) => {
            const off = hidden.has(name);
            return (
              <button
                key={name}
                onClick={() =>
                  setHidden((prev) => {
                    const next = new Set(prev);
                    if (next.has(name)) next.delete(name);
                    else next.add(name);
                    return next;
                  })
                }
                aria-pressed={!off}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
                  off ? "border-line text-faint line-through opacity-60" : "border-white/15 bg-surface text-text hover:bg-surface-2",
                )}
              >
                <span className="size-2 rounded-full" style={{ background: off ? "var(--faint)" : hsl(hue, 90, 66) }} />
                {name}
              </button>
            );
          })}
          {courses.length > CHIP_LIMIT && (
            <button
              onClick={() => setChipsOpen((o) => !o)}
              className="shrink-0 rounded-full border border-dashed border-line px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
            >
              {chipsOpen ? "Show less" : `+${courses.length - CHIP_LIMIT} more`}
            </button>
          )}
          {hidden.size > 0 && (
            <button
              onClick={() => setHidden(new Set())}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-cyan transition-colors hover:text-text"
            >
              Reset filters
            </button>
          )}
        </div>
      )}

      <div className="glass relative p-3 sm:p-5">
        {pending > 0 && (
          <div className="absolute inset-x-6 top-0 h-px overflow-hidden rounded-full">
            <motion.div
              className="h-full w-1/3 bg-gradient-to-r from-transparent via-cyan to-transparent"
              animate={{ x: ["-100%", "300%"] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
            />
          </div>
        )}
        {failed && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            Couldn&apos;t load some of the calendar.
            <button
              onClick={() => {
                days.forEach((d) => void loadMonth(monthKeyOf(d)));
              }}
              className="font-semibold underline underline-offset-4"
            >
              Retry
            </button>
          </div>
        )}

        <motion.div
          key={`${view}-${stageKey}`}
          initial={animated ? { opacity: 0, x: 26 * dir } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        >
          {view === "month" && (
            <>
              <MonthView
                dateKey={dateKey}
                todayKey={todayKey}
                animated={animated}
                selectedKey={picked}
                byDay={byDay}
                onPickDay={pickDay}
                onOpen={(ev) => setOpenId(ev.id)}
              />
              <div className="mt-5 md:hidden">
                <Agenda
                  days={[picked]}
                  animated={animated}
                  todayKey={todayKey}
                  byDay={byDay}
                  onOpen={(ev) => setOpenId(ev.id)}
                  emptyLabel="Nothing on this day."
                />
              </div>
            </>
          )}

          {view === "week" && (
            <>
              <div className="hidden md:block">
                <TimeGrid
                  animated={animated}
                  days={days}
                  todayKey={todayKey}
                  byDay={byDay}
                  nowMs={now}
                  onOpen={(ev) => setOpenId(ev.id)}
                  onPickDay={pickDay}
                />
              </div>
              <div className="md:hidden">
                <Agenda animated={animated} days={days} todayKey={todayKey} byDay={byDay} onOpen={(ev) => setOpenId(ev.id)} emptyLabel="Nothing this week." />
              </div>
            </>
          )}

          {view === "day" && (
            <TimeGrid animated={animated} days={days} todayKey={todayKey} byDay={byDay} nowMs={now} onOpen={(ev) => setOpenId(ev.id)} />
          )}
        </motion.div>
      </div>

      <p className="mt-4 hidden text-center text-xs text-faint md:block">
        <kbd className="rounded border border-line px-1.5 py-0.5 font-mono">←</kbd>{" "}
        <kbd className="rounded border border-line px-1.5 py-0.5 font-mono">→</kbd> move ·{" "}
        <kbd className="rounded border border-line px-1.5 py-0.5 font-mono">t</kbd> today ·{" "}
        <kbd className="rounded border border-line px-1.5 py-0.5 font-mono">m</kbd>
        <kbd className="ml-1 rounded border border-line px-1.5 py-0.5 font-mono">w</kbd>
        <kbd className="ml-1 rounded border border-line px-1.5 py-0.5 font-mono">d</kbd> views
      </p>

      <EventSheet event={openEvent} onClose={closeSheet} />
    </div>
  );
}
