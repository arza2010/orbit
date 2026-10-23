import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runNotifications } from "@/lib/notify/run";
import { isGoogleConfigured } from "@/lib/gcal/oauth";
import { syncDueUsers } from "@/lib/gcal/service";
import { buildDeps } from "@/lib/notify/service";

// Called every few minutes by a scheduler (Supabase cron, or a GitHub Action). Nobody is signed in,
// so access is controlled by a shared secret instead of a session.

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// The Google Calendar sync runs after the response, so the scheduler is never kept waiting on it.
export const maxDuration = 60;

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "notifications are not configured" }, { status: 503 });
  }

  // Strictly "Authorization: Bearer <secret>".
  const given = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!given || !same(given, secret)) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const admin = createAdminClient();
    const summary = await runNotifications(buildDeps(admin), Date.now());
    if (isGoogleConfigured()) {
      after(async () => {
        try {
          await syncDueUsers(admin);
        } catch (err) {
          console.error("google sync run failed", err instanceof Error ? err.message.slice(0, 200) : err);
        }
      });
    }
    return Response.json(summary);
  } catch (err) {
    console.error("notify run failed", err instanceof Error ? err.message : err);
    return Response.json({ error: "run failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
