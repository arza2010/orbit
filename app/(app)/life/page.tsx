import { Suspense } from "react";
import Link from "next/link";
import { GoalsPanel } from "@/components/life/goals-panel";
import { HabitsPanel } from "@/components/life/habits-panel";
import { MoneyPanel } from "@/components/life/money-panel";
import { Planner } from "@/components/life/planner";
import { ReviewView, type ReviewData } from "@/components/life/review-view";
import { SetupNeeded } from "@/components/life/setup-needed";
import { SpacesHome } from "@/components/life/spaces-home";
import { requireUser } from "@/lib/auth";
import { isMonthKey, shiftMonth, summarise } from "@/lib/life/money";
import {
  getReview,
  listCheckins,
  listDoneBetween,
  listExpenses,
  listGoals,
  listHabits,
  listProjects,
  listRatings,
  listSpaceTasks,
  listSpaces,
} from "@/lib/life/queries";
import { moodByDay, ratingMoves, weekAverages } from "@/lib/life/review";
import { weekStartOf } from "@/lib/life/spaces";
import { todayKey as getTodayKey } from "@/lib/life/today-key";
import { addDays } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Life · Orbit" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS = [
  { id: "spaces", label: "Spaces" },
  { id: "planner", label: "Planner" },
  { id: "review", label: "Review" },
  { id: "habits", label: "Habits" },
  { id: "goals", label: "Goals" },
  { id: "money", label: "Money" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

async function loadReview(today: string, rawWeek: string | undefined): Promise<ReviewData> {
  const thisWeek = weekStartOf(today);
  // Only real, past-or-present Mondays within a year are accepted.
  const weekStart = isDay(rawWeek) && weekStartOf(rawWeek) === rawWeek && rawWeek <= thisWeek && rawWeek >= addDays(thisWeek, -365) ? rawWeek : thisWeek;
  const end = addDays(weekStart, 7);
  const months = [...new Set([weekStart.slice(0, 7), addDays(weekStart, 6).slice(0, 7)])];

  const [spaces, ratings, checkins, done, habits, review, ...expenseSets] = await Promise.all([
    listSpaces(),
    listRatings(today),
    listCheckins(today, 400),
    listDoneBetween(weekStart, end),
    listHabits(today),
    getReview(weekStart),
    ...months.map((m) => listExpenses(m)),
  ]);

  const days = moodByDay(checkins, weekStart);
  const spent = summarise(expenseSets.flat().filter((e) => e.spent_on >= weekStart && e.spent_on < end)).spent;
  const bySpace = spaces.map((s) => ({ id: s.id as string | null, name: s.name, emoji: s.emoji, hue: s.hue, count: done.filter((t) => t.space_id === s.id).length }));

  return {
    weekStart,
    prev: addDays(weekStart, -7),
    next: weekStart < thisWeek ? addDays(weekStart, 7) : null,
    isThisWeek: weekStart === thisWeek,
    days,
    avg: weekAverages(days),
    done,
    doneBySpace: bySpace,
    moves: ratingMoves(spaces, ratings, weekStart),
    habits: habits.map(({ habit, days: logged }) => {
      const set = new Set(logged.filter((d) => d >= weekStart && d < end));
      return { id: habit.id, name: habit.name, hue: habit.hue, done: set.size, target: habit.target_per_week };
    }),
    spent,
    review,
  };
}

type Loaded =
  | { kind: "spaces"; spaces: Awaited<ReturnType<typeof listSpaces>>; projects: Awaited<ReturnType<typeof listProjects>>; tasks: Awaited<ReturnType<typeof listSpaceTasks>>; ratings: Awaited<ReturnType<typeof listRatings>>; checkin: Awaited<ReturnType<typeof listCheckins>>[number] | null }
  | { kind: "planner"; spaces: Awaited<ReturnType<typeof listSpaces>>; projects: Awaited<ReturnType<typeof listProjects>>; tasks: Awaited<ReturnType<typeof listSpaceTasks>> }
  | { kind: "review"; data: ReviewData }
  | { kind: "habits"; habits: Awaited<ReturnType<typeof listHabits>> }
  | { kind: "goals"; goals: Awaited<ReturnType<typeof listGoals>> }
  | { kind: "money"; expenses: Awaited<ReturnType<typeof listExpenses>>; prevSpent: number; monthKey: string; isCurrentMonth: boolean }
  | { kind: "error" };

async function load(tab: Tab, sp: Record<string, string | string[] | undefined>, today: string): Promise<Loaded> {
  try {
    if (tab === "spaces") {
      const [spaces, projects, tasks, ratings, checkins] = await Promise.all([listSpaces(), listProjects(), listSpaceTasks(today), listRatings(today), listCheckins(today, 1)]);
      return { kind: "spaces", spaces, projects, tasks, ratings, checkin: checkins.find((c) => c.day === today) ?? null };
    }
    if (tab === "planner") {
      const [spaces, projects, tasks] = await Promise.all([listSpaces(), listProjects(), listSpaceTasks(today)]);
      return { kind: "planner", spaces, projects, tasks };
    }
    if (tab === "review") return { kind: "review", data: await loadReview(today, first(sp.week)) };
    if (tab === "habits") return { kind: "habits", habits: await listHabits(today) };
    if (tab === "goals") return { kind: "goals", goals: await listGoals() };

    const current = today.slice(0, 7);
    const month = first(sp.month);
    const monthKey = isMonthKey(month) && month <= current ? month : current;
    const [expenses, prev] = await Promise.all([listExpenses(monthKey), listExpenses(shiftMonth(monthKey, -1))]);
    return { kind: "money", expenses, prevSpent: summarise(prev).spent, monthKey, isCurrentMonth: monthKey === current };
  } catch (err) {
    console.error("Life: load failed", err);
    return { kind: "error" };
  }
}

async function Panel({ tab, sp, today }: { tab: Tab; sp: Record<string, string | string[] | undefined>; today: string }) {
  const d = await load(tab, sp, today);
  switch (d.kind) {
    case "spaces":
      return <SpacesHome spaces={d.spaces} projects={d.projects} tasks={d.tasks} ratings={d.ratings} checkin={d.checkin} todayKey={today} />;
    case "planner":
      return <Planner spaces={d.spaces} projects={d.projects} tasks={d.tasks} todayKey={today} />;
    case "review":
      return <ReviewView d={d.data} />;
    case "habits":
      return (
        <HabitsPanel
          habits={d.habits.map(({ habit, days }) => ({ id: habit.id, name: habit.name, target: habit.target_per_week, hue: habit.hue, days }))}
          todayKey={today}
        />
      );
    case "goals":
      return <GoalsPanel goals={d.goals} todayKey={today} />;
    case "money":
      return <MoneyPanel expenses={d.expenses} prevSpent={d.prevSpent} monthKey={d.monthKey} todayKey={today} isCurrentMonth={d.isCurrentMonth} />;
    default:
      return <SetupNeeded />;
  }
}

async function Content({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const sp = await searchParams;
  const raw = first(sp.tab);
  // Old links (notifications) point at ?tab=tasks, which is now the planner.
  const tab: Tab = raw === "tasks" ? "planner" : TABS.some((t) => t.id === raw) ? (raw as Tab) : "spaces";
  const today = await getTodayKey();

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <div className="mb-3 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-muted">
          <span className="h-px w-8 bg-gradient-to-r from-violet to-cyan" />
          Life
        </div>
        <h1 className="font-display text-[clamp(2.6rem,7vw,5rem)] leading-[0.95] tracking-tight">
          <span className="text-gradient italic">The rest</span> of your life.
        </h1>
        <nav className="-mx-4 mt-6 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none]" aria-label="Life sections">
          <div className="flex w-fit gap-0.5 rounded-full border border-line bg-surface p-1">
            {TABS.map((t) => (
              <Link
                key={t.id}
                href={`/life?tab=${t.id}`}
                aria-current={t.id === tab ? "page" : undefined}
                className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors", t.id === tab ? "bg-white/12 text-text ring-1 ring-white/15" : "text-muted hover:text-text")}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <Suspense key={`${tab}-${first(sp.month) ?? ""}-${first(sp.week) ?? ""}`} fallback={<div aria-busy className="skeleton h-[360px] rounded-[24px]" />}>
        <Panel tab={tab} sp={sp} today={today} />
      </Suspense>
    </div>
  );
}

export default function LifePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<div aria-busy className="skeleton mx-auto h-[520px] max-w-4xl rounded-[24px]" />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
