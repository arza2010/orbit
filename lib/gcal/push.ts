import "server-only";
import { after } from "next/server";
import { isGoogleConfigured } from "@/lib/gcal/oauth";
import { syncUser } from "@/lib/gcal/service";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tasks with a date appear in Google Calendar. After a task changes, push it in the background so the
 * response isn't held up. Does nothing unless Google Calendar is set up and connected.
 */
export function pushToGoogle(userId: string) {
  if (!isGoogleConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  after(async () => {
    try {
      await syncUser(createAdminClient(), userId);
    } catch {
      /* not connected, or Google is unreachable: the next scheduled sync will catch up */
    }
  });
}
