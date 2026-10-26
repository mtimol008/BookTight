import * as Sentry from "@sentry/nextjs";
import { scrubUrl } from "@/lib/sentryScrub";
import { checkIpRateLimit, getClientIp } from "@/lib/rateLimit";

interface CspReportFields {
  "document-uri"?: string;
  "violated-directive"?: string;
  "effective-directive"?: string;
  "blocked-uri"?: string;
  "source-file"?: string;
  "line-number"?: number;
}

// Real CSP reports are small (well under 1KB) — anything claiming to be
// bigger than this is either malformed or someone probing the endpoint,
// not a browser's own violation report.
const MAX_BODY_BYTES = 8 * 1024;
// Don't let one string field blow up what gets logged — caps garbage
// stuffed into a field before it reaches Sentry's tags/extra.
const MAX_FIELD_LENGTH = 500;

const RATE_LIMIT_WINDOW_MINUTES = 5;
const RATE_LIMIT_MAX_REPORTS = 20;

// Forward roughly 1 in 5 of the reports that pass validation and the rate
// limit — a real misconfiguration still shows up (every distinct visitor
// hitting it gets an independent chance to be the one sampled), but a
// flood of identical reports from one page load loop can't alone burn
// through Sentry's quota the way forwarding every single one would.
const SAMPLE_RATE = 0.2;

function truncate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.length > MAX_FIELD_LENGTH ? value.slice(0, MAX_FIELD_LENGTH) : value;
}

function isValidReport(value: unknown): value is CspReportFields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const hasDirective =
    typeof record["violated-directive"] === "string" ||
    typeof record["effective-directive"] === "string";
  const hasTarget =
    typeof record["blocked-uri"] === "string" || typeof record["document-uri"] === "string";
  return hasDirective && hasTarget;
}

/**
 * Browsers POST here automatically on a CSP violation, per the report-uri
 * set in next.config.ts. Public and unauthenticated by necessity (every
 * signed-out page — login, signup — can trigger one), so this is hardened
 * against being used to flood Sentry or the DB rather than trusted at
 * face value: a size cap, shape validation, a per-IP rate limit (reusing
 * the same limiter as the auth forms), and sampling on top of that.
 * Increasing cost order — cheapest check first, so an obviously bad
 * request never reaches the DB call or the JSON parse.
 */
export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!contentLength || contentLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 204 });
  }

  const ip = getClientIp(request.headers);
  const allowed = await checkIpRateLimit(
    ip,
    "csp_report",
    RATE_LIMIT_WINDOW_MINUTES,
    RATE_LIMIT_MAX_REPORTS
  );
  if (!allowed) {
    return new Response(null, { status: 204 });
  }

  try {
    const body = await request.json();
    const candidate = body?.["csp-report"] ?? body;

    if (isValidReport(candidate) && Math.random() < SAMPLE_RATE) {
      // event.message is unconditionally redacted by scrubEvent (see
      // sentryScrub.ts), so the actual detail goes in tags/extra instead,
      // which it leaves alone for non-URL-shaped values.
      Sentry.captureMessage("CSP violation", {
        level: "warning",
        tags: {
          violatedDirective:
            truncate(candidate["violated-directive"] ?? candidate["effective-directive"]) ??
            "unknown",
          blockedUri: truncate(candidate["blocked-uri"]) ?? "unknown",
        },
        extra: {
          documentUri: truncate(scrubUrl(candidate["document-uri"])),
          sourceFile: truncate(scrubUrl(candidate["source-file"])),
          lineNumber: candidate["line-number"],
        },
      });
    }
  } catch {
    // Malformed report body — nothing useful to record, but still
    // acknowledge the request so the browser doesn't retry indefinitely.
  }

  return new Response(null, { status: 204 });
}
