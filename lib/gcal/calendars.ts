import type { GCalendar } from "./api";

// How Orbit recognises its own calendar, so it never makes a second one and never shows its own copy back.

export const CALENDAR_NAME = "Orbit";
export const CALENDAR_MARK = "Managed by Orbit";
export const CALENDAR_DESCRIPTION = `Classes, deadlines and tasks from Orbit. ${CALENDAR_MARK}: edit them in Orbit or Nexus.`;

export const isOrbitCalendar = (c: Pick<GCalendar, "summary" | "description">) =>
  c.summary === CALENDAR_NAME && (c.description ?? "").includes(CALENDAR_MARK);

/** Stable order, so that two syncs racing each other agree on which calendar is the real one. */
export const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
