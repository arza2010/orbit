// A stand-in for the slice of Google Calendar v3 that Orbit uses, held in memory. It reproduces the
// behaviours that matter for a sync: deleted events stay listed (as "cancelled", id reserved, so
// inserting the same id again is a 409), PATCH merges, listing honours timeMin/timeMax/showDeleted,
// and 429s can be injected to exercise retries.
import http from "node:http";
import type { AddressInfo } from "node:net";

type Ev = Record<string, unknown> & { id: string; status: string };
type Cal = { id: string; summary: string; description?: string; primary?: boolean; selected?: boolean; backgroundColor?: string; accessRole?: string; events: Map<string, Ev> };

export type Call = { method: string; path: string; body?: unknown };

export async function startFakeGoogle() {
  const calendars = new Map<string, Cal>();
  const calls: Call[] = [];
  let n = 0;
  const failNext: { status: number; reason?: string; times: number }[] = [];

  const addCalendar = (c: Omit<Cal, "events">) => calendars.set(c.id, { ...c, events: new Map() });
  addCalendar({ id: "me@example.com", summary: "Sam", primary: true, selected: true, backgroundColor: "#9fe1e7", accessRole: "owner" });

  const startMs = (e: Ev) => {
    const s = e.start as { dateTime?: string; date?: string } | undefined;
    return s?.dateTime ? Date.parse(s.dateTime) : s?.date ? Date.parse(`${s.date}T00:00:00Z`) : 0;
  };

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://x");
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
      calls.push({ method: req.method ?? "", path: url.pathname, body });
      const send = (status: number, json?: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(status, { "Content-Type": "application/json", ...headers });
        res.end(json === undefined ? undefined : JSON.stringify(json));
      };
      const err = (status: number, reason: string, message = reason) => send(status, { error: { code: status, message, errors: [{ reason }] } });

      if (!/^Bearer \S+/.test(req.headers.authorization ?? "")) return err(401, "authError");
      const injected = failNext[0];
      if (injected && injected.times > 0) {
        injected.times--;
        if (injected.times === 0) failNext.shift();
        return err(injected.status, injected.reason ?? "backendError", "injected failure");
      }

      const parts = url.pathname.split("/").filter(Boolean); // users/me/calendarList | calendars/:id[/events[/:eid]]
      if (parts[0] === "users" && parts[2] === "calendarList") {
        return send(200, { items: [...calendars.values()].map((c) => ({ id: c.id, summary: c.summary, description: c.description, primary: c.primary, selected: c.selected, backgroundColor: c.backgroundColor, accessRole: c.accessRole })) });
      }
      if (parts[0] === "calendars" && parts.length === 1 && req.method === "POST") {
        const id = `cal${++n}@group.calendar.google.com`;
        addCalendar({ id, summary: body.summary, description: body.description, selected: true, accessRole: "owner" });
        return send(200, { id, summary: body.summary });
      }
      if (parts[0] !== "calendars") return err(404, "notFound");
      const cal = calendars.get(decodeURIComponent(parts[1]));
      if (!cal) return err(404, "notFound", "Not Found");
      if (parts.length === 2 && req.method === "DELETE") {
        calendars.delete(cal.id);
        return send(204);
      }
      if (parts.length === 2) return send(200, { id: cal.id, summary: cal.summary });

      const eid = parts[3] ? decodeURIComponent(parts[3]) : undefined;
      if (req.method === "GET" && !eid) {
        const min = Date.parse(url.searchParams.get("timeMin") ?? "") || 0;
        const max = Date.parse(url.searchParams.get("timeMax") ?? "") || Infinity;
        const showDeleted = url.searchParams.get("showDeleted") === "true";
        const items = [...cal.events.values()]
          .filter((e) => (showDeleted || e.status !== "cancelled") && (e.status === "cancelled" || (startMs(e) >= min && startMs(e) < max)))
          .map((e) => (e.status === "cancelled" ? { id: e.id, status: "cancelled" } : e));
        return send(200, { items });
      }
      if (req.method === "POST" && !eid) {
        if (cal.events.has(body.id)) return err(409, "duplicate", "The requested identifier already exists.");
        const ev = { status: "confirmed", updated: new Date().toISOString(), ...body } as Ev;
        cal.events.set(ev.id, ev);
        return send(200, ev);
      }
      if (eid) {
        const cur = cal.events.get(eid);
        if (req.method === "PATCH") {
          if (!cur || cur.status === "cancelled") return err(404, "notFound");
          const next = { ...cur, ...body, updated: new Date().toISOString() } as Ev;
          cal.events.set(eid, next);
          return send(200, next);
        }
        if (req.method === "DELETE") {
          if (!cur) return err(404, "notFound");
          if (cur.status === "cancelled") return err(410, "deleted");
          cal.events.set(eid, { id: eid, status: "cancelled" });
          return send(204);
        }
      }
      return err(400, "badRequest");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    base,
    calls,
    calendars,
    /** Every live (not cancelled) event in a calendar. */
    live: (calId: string) => [...(calendars.get(calId)?.events.values() ?? [])].filter((e) => e.status !== "cancelled"),
    addCalendar,
    /** What the user does in Google: delete or drag an event. */
    userDeletes(calId: string, id: string) {
      calendars.get(calId)?.events.set(id, { id, status: "cancelled" });
    },
    userEdits(calId: string, id: string, patch: Record<string, unknown>) {
      const cal = calendars.get(calId);
      const cur = cal?.events.get(id);
      if (cal && cur) cal.events.set(id, { ...cur, ...patch });
    },
    userAdds(calId: string, ev: Ev) {
      calendars.get(calId)?.events.set(ev.id, ev);
    },
    failNext: (status: number, times = 1, reason?: string) => failNext.push({ status, times, reason }),
    reset() {
      calls.length = 0;
      calendars.clear();
      failNext.length = 0;
      addCalendar({ id: "me@example.com", summary: "Sam", primary: true, selected: true, backgroundColor: "#9fe1e7", accessRole: "owner" });
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
