// Money is stored as integer paise (1 rupee = 100 paise) so totals never drift. Negative = income.

export const MAX_PAISE = 100_000_000_00; // ₹10 crore: a sanity ceiling against typos

/** "1,250.50", "₹ 99", "1250" -> paise. Returns null for anything that isn't a positive amount. */
export function parseRupees(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise) || paise <= 0 || paise > MAX_PAISE) return null;
  return paise;
}

const whole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const withPaise = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 125050 -> "₹1,250.50"; 100000 -> "₹1,000" (paise shown only when there are some) */
export function formatINR(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = abs / 100;
  return `${sign}₹${abs % 100 === 0 ? whole.format(rupees) : withPaise.format(rupees)}`;
}

export type Expense = { id: string; amount_paise: number; category: string; note: string | null; spent_on: string; created_at: string };

export type CategoryTotal = { category: string; paise: number; share: number };

export function summarise(expenses: Expense[]): { spent: number; income: number; net: number; byCategory: CategoryTotal[] } {
  let spent = 0;
  let income = 0;
  const cats = new Map<string, number>();
  for (const e of expenses) {
    if (e.amount_paise >= 0) {
      spent += e.amount_paise;
      cats.set(e.category, (cats.get(e.category) ?? 0) + e.amount_paise);
    } else {
      income += -e.amount_paise;
    }
  }
  const byCategory = [...cats.entries()]
    .map(([category, paise]) => ({ category, paise, share: spent ? paise / spent : 0 }))
    .sort((a, b) => b.paise - a.paise);
  return { spent, income, net: income - spent, byCategory };
}

/** First day of the month and first day of the next, for a "YYYY-MM" key. */
export function monthRange(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: `${monthKey}-01`, to: `${next}-01` };
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export const isMonthKey = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export const DEFAULT_CATEGORIES = ["Food", "Transport", "Rent", "Study", "Fun", "Health", "Shopping", "Other"];
