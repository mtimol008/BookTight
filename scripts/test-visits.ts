// Staging-only checks for the anonymous visit beacon. Refuses anything but
// the staging project ref (see scripts/lib/supabaseTarget.ts), writes only
// rows tagged with a random throwaway `test-...` ref, then deletes them.
// No production project, account or row is read or written here.
//
// Run with: npm run test:visits
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { resolveTarget } from "./lib/supabaseTarget";
import {
  deviceFromWidth,
  isVisitDevice,
  isVisitPath,
  normaliseVisitRef,
} from "../src/lib/visit-tracking";

const target = resolveTarget(["--target=staging"]);
if (target.target !== "staging") {
  throw new Error("test:visits must never run against production — stopping.");
}

const admin = createClient(target.url, target.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const testRef = `test-${randomBytes(4).toString("hex")}`;
let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!pass) failures++;
}

function beaconHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Dest": "empty",
  };
}

function beaconRequest(body: unknown, headers = beaconHeaders()) {
  return new Request("http://localhost/api/visits", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

type VisitRow = {
  visit_date: string;
  path: string;
  ref: string;
  device: string;
  visits: number;
};

async function testRows(): Promise<VisitRow[]> {
  const { data, error } = await admin
    .from("page_visit_counts")
    .select("visit_date,path,ref,device,visits")
    .eq("ref", testRef);
  if (error) throw error;
  return (data ?? []) as VisitRow[];
}

function visits(rows: VisitRow[], path: string, device: string): number {
  return rows.find((row) => row.path === path && row.device === device)?.visits ?? 0;
}

async function main() {
  // Pure, database-free rules first.
  check(
    "only the two public paths are accepted",
    isVisitPath("/") && isVisitPath("/signup") && !isVisitPath("/admin")
  );
  check(
    "only the two coarse devices are accepted",
    isVisitDevice("mobile") && isVisitDevice("desktop") && !isVisitDevice("tablet")
  );
  check(
    "refs are lowercased, trimmed and bounded",
    normaliseVisitRef("  Nov-B ") === "nov-b" &&
      normaliseVisitRef(null) === "none" &&
      normaliseVisitRef("a".repeat(41)) === "other"
  );
  check(
    "device comes from width only",
    deviceFromWidth(375) === "mobile" && deviceFromWidth(1024) === "desktop"
  );

  // The route reads its Supabase env at call time, after resolveTarget has
  // pointed this process at staging.
  const { POST } = await import("../src/app/api/visits/route");

  const accepted: [string, unknown][] = [
    ["landing/mobile (uppercase ref normalises)", { path: "/", ref: `  ${testRef.toUpperCase()}  `, device: "mobile" }],
    ["landing/mobile again", { path: "/", ref: testRef, device: "mobile" }],
    ["landing/desktop", { path: "/", ref: testRef, device: "desktop" }],
    ["signup/desktop", { path: "/signup", ref: testRef, device: "desktop" }],
  ];
  for (const [label, body] of accepted) {
    const res = await POST(beaconRequest(body));
    check(`${label}: accepted`, res.status === 204, `HTTP ${res.status}`);
  }

  const rows = await testRows();
  check("view exposes only aggregate columns", Object.keys(rows[0] ?? {}).sort().join(",") === "device,path,ref,visit_date,visits");

  const { data: rawRows, error: rawError } = await admin
    .from("page_visits")
    .select("*")
    .eq("ref", testRef)
    .limit(1);
  if (rawError) throw rawError;
  check(
    "table stores no id, timestamp, IP or user-agent",
    Object.keys(rawRows?.[0] ?? {}).sort().join(",") === "device,path,ref,visit_date,visits"
  );

  check("landing/mobile counted twice", visits(rows, "/", "mobile") === 2, `${visits(rows, "/", "mobile")}`);
  check("landing/desktop counted once", visits(rows, "/", "desktop") === 1, `${visits(rows, "/", "desktop")}`);
  check("signup/desktop counted once", visits(rows, "/signup", "desktop") === 1, `${visits(rows, "/signup", "desktop")}`);

  // Obvious bots (no browser Fetch headers) and malformed beacons are
  // silently ignored, with no row change.
  const beforeBad = JSON.stringify(await testRows());
  const rejected: [string, unknown, Record<string, string>][] = [
    ["non-browser caller", { path: "/", ref: testRef, device: "mobile" }, { "Content-Type": "application/json" }],
    ["unknown path", { path: "/admin", ref: testRef, device: "mobile" }, beaconHeaders()],
    ["unknown device", { path: "/", ref: testRef, device: "tablet" }, beaconHeaders()],
  ];
  for (const [label, body, headers] of rejected) {
    const res = await POST(beaconRequest(body, headers));
    check(`${label}: ignored without an error`, res.status === 204, `HTTP ${res.status}`);
  }
  check("ignored beacons did not change counts", JSON.stringify(await testRows()) === beforeBad);

  // No anon/authenticated role can read the totals or write through the RPC.
  if (!target.publishableKey) {
    throw new Error("Missing staging publishable key — cannot verify public access is blocked.");
  }
  const anon = createClient(target.url, target.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: viewErr } = await anon.from("page_visit_counts").select("*").limit(1);
  check("anon cannot read the counts view", Boolean(viewErr));
  const { error: tableErr } = await anon.from("page_visits").select("*").limit(1);
  check("anon cannot read the counts table", Boolean(tableErr));
  const { error: rpcErr } = await anon.rpc("record_page_visit", {
    p_path: "/",
    p_ref: testRef,
    p_device: "mobile",
  });
  check("anon cannot write through the RPC", Boolean(rpcErr));
}

async function run() {
  try {
    await main();
  } catch (error) {
    failures++;
    console.error("Unexpected error:", error instanceof Error ? error.message : error);
  } finally {
    const { error } = await admin.from("page_visits").delete().eq("ref", testRef);
    check("throwaway staging rows removed", !error, error?.message ?? "");
  }

  if (failures) {
    console.error(`\n${failures} visit test check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll visit checks passed (staging only).");
}

void run();
