"use client";

import { useEffect, useRef } from "react";
import { deviceFromWidth, normaliseVisitRef, type VisitPath } from "@/lib/visit-tracking";

/**
 * Fires one tiny POST when a public page renders in a real browser.
 *
 * Rendering null, using no cookies/storage and omitting credentials means
 * this adds nothing to the page and sends no session. Bots that don't run
 * JavaScript simply never call the route; the route checks Fetch headers
 * as a second, cheap filter. The ref guard stops React Strict Mode's
 * development double-effect from double-counting a single page load.
 */
export function VisitTracker({ path }: { path: VisitPath }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    const ref = normaliseVisitRef(new URLSearchParams(window.location.search).get("ref"));
    const device = deviceFromWidth(window.innerWidth);

    void fetch("/api/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, ref, device }),
      credentials: "omit",
      keepalive: true,
    }).catch(() => {
      // Counting must never affect the page, even if the network or the
      // database is having a bad day.
    });
  }, [path]);

  return null;
}
