import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bestStreak, currentStreak, doneThisWeek, lastNDays } from "../lib/life/habits";
import { formatINR, isMonthKey, monthRange, parseRupees, shiftMonth, summarise, type Expense } from "../lib/life/money";
import { bucketOf, dueFromDateKey, groupTasks, type Task } from "../lib/life/tasks";

const TODAY = "2026-10-21"; // a Wednesday
const set = (...d: string[]) => new Set(d);

describe("habit streaks", () => {
  it("counts consecutive days ending today", () => {
    assert.equal(currentStreak(set("2026-10-19", "2026-10-20", "2026-10-21"), TODAY), 3);
  });
  it("keeps the streak alive when today is not done yet", () => {
    assert.equal(currentStreak(set("2026-10-19", "2026-10-20"), TODAY), 2);
  });
  it("resets after a missed day", () => {
    assert.equal(currentStreak(set("2026-10-18", "2026-10-20"), TODAY), 1);
    assert.equal(currentStreak(set("2026-10-18", "2026-10-19"), TODAY), 0);
  });
  it("is zero for no logs, and ignores future days", () => {
    assert.equal(currentStreak(set(), TODAY), 0);
    assert.equal(currentStreak(set("2026-10-22", "2026-10-23"), TODAY), 0);
  });
  it("crosses month and year boundaries", () => {
    assert.equal(currentStreak(set("2026-12-30", "2026-12-31", "2027-01-01"), "2027-01-01"), 3);
    assert.equal(currentStreak(set("2026-02-27", "2026-02-28", "2026-03-01"), "2026-03-01"), 3);
  });
  it("counts the week from Monday", () => {
    assert.equal(doneThisWeek(set("2026-10-19", "2026-10-21", "2026-10-18"), TODAY), 2); // Sunday 18th is last week
    assert.equal(doneThisWeek(set(), TODAY), 0);
  });
  it("finds the best run ever", () => {
    assert.equal(bestStreak(set("2026-09-01", "2026-09-02", "2026-09-03", "2026-09-10", "2026-09-11")), 3);
    assert.equal(bestStreak(set()), 0);
  });
  it("lists the last n days oldest first", () => {
    assert.deepEqual(lastNDays(TODAY, 3), ["2026-10-19", "2026-10-20", "2026-10-21"]);
  });
});

const task = (over: Partial<Task>): Task => ({
  id: "t", title: "x", notes: null, due_at: null, due_has_time: false, remind_at: null, course: null, priority: 0, done_at: null, created_at: "2026-10-01T00:00:00Z", ...over,
});

describe("task buckets (India time)", () => {
  it("files tasks by due day", () => {
    assert.equal(bucketOf(task({ due_at: dueFromDateKey("2026-10-20") }), TODAY), "overdue");
    assert.equal(bucketOf(task({ due_at: dueFromDateKey("2026-10-21") }), TODAY), "today");
    assert.equal(bucketOf(task({ due_at: dueFromDateKey("2026-10-28") }), TODAY), "upcoming");
    assert.equal(bucketOf(task({ due_at: dueFromDateKey("2026-10-29") }), TODAY), "later");
    assert.equal(bucketOf(task({}), TODAY), "nodate");
    assert.equal(bucketOf(task({ done_at: "2026-10-21T01:00:00Z", due_at: dueFromDateKey("2026-10-01") }), TODAY), "done");
  });
  it("treats a task due late tonight as today, not tomorrow (UTC would get this wrong)", () => {
    // 23:59 IST on the 21st is 18:29 UTC the same day; 00:30 IST on the 22nd is 19:00 UTC on the 21st.
    assert.equal(bucketOf(task({ due_at: "2026-10-21T18:29:00Z" }), TODAY), "today");
    assert.equal(bucketOf(task({ due_at: "2026-10-21T19:00:00Z" }), TODAY), "upcoming");
  });
  it("orders groups and sorts by priority then due date", () => {
    const groups = groupTasks(
      [
        task({ id: "a", priority: 1, due_at: dueFromDateKey("2026-10-21") }),
        task({ id: "b", priority: 3, due_at: dueFromDateKey("2026-10-21") }),
        task({ id: "c", priority: 3, due_at: dueFromDateKey("2026-10-10") }),
        task({ id: "d", done_at: "2026-10-20T00:00:00Z" }),
        task({ id: "e" }),
      ],
      TODAY,
    );
    assert.deepEqual(groups.map((g) => g.bucket), ["overdue", "today", "nodate", "done"]);
    assert.deepEqual(groups[1].tasks.map((t) => t.id), ["b", "a"]);
  });
  it("builds a due time at the end of the chosen day in IST", () => {
    assert.equal(new Date(dueFromDateKey("2026-10-21")).toISOString(), "2026-10-21T18:29:00.000Z");
  });
});

describe("rupees and paise", () => {
  it("parses real-world input", () => {
    assert.equal(parseRupees("1250"), 125000);
    assert.equal(parseRupees("1,250.5"), 125050);
    assert.equal(parseRupees("₹ 99"), 9900);
    assert.equal(parseRupees("Rs. 40.25"), 4025);
    assert.equal(parseRupees("0.07"), 7);
  });
  it("rejects nonsense, zero, negatives and absurd amounts", () => {
    for (const bad of ["", "abc", "0", "-5", "12.345", "1e5", "12..5", "999999999999"]) assert.equal(parseRupees(bad), null, bad);
  });
  it("is exact: no floating-point drift", () => {
    assert.equal(parseRupees("0.1")! + parseRupees("0.2")!, 30);
    assert.equal(parseRupees("19.99"), 1999);
  });
  it("formats in Indian grouping", () => {
    assert.equal(formatINR(125050), "₹1,250.50");
    assert.equal(formatINR(5), "₹0.05");
    assert.equal(formatINR(100), "₹1");
    assert.equal(formatINR(100000), "₹1,000");
    assert.equal(formatINR(123456700), "₹12,34,567");
    assert.equal(formatINR(-5000), "-₹50");
  });
  const e = (amount_paise: number, category: string): Expense => ({ id: category + amount_paise, amount_paise, category, note: null, spent_on: "2026-10-01", created_at: "" });
  it("totals spending by category and keeps income separate", () => {
    const s = summarise([e(10000, "Food"), e(5000, "Food"), e(30000, "Rent"), e(-100000, "Salary")]);
    assert.equal(s.spent, 45000);
    assert.equal(s.income, 100000);
    assert.equal(s.net, 55000);
    assert.deepEqual(s.byCategory.map((c) => c.category), ["Rent", "Food"]);
    assert.ok(Math.abs(s.byCategory.reduce((n, c) => n + c.share, 0) - 1) < 1e-9);
  });
  it("handles an empty month", () => {
    assert.deepEqual(summarise([]), { spent: 0, income: 0, net: 0, byCategory: [] });
  });
  it("works out month ranges across the year boundary", () => {
    assert.deepEqual(monthRange("2026-10"), { from: "2026-10-01", to: "2026-11-01" });
    assert.deepEqual(monthRange("2026-12"), { from: "2026-12-01", to: "2027-01-01" });
    assert.equal(shiftMonth("2026-01", -1), "2025-12");
    assert.equal(shiftMonth("2026-12", 1), "2027-01");
    assert.ok(isMonthKey("2026-10") && !isMonthKey("2026-13") && !isMonthKey("26-10") && !isMonthKey(undefined));
  });
});
