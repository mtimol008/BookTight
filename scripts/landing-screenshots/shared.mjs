import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";

export const DIR = path.dirname(fileURLToPath(import.meta.url));
/** Holds the demo account's id between seed, capture and cleanup. Gitignored. */
export const STATE_FILE = path.join(DIR, ".demo-account.json");
/** Raw 1170×2532 PNG captures. Gitignored. */
export const OUT_DIR = path.join(DIR, "out");

// Read from src/lib/terms.ts so it always matches — otherwise the app sends
// the demo account to /accept-terms instead of the week view.
export const TERMS_VERSION = readFileSync(path.join(DIR, "../../src/lib/terms.ts"), "utf8").match(
  /TERMS_VERSION\s*=\s*"([^"]+)"/,
)[1];

/** "YYYY-MM-DD" for the Monday of the current week, in London time. */
export function mondayOfThisWeek() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  const diff = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
