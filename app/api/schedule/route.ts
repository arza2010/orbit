import { z } from "zod";
import { getUser } from "@/lib/auth";
import { toCalEvent } from "@/lib/calendar";
import { readGoogleEvents } from "@/lib/gcal/service";
import { nexus } from "@/lib/nexus";
import { createClient } from "@/lib/supabase/server";

const Query = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const MAX_DAYS = 62; // Nexus limit per call

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = Query.safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (!parsed.success) return Response.json({ error: "from and to must be YYYY-MM-DD" }, { status: 400 });

  const { from, to } = parsed.data;
  const span = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000;
  if (!(span > 0) || span > MAX_DAYS) {
    return Response.json({ error: `range must be 1 to ${MAX_DAYS} days` }, { status: 400 });
  }

  try {
    const [events, google] = await Promise.all([
      nexus.schedule(`${from}T00:00:00+05:30`, `${to}T00:00:00+05:30`),
      // Google is an extra: a failure there must never take the Nexus calendar down with it.
      createClient()
        .then((db) => readGoogleEvents(db, user.id, from, to))
        .catch(() => ({ status: "off" as const, events: [] })),
    ]);
    return Response.json({ events: [...events.map(toCalEvent), ...google.events], google: google.status });
  } catch (err) {
    console.error("schedule route failed", err);
    return Response.json({ error: "Could not reach Nexus" }, { status: 502 });
  }
}
