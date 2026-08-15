import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages logged-out visitors can reach, and logged-in users get bounced away
// from (back to "/") since they have no reason to see a login/signup form.
const AUTH_PAGES = ["/login", "/signup"];

// Publicly fetchable endpoints that skip the login gate entirely, in both
// directions — e.g. the .ics calendar feed, which Apple/Google/Outlook
// fetch with no Supabase session at all, and which a logged-in user should
// still be able to open directly (e.g. the "Test in Browser" link).
// /email-confirmed belongs here too: it's the page Supabase's confirmation
// link lands on, reached by a brand-new user who by definition isn't
// signed in yet — without it, the login gate bounced them straight to
// /login before they ever saw the confirmation.
const PUBLIC_PATHS = [...AUTH_PAGES, "/api/calendar/feed", "/email-confirmed"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const isPublicPath = PUBLIC_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );
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
