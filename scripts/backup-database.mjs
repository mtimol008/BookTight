// One-command database backup — run from anywhere this project is
// checked out, saves a full copy of every table to your own computer so
// you have one even though the free Supabase tier keeps none itself (Free
// has no automatic backups at all — see the comment in src/app/privacy/page.tsx
// section 8). Run regularly by hand (weekly is reasonable at this scale);
// nothing here schedules it automatically.
//
//   npm run backup
//
// Saves to a new timestamped folder under:
//   Windows: %USERPROFILE%\Desktop\booktight-backups\<timestamp>\
//   macOS/Linux: ~/Desktop/booktight-backups/<timestamp>/
// (matching the folder already in use from earlier manual backups — see
// its existing dated subfolders). Override with BOOKTIGHT_BACKUP_DIR=
// if you want it saved somewhere else.
//
// One JSON file per table, plus auth_users.json (Supabase Auth's users,
// which live outside the "public" tables below and need a separate API).
// Paginates every table 1000 rows at a time rather than trusting
// PostgREST's default row cap, so this stays a real backup as the data
// grows, not a silent 1000-row truncation.
//
// TABLES must be kept in sync with supabase/migrations/*.sql by hand —
// add a table here the same day you add its migration, or a future
// table silently won't be backed up.
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const TABLES = [
  "profiles",
  "jobs",
  "subscriptions",
  "stripe_webhook_events",
  "deletion_warning_log",
  "account_deletion_log",
  "geocode_cache",
  "geocode_usage",
  "ip_rate_limit",
  "analytics_events",
];

const PAGE_SIZE = 1000;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local.");
  process.exit(1);
}
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const destDir =
  process.env.BOOKTIGHT_BACKUP_DIR ||
  path.join(os.homedir(), "Desktop", "booktight-backups", timestamp);
mkdirSync(destDir, { recursive: true });

async function fetchAllRows(table) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await admin.from(table).select("*").range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function fetchAllAuthUsers() {
  const users = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
    page++;
  }
  return users;
}

console.log(`Backing up to ${destDir}\n`);

const results = [];

for (const table of TABLES) {
  try {
    const rows = await fetchAllRows(table);
    writeFileSync(path.join(destDir, `${table}.json`), JSON.stringify(rows, null, 2));
    results.push({ table, rows: rows.length, ok: true });
    console.log(`  ${table}: ${rows.length} row(s)`);
  } catch (err) {
    results.push({ table, ok: false, error: err.message });
    console.error(`  ${table}: FAILED — ${err.message}`);
  }
}

try {
  const users = await fetchAllAuthUsers();
  // Password hashes are never included in this API response — Supabase's
  // admin listUsers() only ever returns the user record (email, metadata,
  // timestamps), not credentials.
  writeFileSync(path.join(destDir, "auth_users.json"), JSON.stringify(users, null, 2));
  results.push({ table: "auth_users", rows: users.length, ok: true });
  console.log(`  auth_users: ${users.length} row(s)`);
} catch (err) {
  results.push({ table: "auth_users", ok: false, error: err.message });
  console.error(`  auth_users: FAILED — ${err.message}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\nSaved to: ${destDir}`);
if (failed.length > 0) {
  console.error(`\n${failed.length} table(s) failed — backup is incomplete. Re-run; if it keeps failing, check SUPABASE_SECRET_KEY and your network connection.`);
  process.exit(1);
}
console.log("\nBackup complete. Keep this folder somewhere safe (e.g. a second drive or cloud storage) — it's on your computer only, nowhere else.");
