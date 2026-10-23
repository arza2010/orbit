// Kept free of Node imports so the settings panel (a client component) can use it.

export type Prefs = {
  classes: boolean;
  deadlines: boolean;
  tasks: boolean;
  /** Minutes before a class for the Google popup; null for none. */
  classReminder: number | null;
  /** Calendars (by id) hidden from Orbit's calendar view. */
  hiddenCalendars: string[];
};

export const CLASS_REMINDER_CHOICES = [5, 10, 15, 30, 60] as const;

export const DEFAULT_PREFS: Prefs = { classes: true, deadlines: true, tasks: true, classReminder: 15, hiddenCalendars: [] };

export function parsePrefs(raw: unknown): Prefs {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const rem = o.classReminder;
  return {
    classes: bool(o.classes, DEFAULT_PREFS.classes),
    deadlines: bool(o.deadlines, DEFAULT_PREFS.deadlines),
    tasks: bool(o.tasks, DEFAULT_PREFS.tasks),
    classReminder: rem === null ? null : typeof rem === "number" && rem >= 0 && rem <= 1440 ? Math.round(rem) : DEFAULT_PREFS.classReminder,
    hiddenCalendars: Array.isArray(o.hiddenCalendars) ? o.hiddenCalendars.filter((x): x is string => typeof x === "string").slice(0, 100) : [],
  };
}
