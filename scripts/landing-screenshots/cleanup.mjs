// Deletes the throwaway demo account. Its profile, jobs, trial, analytics
// events and geocode usage go with it (all cascade from the auth user); the
// one shared row it added — the new job's cached geocode — is removed here.
// Run:
//   npm run screenshots:cleanup                                          # staging
//   npm run screenshots:cleanup -- --target=production --i-really-mean-production
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { STATE_FILE } from "./shared.mjs";
import { resolveTarget } from "../lib/supabase-target.mjs";

if (!existsSync(STATE_FILE)) {
  console.log("No demo account recorded — nothing to clean up.");
  process.exit(0);
}
const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
if (!/^landing-demo-[0-9a-f]+@example\.com$/.test(state.email)) {
  console.error(`Refusing to delete ${state.email}: not a landing-demo account.`);
  process.exit(1);
}

let targetUrl, targetSecret;
try {
  ({ url: targetUrl, secretKey: targetSecret } = resolveTarget());
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const admin = createClient(targetUrl, targetSecret, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: found, error: getError } = await admin.auth.admin.getUserById(state.userId);
if (getError && getError.status !== 404) throw getError;
if (found?.user) {
  if (found.user.email !== state.email) {
    console.error("The recorded id doesn't match the demo email — stopping without deleting.");
    process.exit(1);
  }
  const { error } = await admin.auth.admin.deleteUser(state.userId);
  if (error) throw error;
}

const { error: cacheError } = await admin
  .from("geocode_cache")
  .delete()
  .eq("address_key", state.newJobAddress.trim().toLowerCase());
if (cacheError) console.warn(`Couldn't remove the cached demo address: ${cacheError.message}`);

const { count } = await admin.from("jobs").select("id", { count: "exact", head: true }).eq("user_id", state.userId);
rmSync(STATE_FILE);
console.log(`Demo account deleted (${state.email}). Jobs left for it: ${count ?? 0}.`);
