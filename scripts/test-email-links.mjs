// THROWAWAY — proves the email-link guard in src/lib/email.ts: in
// production, a link is never built from an unset or localhost
// NEXT_PUBLIC_APP_URL; outside production, localhost is accepted as-is
// (that's correct there, not a mistake). Pure function test, no network
// call, NO DATABASE TOUCHED AT ALL — appUrl() reads only process.env.
// Run with: npm run test:email-links
import { appUrl } from "../src/lib/email.ts";

let failures = 0;
function check(label, pass, detail) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!pass) failures++;
}

function throws(fn) {
  try {
    fn();
    return null;
  } catch (err) {
    return err;
  }
}

const realNodeEnv = process.env.NODE_ENV;
const realAppUrl = process.env.NEXT_PUBLIC_APP_URL;

// ---- Production: unset NEXT_PUBLIC_APP_URL must throw.
process.env.NODE_ENV = "production";
delete process.env.NEXT_PUBLIC_APP_URL;
let err = throws(() => appUrl("/account"));
check("production + unset NEXT_PUBLIC_APP_URL: throws", !!err, String(err));

// ---- Production: a localhost value must throw, even a plausible-looking one.
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
err = throws(() => appUrl("/account"));
check("production + localhost NEXT_PUBLIC_APP_URL: throws", !!err, String(err));

// ---- Production: the real value must work and build exactly the right link.
process.env.NEXT_PUBLIC_APP_URL = "https://booktight.co.uk";
let link = null;
err = throws(() => {
  link = appUrl("/account#export");
});
check("production + real NEXT_PUBLIC_APP_URL: does not throw", !err, String(err));
check(
  "production + real NEXT_PUBLIC_APP_URL: builds the exact expected link",
  link === "https://booktight.co.uk/account#export",
  String(link)
);

// ---- Outside production: localhost is fine (this is what local dev/test actually uses).
process.env.NODE_ENV = "development";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
err = throws(() => {
  link = appUrl("/billing");
});
check("development + localhost NEXT_PUBLIC_APP_URL: does not throw", !err, String(err));
check(
  "development + localhost NEXT_PUBLIC_APP_URL: builds the localhost link",
  link === "http://localhost:3000/billing",
  String(link)
);

process.env.NODE_ENV = realNodeEnv;
process.env.NEXT_PUBLIC_APP_URL = realAppUrl;

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll email-link guard checks passed.");
