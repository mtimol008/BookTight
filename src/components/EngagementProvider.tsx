"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { dismissHint as dismissHintAction } from "@/app/actions";
import type { EngagementState } from "@/lib/profiles";

interface EngagementContextValue {
  dismissedHints: Set<string>;
  dismissHint: (id: string) => void;
}

const EngagementContext = createContext<EngagementContextValue | null>(null);

/**
 * Shares one fetch of engagement_state across every <Hint> on a page,
 * rather than each hint fetching independently — populated by AppShell,
 * which already fetches this same data for the nav tour.
 */
export function EngagementProvider({
  initialState,
  children,
}: {
  initialState: EngagementState;
  children: ReactNode;
}) {
  const [dismissedHints, setDismissedHints] = useState<Set<string>>(
    () => new Set(initialState.dismissedHints ?? [])
  );
  // Tracks the prop reference this state was last synced from — React's
  // own "adjusting state when a prop changes" pattern, computed during
  // render rather than in a useEffect (which would commit the stale set
  // for one extra paint, then trigger a second render to fix it).
  // AppShell renders this provider immediately with an empty {} before its
  // own fetch resolves, then updates initialState once real data arrives;
  // that fetch itself only runs once, so this reference only ever changes
  // on that single real update — never again, so this can't stomp on
  // hints dismissed locally afterward.
  const [syncedFrom, setSyncedFrom] = useState(initialState.dismissedHints);
  if (initialState.dismissedHints !== syncedFrom) {
    setSyncedFrom(initialState.dismissedHints);
    if (initialState.dismissedHints) {
      setDismissedHints(new Set(initialState.dismissedHints));
    }
  }

  function dismissHint(id: string) {
    // Optimistic: hides immediately, persists in the background. Worst
    // case on failure is the hint reappears next visit — low stakes for
    // a one-time tip, not worth blocking the dismiss on the round trip.
    setDismissedHints((current) => new Set(current).add(id));
    dismissHintAction(id).catch(() => {});
  }

  return (
    <EngagementContext.Provider value={{ dismissedHints, dismissHint }}>
      {children}
    </EngagementContext.Provider>
  );
}

export function useEngagement(): EngagementContextValue {
  const context = useContext(EngagementContext);
  if (!context) {
    throw new Error("useEngagement must be used within EngagementProvider");
  }
  return context;
}
