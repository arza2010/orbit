// A local stand-in for Supabase (sign-in AND an in-memory database), for development only.
// It lets you click through signed-in pages and data flows without a real login or touching real data.
//
//   node scripts/fake-supabase.mjs                      # prints a session cookie, serves on :54321
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=x npm run dev
//   browser console on the app:  document.cookie = "sb-127-auth-token=<printed value>; path=/"
//   inspect the data:            curl http://127.0.0.1:54321/debug/tables
//
// It implements just the slice of PostgREST this app uses: select/insert/update/delete/upsert with the
// eq, is, not, lt, lte, gt, gte, in and or filters, plus order and limit. Row-level security is not modelled.
import { randomUUID } from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";

const EMAIL = process.env.ALLOWED_EMAIL || "me@example.com";
const USER = { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated", email: EMAIL, user_metadata: { full_name: "Test User" }, app_metadata: {} };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER.id, email: EMAIL, aud: "authenticated", role: "authenticated", iat: now, exp: now + 86400, user_metadata: USER.user_metadata })}.c2ln`;
const session = { access_token: jwt, refresh_token: "fake-refresh", expires_in: 86400, expires_at: now + 86400, token_type: "bearer", user: USER };

// ---- tiny database -------------------------------------------------------------------------
const tables = new Map();
const table = (n) => (tables.has(n) ? tables.get(n) : tables.set(n, []).get(n));
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

const DEFAULTS = {
  tasks: () => ({ priority: 0, done_at: null, notes: null, course: null, due_at: null, due_has_time: false, remind_at: null, reminded_at: null }),
  habits: () => ({ target_per_week: 7, hue: 258, archived_at: null }),
  habit_logs: () => ({}),
  goals: () => ({ current_value: 0, status: "active", area: null, unit: null, target_value: null, due_on: null }),
  expenses: () => ({ note: null, spent_on: today() }),
  tasks_extra: () => ({}),
  notifications: () => ({ body: null, url: null, sent_at: null, read_at: null }),
  notification_settings: () => ({ enabled: { assignment: true, task: true, announcement: true, digest: true }, quiet_start: 23, quiet_end: 7, announcements_cursor: null }),
  push_subscriptions: () => ({ user_agent: null }),
};
const UNIQUE = {
  habit_logs: ["habit_id", "logged_on"],
  notifications: ["user_id", "ref"],
  notification_settings: ["user_id"],
  push_subscriptions: ["endpoint"],
  integration_tokens: ["user_id", "provider"],
};

// Postgres stores timestamps in UTC, so "…+05:30" must compare equal to its UTC form.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const norm = (v) => (typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : v);
const cmpv = (a, b) => {
  const x = norm(a), y = norm(b);
  const nx = Number(x), ny = Number(y);
  if (x !== null && y !== null && x !== "" && y !== "" && Number.isFinite(nx) && Number.isFinite(ny) && typeof x !== "string") return nx - ny;
  return String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0;
};

function test(row, col, op, val) {
  const v = row[col];
  switch (op) {
    case "eq": return v !== null && v !== undefined && cmpv(v, val) === 0;
    case "is": return val === "null" ? v === null || v === undefined : String(v) === val;
    case "lt": return v != null && cmpv(v, val) < 0;
    case "lte": return v != null && cmpv(v, val) <= 0;
    case "gt": return v != null && cmpv(v, val) > 0;
    case "gte": return v != null && cmpv(v, val) >= 0;
    case "in": return val.replace(/^\(|\)$/g, "").split(",").includes(String(v));
    default: throw new Error(`unsupported operator ${op}`);
  }
}
function matches(row, expr) {
  // expr like "eq.5", "not.is.null", "not.in.(a,b)"
  let [op, ...rest] = expr.split(".");
  let negate = false;
  if (op === "not") { negate = true; [op, ...rest] = rest; }
  const r = test(row, expr.col, op, rest.join("."));
  return negate ? !r : r;
}
function evalOr(row, inner) {
  return inner.split(/,(?=[a-z_]+\.)/).some((part) => {
    const [col, ...rest] = part.split(".");
    return matches(row, Object.assign(rest.join("."), { col }));
  });
}
function filterRows(rows, params) {
  return rows.filter((row) => {
    for (const [key, value] of params) {
      if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
      if (key === "or") { if (!evalOr(row, value.replace(/^\(|\)$/g, ""))) return false; continue; }
      if (!matches(row, Object.assign(value, { col: key }))) return false;
    }
    return true;
  });
}
function project(row, select) {
  if (!select || select === "*") return row;
  return Object.fromEntries(select.split(",").map((c) => c.trim()).filter(Boolean).map((c) => [c, row[c] ?? null]));
}
function sortRows(rows, order) {
  if (!order) return rows;
  const keys = order.split(",").map((o) => { const [c, d = "asc"] = o.split("."); return [c, d === "desc"]; });
  return [...rows].sort((a, b) => {
    for (const [c, desc] of keys) {
      const x = a[c], y = b[c];
      if (x == null && y == null) continue;
      if (x == null) return 1; // nulls last
      if (y == null) return -1;
      const d = cmpv(x, y);
      if (d) return desc ? -d : d;
    }
    return 0;
  });
}

const parseBody = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

function handleRest(req, res, name, url, bodyText) {
  const send = (code, body, headers = {}) => { res.writeHead(code, { "Content-Type": "application/json", ...headers }); res.end(JSON.stringify(body)); };
  const params = url.searchParams;
  const prefer = req.headers.prefer ?? "";
  const rows = table(name);
  const wantsRows = /return=representation/.test(prefer);
  const select = params.get("select");

  try {
    if (req.method === "HEAD") {
      // supabase-js count queries: { count: "exact", head: true } read the total from Content-Range.
      const n = filterRows(rows, params).length;
      res.writeHead(200, { "Content-Range": n ? `0-${n - 1}/${n}` : "*/0" });
      return res.end();
    }
    if (req.method === "GET") {
      let out = sortRows(filterRows(rows, params), params.get("order"));
      if (params.get("limit")) out = out.slice(0, Number(params.get("limit")));
      return send(200, out.map((r) => project(r, select)));
    }
    if (req.method === "POST") {
      const items = [].concat(parseBody(bodyText) ?? []);
      const inserted = [];
      const uniq = UNIQUE[name];
      for (const item of items) {
        const row = { id: randomUUID(), user_id: USER.id, created_at: new Date().toISOString(), ...(DEFAULTS[name]?.() ?? {}), ...item };
        for (const k of Object.keys(row)) row[k] = norm(row[k]);
        const existing = uniq && rows.find((r) => uniq.every((c) => r[c] === row[c]));
        if (existing) {
          if (/ignore-duplicates/.test(prefer)) continue;
          if (/merge-duplicates/.test(prefer)) { Object.assign(existing, row, { id: existing.id }); inserted.push(existing); continue; }
          return send(409, { code: "23505", message: "duplicate key value violates unique constraint" });
        }
        rows.push(row);
        inserted.push(row);
      }
      return wantsRows ? send(201, inserted.map((r) => project(r, select))) : (res.writeHead(201), res.end());
    }
    if (req.method === "PATCH") {
      const patch = parseBody(bodyText) ?? {};
      const hit = filterRows(rows, params);
      for (const r of hit) for (const [k, v] of Object.entries(patch)) r[k] = norm(v);
      return wantsRows ? send(200, hit.map((r) => project(r, select))) : (res.writeHead(204), res.end());
    }
    if (req.method === "DELETE") {
      const hit = new Set(filterRows(rows, params));
      tables.set(name, rows.filter((r) => !hit.has(r)));
      return wantsRows ? send(200, [...hit]) : (res.writeHead(204), res.end());
    }
  } catch (err) {
    return send(400, { code: "PGRST100", message: String(err.message ?? err) });
  }
  return send(405, { message: "method not allowed" });
}

/** Starts the stand-in. port 0 picks a free one. Returns the server, its tables and a way to stop it. */
export function startFakeSupabase({ port = 54321, log = false } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (code, data) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
      if (url.pathname.startsWith("/auth/v1/user")) return send(200, USER);
      if (url.pathname.includes("jwks")) return send(200, { keys: [] });
      if (url.pathname === "/debug/tables") return send(200, Object.fromEntries([...tables.entries()]));
      if (url.pathname === "/debug/reset") { tables.clear(); return send(200, { ok: true }); }
      const m = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
      if (m) return handleRest(req, res, m[1], url, body);
      return send(404, { message: "not found" });
    });
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const actual = server.address().port;
      if (log) {
        console.log(`Stand-in Supabase (auth + in-memory database) on http://127.0.0.1:${actual}\n`);
        console.log("Cookie name : sb-127-auth-token");
        console.log(`Cookie value: base64-${b64(session)}\n`);
      }
      resolve({ port: actual, url: `http://127.0.0.1:${actual}`, tables, userId: USER.id, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

// Run directly: node scripts/fake-supabase.mjs
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startFakeSupabase({ log: true });
