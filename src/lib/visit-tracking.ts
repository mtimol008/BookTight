/**
 * Shared, dependency-free rules for the anonymous visit beacon.
 *
 * Safe to import from both client and server code: no secrets, no Supabase
 * client, and nothing here can identify a visitor. The only values that
 * ever leave the browser are one of the two allowed paths, a normalised
 * `?ref=` label and a coarse mobile/desktop bucket.
 */

export const VISIT_PATHS = ["/", "/signup"] as const;
export type VisitPath = (typeof VISIT_PATHS)[number];

export const VISIT_DEVICES = ["mobile", "desktop"] as const;
export type VisitDevice = (typeof VISIT_DEVICES)[number];

export const NO_REF = "none";
export const OTHER_REF = "other";

const REF_PATTERN = /^[a-z0-9_-]{1,40}$/;

export function isVisitPath(value: unknown): value is VisitPath {
  return typeof value === "string" && (VISIT_PATHS as readonly string[]).includes(value);
}

export function isVisitDevice(value: unknown): value is VisitDevice {
  return typeof value === "string" && (VISIT_DEVICES as readonly string[]).includes(value);
}

/**
 * `?ref=Nov-B` and `?ref= nov-b ` are the same campaign. Anything that
 * isn't a short URL-safe label collapses to `other`, so referrals can
 * never become a free-text field (or a place to smuggle personal data).
 */
export function normaliseVisitRef(raw: unknown): string {
  if (typeof raw !== "string") return NO_REF;
  const value = raw.trim().toLowerCase();
  if (value === "") return NO_REF;
  return REF_PATTERN.test(value) ? value : OTHER_REF;
}

/** Deliberately coarse: viewport width only, no user-agent sniffing. */
export function deviceFromWidth(width: number): VisitDevice {
  return width < 768 ? "mobile" : "desktop";
}
