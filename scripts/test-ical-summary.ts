// Calendar feed: short SUMMARY, full DESCRIPTION.
//
// SUMMARY must be "Customer — first line of description", cut to 60
// characters with "…"; the full description (every line), the address and
// the job number go in DESCRIPTION. Before this, SUMMARY carried the whole
// description, so a multi-line description gave the event a multi-line
// title in calendar apps.
//
// The feed is generated in child processes under TZ=UTC and
// TZ=Europe/London and must come out identical (Vercel runs in UTC; a dev
// machine usually doesn't). Pure — no database, no network.
//
//   npm run test:ical-summary
import { spawnSync } from "node:child_process";
import path from "node:path";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!pass) failures++;
}

const BASE = {
  latitude: 51.45,
  longitude: -2.6,
  date: "2026-11-19",
  time_slot_type: "specific",
  specific_time: "13:30",
  duration_minutes: 180,
  manual_position: null,
  status: "scheduled",
  urgency: "normal",
  created_at: "2026-11-16T00:00:00Z",
};

const JOBS = [
  {
    ...BASE,
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    customer_name: "The Mall Café, Clifton",
    description:
      "Replace hot water cylinder, drain down first.\nAccess via rear lane, gate code 2468, call Jo on arrival.",
    address: "The Mall, Clifton, Bristol BS8 4DR",
  },
  {
    ...BASE,
    id: "aaaaaaaa-0000-0000-0000-000000000002",
    customer_name: "Helen Marsh",
    description: "Annual boiler service",
    address: "22 Cotham Hill, Bristol BS6 6LF",
  },
  {
    ...BASE,
    id: "aaaaaaaa-0000-0000-0000-000000000003",
    customer_name: "No Description Ltd",
    description: null,
    address: "1 Test Street, Bristol",
  },
  {
    ...BASE,
    id: "aaaaaaaa-0000-0000-0000-000000000004",
    customer_name: "Blank First Line",
    description: "\n   \nActual first line\nsecond",
    address: "2 Test Street, Bristol",
    time_slot_type: "all_day",
    specific_time: null,
  },
];

// ------------------------------------------------------------ worker mode
async function workerMain() {
  const { jobToICalEvent, generateICalFeed } = await import("../src/lib/ical");
  const events = JOBS.map((job, i) =>
    jobToICalEvent(
      job as unknown as import("../src/lib/jobs").JobRecord,
      "https://booktight.co.uk",
      job.time_slot_type === "specific" ? { jobId: job.id, startMinutes: 13 * 60 + 30 + i * 200, endMinutes: 16 * 60 + 30 + i * 200 } : null,
      "Europe/London"
    )
  );
  const feed = generateICalFeed(events, "Europe/London")
    .split("\r\n")
    .filter((l) => !l.startsWith("DTSTAMP:")) // the only line that legitimately differs run to run
    .join("\r\n");
  process.stdout.write(JSON.stringify({ processTZ: process.env.TZ ?? "(unset)", feed }));
}

function runWorker(tz: string): { processTZ: string; feed: string } {
  const result = spawnSync(
    process.execPath,
    [path.join(process.cwd(), "node_modules/tsx/dist/cli.mjs"), __filename, "--worker"],
    { cwd: process.cwd(), env: { ...process.env, TZ: tz }, encoding: "utf8" }
  );
  if (result.status !== 0) throw new Error(`worker failed under TZ=${tz}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

/** One VEVENT's property lines, keyed by property name (params stripped). */
function eventsOf(feed: string): Record<string, string>[] {
  return feed
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((block) => {
      const props: Record<string, string> = {};
      for (const line of block.split("\r\n")) {
        const m = line.match(/^([A-Z-]+)[;:]/);
        if (m) props[m[1]] = line.slice(line.indexOf(":") + 1);
      }
      return props;
    });
}

async function main() {
  // 1. buildEventSummary, directly.
  const { buildEventSummary, SUMMARY_MAX_LENGTH } = await import("../src/lib/ical");
  check("max length is 60", SUMMARY_MAX_LENGTH === 60);
  check("short summary is unchanged", buildEventSummary("Helen Marsh", "Annual boiler service") === "Helen Marsh — Annual boiler service");
  check("no description -> customer name only", buildEventSummary("Acme", null) === "Acme" && buildEventSummary("Acme", "  \n ") === "Acme");
  const exactly60 = "C — " + "x".repeat(56);
  check("exactly 60 chars -> no ellipsis", buildEventSummary("C", "x".repeat(56)) === exactly60);
  const cut = buildEventSummary("C", "x".repeat(57));
  check("61 chars -> cut to 60 ending in …", Array.from(cut).length === 60 && cut.endsWith("…"), cut);
  const emoji = buildEventSummary("C", "x".repeat(54) + "🔧🔧🔧");
  check(
    "an emoji at the cut point is not split in half",
    Array.from(emoji).length === 60 && emoji.endsWith("🔧…") && !/[\uD800-\uDFFF]…$/.test(emoji.replace("🔧…", "")),
    emoji
  );
  check("trailing space before the ellipsis is trimmed", !buildEventSummary("C", "x".repeat(54) + "     yyyy").includes(" …"));

  // 2. The real feed, under two process timezones.
  const utc = runWorker("UTC");
  const london = runWorker("Europe/London");
  check("worker ran under TZ=UTC", utc.processTZ === "UTC", utc.processTZ);
  check("worker ran under TZ=Europe/London", london.processTZ === "Europe/London", london.processTZ);
  check("feed is identical under TZ=UTC and TZ=Europe/London", utc.feed === london.feed && utc.feed.length > 0);

  for (const [label, run] of [["UTC", utc], ["Europe/London", london]] as const) {
    const [cafe, helen, noDesc, blank] = eventsOf(run.feed);

    check(
      `[${label}] multi-line job: SUMMARY is the first line, cut with …`,
      cafe.SUMMARY === "The Mall Café\\, Clifton — Replace hot water cylinder\\, drain…",
      cafe.SUMMARY
    );
    check(`[${label}] SUMMARY never contains a line break`, eventsOf(run.feed).every((e) => !e.SUMMARY.includes("\\n")));
    check(
      `[${label}] SUMMARY is at most 60 characters once unescaped`,
      eventsOf(run.feed).every((e) => Array.from(e.SUMMARY.replace(/\\([,;\\])/g, "$1")).length <= 60)
    );
    check(
      `[${label}] DESCRIPTION has the full description incl. its line break, then address and job #`,
      cafe.DESCRIPTION ===
        "Replace hot water cylinder\\, drain down first.\\nAccess via rear lane\\, gate code 2468\\, call Jo on arrival." +
          "\\nAddress: The Mall\\, Clifton\\, Bristol BS8 4DR\\nBooktight job #aaaaaaaa",
      cafe.DESCRIPTION
    );
    check(`[${label}] short job: SUMMARY unchanged`, helen.SUMMARY === "Helen Marsh — Annual boiler service", helen.SUMMARY);
    check(`[${label}] no description: SUMMARY is the customer`, noDesc.SUMMARY === "No Description Ltd", noDesc.SUMMARY);
    check(
      `[${label}] no description: DESCRIPTION still has address and job #`,
      noDesc.DESCRIPTION === "Address: 1 Test Street\\, Bristol\\nBooktight job #aaaaaaaa",
      noDesc.DESCRIPTION
    );
    check(`[${label}] blank leading lines skipped for SUMMARY`, blank.SUMMARY === "Blank First Line — Actual first line", blank.SUMMARY);
    check(`[${label}] all-day event still a date`, blank.DTSTART === "20261119" && blank.DTEND === "20261120", `${blank.DTSTART}/${blank.DTEND}`);
    check(`[${label}] timed event keeps its London wall time`, cafe.DTSTART === "20261119T133000", cafe.DTSTART);
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll calendar-feed summary checks passed.");
}

if (process.argv.includes("--worker")) {
  workerMain();
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
