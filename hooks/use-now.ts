"use client";

import { useEffect, useState } from "react";

/**
 * A ticking clock. Starts from the server's timestamp so the first client render
 * matches the server HTML, then switches to the real clock.
 */
export function useNow(serverNow: string, intervalMs = 15_000): number {
  const [now, setNow] = useState(() => new Date(serverNow).getTime());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
