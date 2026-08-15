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

          <details style={{ marginTop: 16 }}>
            <summary className="btn--quiet" style={{ cursor: "pointer" }}>
              How to add to your calendar app
            </summary>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <p className="field-label">Apple Calendar (iPhone/Mac)</p>
                <ol style={{ paddingLeft: 20, lineHeight: 1.8 }}>
                  <li>Open <strong>Settings</strong> → <strong>Apps</strong> → <strong>Calendar</strong></li>
                  <li>Tap <strong>Calendar Accounts</strong> → <strong>Add Account</strong> → <strong>Other</strong></li>
                  <li>Choose <strong>Add Subscribed Calendar</strong></li>
                  <li>Paste the feed URL above → <strong>Next</strong> → <strong>Save</strong></li>
                </ol>
              </div>

              <div>
                <p className="field-label">Google Calendar (Web)</p>
                <ol style={{ paddingLeft: 20, lineHeight: 1.8 }}>
                  <li>Go to <a href="https://calendar.google.com" target="_blank" rel="noopener" className="text-route">calendar.google.com</a></li>
                  <li>Next to &ldquo;Other calendars&rdquo;, click <strong>+</strong> → <strong>From URL</strong></li>
                  <li>Paste the feed URL → <strong>Add calendar</strong></li>
                </ol>
              </div>

              <div>
                <p className="field-label">Outlook (Web / Windows / Mac)</p>
                <ol style={{ paddingLeft: 20, lineHeight: 1.8 }}>
                  <li>Open Outlook Calendar</li>
                  <li>Click <strong>Add calendar</strong> → <strong>Subscribe from web</strong></li>
                  <li>Paste the feed URL → Choose a name → <strong>Import</strong></li>
                </ol>
              </div>

              <p className="note" style={{ marginBottom: 0 }}>
                Your calendar app will refresh this feed automatically every few
                hours. Changes in Booktight (new jobs, time changes,
                cancellations) will appear on the next refresh.
              </p>
            </div>
          </details>
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