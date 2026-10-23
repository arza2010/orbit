import "server-only";

// A small Google Calendar v3 client. Retries rate limits and 5xx with backoff; everything else is
// surfaced as GoogleApiError so callers can tell "gone" (404/410) from "broken".

const BASE = "https://www.googleapis.com/calendar/v3";

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
  }
}

export type GTime = { dateTime?: string; date?: string; timeZone?: string };

export type GEvent = {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  start?: GTime;
  end?: GTime;
  colorId?: string;
  transparency?: string;
  htmlLink?: string;
  hangoutLink?: string;
  updated?: string;
  attendees?: { self?: boolean; responseStatus?: string }[];
  reminders?: { useDefault: boolean; overrides?: { method: "popup" | "email"; minutes: number }[] };
  extendedProperties?: { private?: Record<string, string> };
};

export type GCalendar = {
  id: string;
  summary: string;
  description?: string;
  backgroundColor?: string;
  primary?: boolean;
  selected?: boolean;
  accessRole?: string;
};

type Opts = {
  fetchImpl?: typeof fetch;
  base?: string;
  sleep?: (ms: number) => Promise<void>;
  retries?: number;
};

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const RATE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"]);

export class GoogleCalendarApi {
  private readonly f: typeof fetch;
  private readonly base: string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly retries: number;

  constructor(
    private readonly token: () => Promise<string>,
    opts: Opts = {},
  ) {
    this.f = opts.fetchImpl ?? fetch;
    this.base = opts.base ?? process.env.GOOGLE_CALENDAR_API_BASE ?? BASE; // the env override is for tests only
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.retries = opts.retries ?? 6;
  }

  private async call<T>(method: string, path: string, query?: Record<string, string | undefined>, body?: unknown): Promise<T> {
    const url = new URL(`${this.base}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, v);

    for (let attempt = 0; ; attempt++) {
      const res = await this.f(url, {
        method,
        headers: { Authorization: `Bearer ${await this.token()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      if (res.ok) return (res.status === 204 ? undefined : await res.json().catch(() => undefined)) as T;

      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } };
      const reason = err.error?.errors?.[0]?.reason;
      const retriable = RETRY_STATUS.has(res.status) || (res.status === 403 && !!reason && RATE_REASONS.has(reason));
      if (retriable && attempt < this.retries) {
        // Google asks for exponential backoff on rate limits: 1s, 2s, 4s ... with jitter.
        const wait = Number(res.headers.get("retry-after")) * 1000 || 1000 * 2 ** attempt + Math.floor(Math.random() * 500);
        await this.sleep(Math.min(wait, 20_000));
        continue;
      }
      throw new GoogleApiError(`Google Calendar ${method} ${path} failed: ${err.error?.message ?? res.status}`, res.status, reason);
    }
  }

  async calendars(): Promise<GCalendar[]> {
    const out: GCalendar[] = [];
    let pageToken: string | undefined;
    do {
      const r = await this.call<{ items?: GCalendar[]; nextPageToken?: string }>("GET", "/users/me/calendarList", {
        minAccessRole: "reader",
        maxResults: "250",
        pageToken,
      });
      out.push(...(r.items ?? []));
      pageToken = r.nextPageToken;
    } while (pageToken);
    return out;
  }

  createCalendar(summary: string, description: string, timeZone: string): Promise<{ id: string }> {
    return this.call("POST", "/calendars", undefined, { summary, description, timeZone });
  }

  /** Already gone counts as deleted. Only ever used on calendars Orbit made itself. */
  async deleteCalendar(id: string): Promise<void> {
    try {
      await this.call("DELETE", `/calendars/${encodeURIComponent(id)}`);
    } catch (err) {
      if (err instanceof GoogleApiError && (err.status === 404 || err.status === 410)) return;
      throw err;
    }
  }

  getCalendar(id: string): Promise<{ id: string; summary: string }> {
    return this.call("GET", `/calendars/${encodeURIComponent(id)}`);
  }

  async events(calendarId: string, q: { timeMin: string; timeMax: string; showDeleted?: boolean; singleEvents?: boolean; privateProp?: string; maxResults?: number }): Promise<GEvent[]> {
    const out: GEvent[] = [];
    let pageToken: string | undefined;
    do {
      const r = await this.call<{ items?: GEvent[]; nextPageToken?: string }>("GET", `/calendars/${encodeURIComponent(calendarId)}/events`, {
        timeMin: q.timeMin,
        timeMax: q.timeMax,
        showDeleted: q.showDeleted ? "true" : undefined,
        singleEvents: q.singleEvents === false ? undefined : "true",
        privateExtendedProperty: q.privateProp,
        maxResults: String(q.maxResults ?? 2500),
        pageToken,
      });
      out.push(...(r.items ?? []));
      pageToken = r.nextPageToken;
    } while (pageToken);
    return out;
  }

  insertEvent(calendarId: string, event: Partial<GEvent> & { id: string }): Promise<GEvent> {
    return this.call("POST", `/calendars/${encodeURIComponent(calendarId)}/events`, undefined, event);
  }

  /** PATCH, not PUT: anything you added to the event in Google (guests, extra notes) is kept. */
  updateEvent(calendarId: string, id: string, event: Partial<GEvent>): Promise<GEvent> {
    return this.call("PATCH", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`, undefined, event);
  }

  /** Already gone counts as deleted. */
  async deleteEvent(calendarId: string, id: string): Promise<void> {
    try {
      await this.call("DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`);
    } catch (err) {
      if (err instanceof GoogleApiError && (err.status === 404 || err.status === 410)) return;
      throw err;
    }
  }
}

/** Runs `fn` over `items` with at most `n` in flight. Keeps going after a failure and reports each one. */
export async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<{ item: T; error: unknown }[]> {
  const failures: { item: T; error: unknown }[] = [];
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(n, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        try {
          await fn(item);
        } catch (error) {
          failures.push({ item, error });
        }
      }
    }),
  );
  return failures;
}
