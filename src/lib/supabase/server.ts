import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Retries a Supabase query once, after a brief delay, if it comes back with
 * the transient "JWT issued at future" error — seen occasionally on the
 * very first query right after signing in, when a freshly minted token
 * reaches a backend node whose clock hasn't caught up to it yet. Confirmed
 * not a real clock problem on our end (device clock is within a few
 * seconds of Supabase's), so a short retry is the right fix rather than
 * anything clock-related. Any other error passes through untouched.
 */
export async function withAuthRetry<T>(
  // Supabase's query builders are thenable, not real Promise instances, so
  // this takes anything awaitable rather than requiring Promise<T> —
  // letting the actual builder type flow through and get inferred as T
  // instead of collapsing to {} when a stricter type doesn't structurally
  // match.
  run: () => PromiseLike<{ data: T; error: { message: string } | null }>
): Promise<{ data: T; error: { message: string } | null }> {
  const result = await run();
  if (result.error?.message.includes("JWT issued at future")) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return run();
  }
  return result;
}

// Call this fresh inside every Server Component / Server Action — it reads
// the current request's cookies, so it can't be a shared module-level client.
export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.local.example to .env.local and fill in your project's values."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component (not a Server Action/Route
          // Handler) — cookies can't be set there. Harmless as long as the
          // middleware is refreshing sessions on every request.
        }
      },
    },
  });
}
