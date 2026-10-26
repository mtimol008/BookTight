import * as Sentry from "@sentry/nextjs";
import { scrubUrl } from "@/lib/sentryScrub";

interface CspReportFields {
  "document-uri"?: string;
  "violated-directive"?: string;
  "effective-directive"?: string;
  "blocked-uri"?: string;
  "source-file"?: string;
  "line-number"?: number;
}

/**
 * Browsers POST here automatically on a CSP violation, per the report-uri
 * set in next.config.ts. Purely a collection point for the observation
 * window described in the Phase 2 plan — the policy itself stays
 * report-only until this has shown no unexpected violations across every
 * real flow.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const report: CspReportFields = body["csp-report"] ?? body;

    // event.message is unconditionally redacted by scrubEvent (see
    // sentryScrub.ts), so the actual detail goes in tags/extra instead,
    // which it leaves alone for non-URL-shaped values.
    Sentry.captureMessage("CSP violation", {
      level: "warning",
      tags: {
        violatedDirective:
          report["violated-directive"] ?? report["effective-directive"] ?? "unknown",
        blockedUri: report["blocked-uri"] ?? "unknown",
      },
      extra: {
        documentUri: scrubUrl(report["document-uri"]),
        sourceFile: scrubUrl(report["source-file"]),
        lineNumber: report["line-number"],
      },
    });
  } catch {
    // Malformed report body — nothing useful to record, but still
    // acknowledge the request so the browser doesn't retry indefinitely.
  }

  return new Response(null, { status: 204 });
}
