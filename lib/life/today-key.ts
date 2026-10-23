import "server-only";
import { io } from "next/cache";
import { dayKey } from "@/lib/time";

/** Today's date in India. Reading the clock is request-time work, so say so to Cache Components. */
export async function todayKey(): Promise<string> {
  await io();
  return dayKey(new Date());
}
