// Run before every deploy:  npm run preflight        (add --quick to skip tests and the build)
// Checks the environment, every live service, the database migrations, the code, and finally boots the
// production build and probes it. It never prints a secret. Exits non-zero if anything critical fails.
import { spawn, spawnSync } from "node:child_process";
import { createECDH } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const quick = process.argv.includes("--quick");
const env = process.env;
const results = [];
let section = "";

const log = (status, name, detail = "") => {
  results.push({ section, status, name, detail });
  const icon = { pass: "\x1b[32m✔\x1b[0m", warn: "\x1b[33m!\x1b[0m", fail: "\x1b[31m✖\x1b[0m" }[status];
  console.log(`  ${icon} ${name}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
};
const head = (t) => {
  section = t;
  console.log(`\n\x1b[1m${t}\x1b[0m`);
};
const run = async (name, fn, { warnOnly = false } = {}) => {
  try {
    const out = await fn();
    log(out?.warn ? "warn" : "pass", name, out?.detail ?? "");
  } catch (e) {
    log(warnOnly ? "warn" : "fail", name, e instanceof Error ? e.message : String(e));
  }
};
const need = (c, msg) => {
  if (!c) throw new Error(msg);
};

// ---------------------------------------------------------------------------------------------- 1. environment
head("1. Environment (values are checked, never printed)");

await run("Nexus token and address", () => {
  need(env.MESA_MCP_URL?.startsWith("https://"), "MESA_MCP_URL must be an https address");
  need(env.MESA_PAT?.startsWith("mesa_pat_"), "MESA_PAT should start with mesa_pat_");
});
await run("Supabase address and publishable key", () => {
  need(/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? ""), "NEXT_PUBLIC_SUPABASE_URL looks wrong");
  const k = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  need(k.startsWith("sb_publishable_"), "the browser key must be the publishable one (sb_publishable_...)");
});
await run("Only your Google account may sign in", () => {
  need(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.ALLOWED_EMAIL ?? ""), "ALLOWED_EMAIL is missing or not an email");
  return { detail: env.ALLOWED_EMAIL };
});
await run("AI key (OpenRouter or Google)", () => {
  const k = env.OPENROUTER_API_KEY || env.GEMINI_API_KEY || "";
  need(k, "set OPENROUTER_API_KEY (or GEMINI_API_KEY)");
  need(k.startsWith("sk-or-") || k.startsWith("AIza"), "the AI key has an unrecognised format");
});
await run("Token encryption key is 32 bytes", () => {
  need(Buffer.from(env.TOKEN_ENCRYPTION_KEY ?? "", "base64").length === 32, "TOKEN_ENCRYPTION_KEY must be 32 bytes, base64");
});
await run("Push (VAPID) keys are a matching pair", () => {
  const pub = Buffer.from(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "", "base64url");
  const priv = Buffer.from(env.VAPID_PRIVATE_KEY ?? "", "base64url");
  need(pub.length === 65 && pub[0] === 4, "the public VAPID key is malformed");
  need(priv.length === 32, "the private VAPID key is malformed");
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(priv);
  need(ecdh.getPublicKey().equals(pub), "the public and private VAPID keys do not belong together");
  need(/^mailto:|^https:\/\//.test(env.VAPID_SUBJECT ?? ""), "VAPID_SUBJECT must be a mailto: or https: address");
});
await run("Scheduler secret is strong", () => need((env.CRON_SECRET ?? "").length >= 32, "CRON_SECRET should be at least 32 characters"));
await run(
  "Supabase secret key for the scheduler",
  () => {
    const k = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    need(k, "not set: scheduled notifications will not run until it is");
    need(k !== env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "this is the publishable key, not the secret one");
    need(k.startsWith("sb_secret_") || k.split(".").length === 3, "unrecognised format");
  },
  { warnOnly: true },
);
await run(
  "Google Calendar client ID and secret",
  () => {
    need(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET, "not set: Google Calendar sync stays off until both are added");
    need(/\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID), "GOOGLE_CLIENT_ID should end in .apps.googleusercontent.com");
    need(env.GOOGLE_CLIENT_SECRET.startsWith("GOCSPX-"), "GOOGLE_CLIENT_SECRET should start with GOCSPX-");
  },
  { warnOnly: true },
);
await run("No secret is exposed through a NEXT_PUBLIC_ name", () => {
  const bad = Object.keys(env).filter((n) => n.startsWith("NEXT_PUBLIC_") && /SECRET|SERVICE|PRIVATE|PAT$|PASSWORD|TOKEN/i.test(n));
  need(bad.length === 0, `rename or remove: ${bad.join(", ")}`);
});

// ---------------------------------------------------------------------------------------------- 2. live services
head("2. Live services");

const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const anon = { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "" };

await run("Nexus answers and the token is valid", async () => {
  const r = await fetch(env.MESA_MCP_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.MESA_PAT}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_me", arguments: {} } }),
  });
  need(r.ok, `HTTP ${r.status}`);
  const b = await r.json();
  need(b.result?.structuredContent?.name, "no student returned");
  return { detail: `signed in as ${b.result.structuredContent.name}` };
});
await run("Nexus has your attendance", async () => {
  const r = await fetch(env.MESA_MCP_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.MESA_PAT}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_attendance_summary", arguments: {} } }),
  });
  need(r.ok, `HTTP ${r.status}`);
  const c = (await r.json()).result?.structuredContent;
  need(Array.isArray(c?.courses), "no attendance returned. Does the token include attendance?");
  need(c.courses.every((x) => Number.isFinite(x.attended) && Number.isFinite(x.total)), "attendance rows are missing numbers");
  return { detail: `${c.courses.length} classes tracked` };
});
await run(
  "Google accepts the OAuth client",
  async () => {
    need(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET, "no Google client configured");
    // A made-up code. Google checks the redirect address first, so use Supabase's own callback (already
    // registered on this client); then it answers invalid_grant if the secret is right, invalid_client if not.
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: "authorization_code", code: "preflight-not-a-real-code", redirect_uri: `${url}/auth/v1/callback`, code_verifier: "x".repeat(50) }),
    });
    const b = await r.json().catch(() => ({}));
    need(b.error !== "invalid_client", "Google does not recognise the client ID and secret together");
    need(b.error === "invalid_grant", `unexpected answer from Google: ${b.error ?? r.status}`);
  },
  { warnOnly: true },
);
await run("AI provider accepts the key", async () => {
  if (env.OPENROUTER_API_KEY) {
    const r = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } });
    need(r.ok, `OpenRouter said HTTP ${r.status}`);
    const d = (await r.json()).data ?? {};
    need(d.limit_remaining === null || d.limit_remaining === undefined || d.limit_remaining > 1, "out of credit");
    return { detail: d.limit_remaining != null ? `$${Math.round(d.limit_remaining)} left` : "" };
  }
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": env.GEMINI_API_KEY } });
  need(r.ok, `Google said HTTP ${r.status}`);
});
await run("Supabase is reachable with Google sign-in on", async () => {
  const r = await fetch(`${url}/auth/v1/settings`, { headers: anon });
  need(r.ok, `HTTP ${r.status}`);
  const d = await r.json();
  need(d.external?.google, "Google sign-in is not enabled in Supabase");
});
await run(
  "Email sign-up is switched off",
  async () => {
    const d = await (await fetch(`${url}/auth/v1/settings`, { headers: anon })).json();
    need(!d.external?.email || d.disable_signup, "email sign-up is open. Harmless, but you only use Google: disable it under Authentication -> Providers -> Email");
  },
  { warnOnly: true },
);

// Every migration, proven by asking for the tables and columns it creates. 200 with [] means "exists, and row-level security is hiding rows".
const PROBES = [
  ["20261021 init", "tasks", "id,title,due_at,priority,done_at"],
  ["20261021 init", "habits", "id,name,target_per_week,hue"],
  ["20261021 init", "habit_logs", "id,habit_id,logged_on"],
  ["20261021 init", "goals", "id,title,target_value,current_value,status"],
  ["20261021 init", "expenses", "id,amount_paise,category,spent_on"],
  ["20261021 init", "one_on_ones", "id,with_name,held_at"],
  ["20261022 notes v2", "class_notes", "id,title,summary,action_items,exam_hints,unsure_terms,status,error"],
  ["20261022 notes v2", "course_digests", "id,course,content_md"],
  ["20261023 wispr", "integration_tokens", "id,provider,client_id,last_synced_at"],
  ["20261025 google calendar", "integration_tokens", "id,provider,meta"],
  ["20261023 wispr", "class_notes", "wispr_title,wispr_start,wispr_end"],
  ["20261024 notifications", "tasks", "due_has_time,remind_at,reminded_at"],
  ["20261024 notifications", "push_subscriptions", "id,endpoint,p256dh,auth"],
  ["20261024 notifications", "notification_settings", "user_id,enabled,quiet_start,quiet_end,announcements_cursor"],
  ["20261024 notifications", "notifications", "id,kind,ref,title,read_at,sent_at"],
];
for (const [migration, table, cols] of PROBES) {
  await run(`Database: ${table} (${migration})`, async () => {
    const r = await fetch(`${url}/rest/v1/${table}?select=${cols}&limit=1`, { headers: anon });
    if (r.ok) return;
    const b = await r.json().catch(() => ({}));
    throw new Error(`missing. Run supabase/migrations/${migration.split(" ")[0]}_*.sql  (${b.code ?? r.status})`);
  });
}
await run("Database: anonymous visitors see no rows", async () => {
  for (const t of ["tasks", "expenses", "class_notes", "notifications", "integration_tokens", "push_subscriptions"]) {
    const r = await fetch(`${url}/rest/v1/${t}?select=id&limit=1`, { headers: anon });
    const rows = r.ok ? await r.json() : [];
    need(Array.isArray(rows) && rows.length === 0, `${t} returned data to an anonymous request`);
  }
});

// ---------------------------------------------------------------------------------------------- 3. code
head("3. Code");
const sh = (cmd, args, label, opts = {}) =>
  run(label, () => {
    const r = spawnSync(cmd, args, { encoding: "utf8", env, ...opts });
    if (r.status !== 0) {
      const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter(Boolean).slice(-6).join(" | ");
      throw new Error(tail.slice(0, 400) || `exit ${r.status}`);
    }
    return { detail: (r.stdout.match(/ℹ pass (\d+)/) ?? [])[1] ? `${(r.stdout.match(/ℹ pass (\d+)/) ?? [])[1]} tests` : "" };
  });

if (quick) {
  log("warn", "Tests, typecheck, lint and build skipped (--quick)");
} else {
  await sh("npx", ["eslint", "."], "Lint is clean");
  await sh("npm", ["test"], "All tests pass");
  await sh("npx", ["next", "build"], "Production build succeeds");
  await sh("npx", ["tsc", "--noEmit"], "Types are clean");
}

// ---------------------------------------------------------------------------------------------- 4. production probe
head("4. The production build, probed like a stranger");

async function listJs(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...(await listJs(p)));
    else if (/\.(js|css|html|map)$/.test(f)) out.push(p);
  }
  return out;
}

if (quick && !statSync(".next", { throwIfNoEntry: false })) {
  log("warn", "Production probe skipped: no build found (run without --quick once)");
} else {
  const port = 3500 + Math.floor(Math.random() * 400);
  const server = spawn("npx", ["next", "start", "-p", String(port)], { env, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${base}/login`, { redirect: "manual" })).status) break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    const get = (p, init = {}) => fetch(base + p, { redirect: "manual", ...init });

    await run("Signed-out visitors are sent to the login page", async () => {
      for (const p of ["/", "/calendar", "/courses", "/programs", "/life", "/notes", "/inbox"]) {
        const r = await get(p);
        need(r.status === 307 && new URL(r.headers.get("location") ?? "", base).pathname === "/login", `${p} -> ${r.status}`);
      }
    });
    await run("Signed-out API calls are refused", async () => {
      // Data endpoints answer 401. The ones you reach by clicking a link send a signed-out browser to the login page.
      const r1 = await get("/api/schedule?from=2026-10-19&to=2026-10-22");
      need(r1.status === 401, `/api/schedule -> ${r1.status}`);
      for (const p of ["/api/wispr/connect", "/api/wispr/callback"]) {
        const r = await get(p);
        need(r.status === 307 && /\/login$/.test(r.headers.get("location") ?? ""), `${p} -> ${r.status}`);
      }
    });
    await run("The scheduler endpoint demands its secret", async () => {
      for (const init of [{ method: "POST" }, { method: "POST", headers: { Authorization: "Bearer wrong" } }, { method: "GET" }]) {
        const r = await get("/api/cron/notify", init);
        need(r.status === 401 || r.status === 503, `got ${r.status}`);
      }
    });
    await run("A forged session cookie does not get in", async () => {
      const fake = `base64-${Buffer.from(JSON.stringify({ access_token: "a.b.c", refresh_token: "x", expires_at: 9e9, user: { email: env.ALLOWED_EMAIL } })).toString("base64url")}`;
      const ref = (url.match(/\/\/([a-z0-9]{20})\./) ?? [])[1];
      const r = await get("/", { headers: { Cookie: `sb-${ref}-auth-token=${fake}` } });
      need(r.status === 307, `got ${r.status}`);
    });
    await run("The Google Calendar callback refuses forged requests", async () => {
      // Reachable without a session by design, so it must do nothing unless it holds a genuine flow cookie.
      const cases = [
        ["/api/google/callback?code=x&state=y", {}],
        ["/api/google/callback?code=x&state=y", { headers: { Cookie: "google_oauth=forged-value" } }],
        ["/api/google/callback?error=access_denied", {}],
      ];
      for (const [path, init] of cases) {
        const r = await get(path, init);
        need(r.status === 307 || r.status === 302, `${path} answered ${r.status}`);
        const loc = r.headers.get("location") ?? "";
        need(/\/(login|calendar\?google=)/.test(loc) && !/connected/.test(loc), `redirected somewhere unexpected: ${loc}`);
      }
    });
    await run("Connecting Google Calendar signed out goes to the login page", async () => {
      const r = await get("/api/google/connect");
      need(r.status === 307 && /\/login$/.test(r.headers.get("location") ?? ""), `got ${r.status} ${r.headers.get("location")}`);
    });
    await run("Login starts Google sign-in with the right settings", async () => {
      const r = await get("/auth/login");
      const loc = r.headers.get("location") ?? "";
      need(r.status === 307 && loc.startsWith(`${url}/auth/v1/authorize`), `-> ${loc.slice(0, 60)}`);
      const q = new URL(loc).searchParams;
      need(q.get("provider") === "google" && q.get("code_challenge_method") === "s256", "missing provider or PKCE");
    });
    await run("Sign-out accepts POST only", async () => {
      need((await get("/auth/signout")).status === 405, "GET should be refused");
      need((await get("/auth/signout", { method: "POST" })).status === 303, "POST should redirect");
    });
    await run("App files a browser needs are public and correct", async () => {
      const m = await get("/manifest.webmanifest");
      need(m.status === 200 && (await m.json()).display === "standalone", "manifest");
      for (const p of ["/icon", "/apple-icon"]) {
        const r = await get(p);
        need(r.status === 200 && r.headers.get("content-type") === "image/png", p);
      }
      const sw = await get("/sw.js");
      need(sw.status === 200 && /no-cache|no-store/.test(sw.headers.get("cache-control") ?? ""), "sw.js must never be cached");
    });
    await run("Security headers are present", async () => {
      const r = await get("/login");
      const h = (n) => r.headers.get(n);
      need(h("x-frame-options") === "DENY", "X-Frame-Options");
      need(h("x-content-type-options") === "nosniff", "X-Content-Type-Options");
      need(h("referrer-policy"), "Referrer-Policy");
      need((h("strict-transport-security") ?? "").includes("max-age"), "HSTS");
      need(!h("x-powered-by"), "the framework banner should be hidden");
    });
    await run("No secret appears in any page or browser file", async () => {
      const secrets = ["MESA_PAT", "SUPABASE_SERVICE_ROLE_KEY", "VAPID_PRIVATE_KEY", "CRON_SECRET", "TOKEN_ENCRYPTION_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY"]
        .map((n) => [n, env[n]])
        .filter(([, v]) => v && v.length > 12);
      const haystacks = [await (await get("/login")).text(), await (await get("/manifest.webmanifest")).text(), await (await get("/sw.js")).text()];
      for (const f of await listJs(".next/static")) haystacks.push(readFileSync(f, "utf8"));
      for (const [name, value] of secrets) need(!haystacks.some((h) => h.includes(value)), `${name} is exposed to the browser!`);
      return { detail: `${haystacks.length} files, ${secrets.length} secrets checked` };
    });
  } finally {
    server.kill("SIGTERM");
  }
}

// ---------------------------------------------------------------------------------------------- summary
const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\n\x1b[1mResult:\x1b[0m ${count("pass")} passed, ${count("warn")} to look at, ${count("fail")} failed`);
const failed = results.filter((r) => r.status === "fail");
if (failed.length) {
  console.log("\n\x1b[31mFix before deploying:\x1b[0m");
  for (const f of failed) console.log(`  - [${f.section.split(".")[0]}] ${f.name}: ${f.detail}`);
}
const warns = results.filter((r) => r.status === "warn" && r.detail);
if (warns.length) {
  console.log("\n\x1b[33mWorth knowing:\x1b[0m");
  for (const w of warns) console.log(`  - ${w.name}: ${w.detail}`);
}
process.exit(failed.length ? 1 : 0);
