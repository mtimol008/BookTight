// Regression test for the reset EMAIL's link format — the half of the
// password-reset flow scripts/test-password-reset.ts can't see. That test
// builds its link with admin.generateLink(), which always produces the
// hash-fragment format the reset page reads; the real Forgot password form
// went through the @supabase/ssr server client instead, which forces PKCE,
// so real emails landed on /reset-password?code=... and the page always
// said "invalid or has expired".
//
// Supabase decides the link format from the request itself: a
// code_challenge in the /recover request body = a ?code= (PKCE) link; none
// = a #access_token= link. So this checks the request the app's own
// sendPasswordResetEmail actually sends — intercepted before it leaves the
// process, so no email is sent and no database is touched.
//
//   npm run test:password-reset-request
import { createServerClient } from "@supabase/ssr";
import { sendPasswordResetEmail } from "../src/lib/passwordReset";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||= "test-publishable-key";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!pass) failures++;
}

interface Captured {
  url: string;
  body: Record<string, unknown>;
}

function capturingFetch(sink: Captured[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    sink.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

async function main() {
  const redirectTo = "https://booktight.co.uk/reset-password";

  // 1. What the app's Forgot password action sends now.
  const sent: Captured[] = [];
  await sendPasswordResetEmail("someone@example.com", redirectTo, capturingFetch(sent));
  const recover = sent.find((r) => r.url.includes("/auth/v1/recover"));
  check("sendPasswordResetEmail calls Supabase's /recover endpoint", !!recover, sent.map((r) => r.url).join(", "));
  check(
    "request has no code_challenge -> email link uses #access_token (what /reset-password reads)",
    !!recover && recover.body.code_challenge == null,
    `code_challenge=${JSON.stringify(recover?.body.code_challenge)}`
  );
  check("request redirects to /reset-password", !!recover && recover.url.includes(encodeURIComponent(redirectTo)), recover?.url);

  // 2. Control: the old path (the @supabase/ssr server client) DOES send a
  //    code_challenge — proving check 1 would have caught the bug.
  const old: Captured[] = [];
  const ssrClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      global: { fetch: capturingFetch(old) },
    }
  );
  await ssrClient.auth.resetPasswordForEmail("someone@example.com", { redirectTo });
  const oldRecover = old.find((r) => r.url.includes("/auth/v1/recover"));
  check(
    "control: the old ssr-client request DID include a code_challenge (the bug)",
    !!oldRecover && typeof oldRecover.body.code_challenge === "string" && oldRecover.body.code_challenge.length > 0
  );

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll password-reset request checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
