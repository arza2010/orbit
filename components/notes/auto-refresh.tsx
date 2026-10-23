"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches the page's server data every few seconds while a note is still being written. */
export function AutoRefresh({ everyMs = 4000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}
