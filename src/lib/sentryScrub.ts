import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

// Matches the token segment in the calendar feed URL, with or without the
// ".ics" suffix the route itself accepts — /api/calendar/feed/<token> or
// /api/calendar/feed/<token>.ics.
const CALENDAR_FEED_TOKEN_PATTERN = /\/api\/calendar\/feed\/[^/?#]+/;

/**
 * Strips everything from a URL that could carry a secret: the query
 * string (covers Supabase's auth-callback params, e.g. ?code=... on
 * /reset-password), the hash fragment (covers the implicit-flow
 * #access_token=...&type=recovery form of the same thing — fragments
 * never reach the server, but the browser SDK's own breadcrumbs/request
 * context read window.location.href, which does include it), and the
 * calendar feed token path segment specifically, since that one is
 * capability-bearing on its own with no separate auth check.
 */
export function scrubUrl(rawUrl: string | undefined | null): string | undefined {
  if (!rawUrl) return rawUrl ?? undefined;

  const withoutHash = rawUrl.split("#")[0];
  const withoutQuery = withoutHash.split("?")[0];
  return withoutQuery.replace(CALENDAR_FEED_TOKEN_PATTERN, "/api/calendar/feed/[token]");
}

/**
 * Shared beforeSend for all three Sentry runtimes (client/server/edge).
 *
 * Stripping structured fields (user.email, request.data/cookies/headers)
 * isn't enough on its own — several real error messages in this app embed
 * the user's own input directly, e.g. geocoding.ts's
 * `Could not find coordinates for "${address}"`. There's no reliable way
 * to tell safe text apart from an embedded address/name/email inside a
 * free-form string, so the message itself is replaced with just the error
 * type (TypeError, Error, etc.) — the stack trace (file/line/function,
 * never argument values) still survives for debugging.
 *
 * Separately, every URL-shaped field is run through scrubUrl — the
 * calendar feed token lives in a URL path segment, and Supabase's auth
 * callbacks (signup confirmation, password recovery) carry their tokens
 * as URL query/hash parameters, so "strip PII" and "strip URLs" are two
 * different jobs that both need doing.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
  }

  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    event.request.url = scrubUrl(event.request.url);
    delete event.request.query_string;
  }

  if (event.exception?.values) {
    for (const exceptionValue of event.exception.values) {
      exceptionValue.value = exceptionValue.type ?? "Error";
    }
  }

  if (event.message) {
    event.message = "[message redacted]";
  }

  if (event.transaction) {
    event.transaction = scrubUrl(event.transaction);
  }

  if (event.tags) {
    for (const key of Object.keys(event.tags)) {
      const value = event.tags[key];
      if (typeof value === "string" && (value.includes("/api/calendar/feed/") || value.includes("?") || value.includes("#"))) {
        event.tags[key] = scrubUrl(value) ?? value;
      }
    }
  }

  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.category === "navigation") {
    // {from, to} — both are full URLs/paths, so both need the same
    // treatment as any other URL field, not just a blanket data-wipe.
    if (breadcrumb.data) {
      if (typeof breadcrumb.data.from === "string") {
        breadcrumb.data.from = scrubUrl(breadcrumb.data.from);
      }
      if (typeof breadcrumb.data.to === "string") {
        breadcrumb.data.to = scrubUrl(breadcrumb.data.to);
      }
    }
    if (breadcrumb.message) {
      breadcrumb.message = scrubUrl(breadcrumb.message);
    }
    return breadcrumb;
  }

  // Every other category (console, xhr/fetch, ui.click, ...) can't be
  // vetted the same field-by-field way, so its data and message are
  // wiped outright rather than guessed at.
  if (breadcrumb.data) {
    delete breadcrumb.data;
  }
  if (breadcrumb.message) {
    breadcrumb.message = "[message redacted]";
  }
  return breadcrumb;
}
