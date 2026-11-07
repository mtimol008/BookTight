"use client";

import { useActionState, useState } from "react";
import {
  enableCalendarFeed,
  disableCalendarFeed,
  regenerateCalendarFeedToken,
  type CalendarFeedState,
} from "@/app/account/calendar-feed/actions";
import { CopyIcon, RefreshIcon, ExternalLinkIcon } from "@/components/icons";

export function CalendarFeedSection({ initialFeedState }: { initialFeedState: CalendarFeedState }) {
  const [feedState, feedAction, isPending] = useActionState(
    async (_prev: CalendarFeedState, formData: FormData) => {
      const action = formData.get("action");
      switch (action) {
        case "enable":
          return enableCalendarFeed();
        case "disable":
          return disableCalendarFeed();
        case "regenerate":
          return regenerateCalendarFeedToken();
        default:
          return { error: "Unknown action" };
      }
    },
    initialFeedState
  );

  const [copied, setCopied] = useState(false);

  const feedUrl = feedState.feedUrl ?? initialFeedState.feedUrl;
  const isEnabled = !!feedUrl;
  const hasError = feedState.error || initialFeedState.error;
  const hasMessage = feedState.message || initialFeedState.message;

  async function handleCopy() {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div className="section-label" style={{ marginTop: 20, marginBottom: 8 }}>
        Calendar Feed
      </div>
      <div className="card">
        <p className="note" style={{ marginBottom: 16 }}>
        Subscribe to this feed in your calendar app (Apple Calendar, Google
        Calendar, Outlook) to see your Booktight jobs automatically.
      </p>

      {hasError && <p className="error-text">{hasError}</p>}
      {hasMessage && <p className="success-text">{hasMessage}</p>}

      {isEnabled ? (
        <>
          <div className="field">
            <label className="field-label" htmlFor="feed-url">
              Your feed URL
            </label>
            <div className="input-wrap" style={{ display: "flex", gap: 8 }}>
              <input
                id="feed-url"
                className="input"
                type="text"
                readOnly
                value={feedUrl}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn--outline"
                onClick={handleCopy}
                aria-label={copied ? "Copied" : "Copy to clipboard"}
              >
                {copied ? "Copied!" : <CopyIcon />}
              </button>
            </div>
          </div>

          <form
            action={feedAction}
            style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}
          >
            <button
              type="submit"
              className="btn btn--outline"
              disabled={isPending}
              name="action"
              value="regenerate"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <RefreshIcon />
              Regenerate URL
            </button>
            <button
              type="submit"
              className="btn btn--warning"
              disabled={isPending}
              name="action"
              value="disable"
            >
              Disable Feed
            </button>
            <a
              href={feedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--outline"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <ExternalLinkIcon />
              Test in Browser
            </a>
          </form>

          <p style={{ marginTop: 16 }}>
            <a href="/help#subscribing" className="btn--quiet">
              How to add this to your calendar app →
            </a>
          </p>
        </>
      ) : (
        <form action={feedAction}>
          <button
            type="submit"
            name="action"
            value="enable"
            className="btn btn--primary btn--block"
            disabled={isPending}
          >
            {isPending ? "Enabling..." : "Enable Calendar Feed"}
          </button>
        </form>
      )}
      </div>
    </>
  );
}