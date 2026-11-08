import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages logged-out visitors can reach, and logged-in users get bounced away
// from (back to "/") since they have no reason to see a login/signup form.
const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];

// Publicly fetchable endpoints that skip the login gate entirely, in both
// directions — e.g. the .ics calendar feed, which Apple/Google/Outlook
// fetch with no Supabase session at all, and which a logged-in user should
// still be able to open directly (e.g. the "Test in Browser" link).
// /email-confirmed belongs here too: it's the page Supabase's confirmation
// link lands on, reached by a brand-new user who by definition isn't
// signed in yet — without it, the login gate bounced them straight to
// /login before they ever saw the confirmation. /reset-password is the
// same idea for the recovery link, except it's deliberately NOT in
// AUTH_PAGES — a logged-in user should still be able to use it (the
// recovery link itself, not being logged in, is what's granting access
// here), where /login and /signup never make sense once already signed in.
const PUBLIC_PATHS = [
  ...AUTH_PAGES,
  "/api/calendar/feed",
  "/api/health",
  "/api/csp-report",
  "/email-confirmed",
  "/reset-password",
  // Legal/support pages — reachable whether signed in or out, same idea as
  // /reset-password above (not AUTH_PAGES: a logged-in user should still be
  // able to read these, unlike /login or /signup).
  "/contact",
  "/privacy",
  "/terms",
  "/help",
  // Stripe's servers POST here with no Supabase session at all — same
  // category as the calendar feed, authenticated by its own signature
  // instead (verified inside the route itself).
  "/api/stripe/webhook",
  // Vercel's cron scheduler hits this with no Supabase session either —
  // authenticated by the CRON_SECRET header the route checks itself.
  "/api/cron/deletion-warnings",
  // Next's generated metadata routes (src/app/sitemap.ts, robots.ts,
  // opengraph-image.tsx) — search crawlers and social-link unfurlers fetch
  // these with no session at all, same as the calendar feed above.
  "/sitemap.xml",
  "/robots.txt",
  "/opengraph-image",
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Refreshes the session cookie if needed — must be called on every
  // request so tokens don't silently expire mid-session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // "/" itself is public too (the landing page, for a signed-out visitor —
  // page.tsx renders the app instead once there's a session). It's an
  // EXACT match, kept out of the PUBLIC_PATHS array on purpose: every path
  // starts with "/", so adding it as a prefix there would make every route
  // public.
  const isPublicPath =
    request.nextUrl.pathname === "/" ||
    PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));
  const isAuthPage = AUTH_PAGES.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
