"use client";

import type { ReactNode } from "react";
import { useEngagement } from "@/components/EngagementProvider";
import { CloseIcon } from "@/components/icons";

/** A small, dismissible callout attached to a specific feature — shown
 *  the first time that feature is actually encountered, never again once
 *  dismissed. Each hint id is independent: dismissing one never affects
 *  another. */
export function Hint({ id, children }: { id: string; children: ReactNode }) {
  const { dismissedHints, dismissHint } = useEngagement();
  if (dismissedHints.has(id)) {
    return null;
  }

  return (
    <div className="hint">
      <span style={{ flex: 1 }}>{children}</span>
      <button
        type="button"
        className="hint-dismiss"
        aria-label="Dismiss tip"
        onClick={() => dismissHint(id)}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
