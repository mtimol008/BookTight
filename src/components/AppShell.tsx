"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { syncTimezoneIfDefault } from "@/app/account/actions";
import { getEngagementState, markTourShown } from "@/app/actions";
import { EngagementProvider } from "@/components/EngagementProvider";
import { NavTour } from "@/components/NavTour";
import type { EngagementState } from "@/lib/profiles";

function WeekIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 5V3M15 5V3" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M12 9v7M8.5 12.5h7" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <circle cx="8" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </svg>
  );
}

const NAV = [
  { href: "/", label: "Week", Icon: WeekIcon },
  { href: "/add", label: "Add", Icon: AddIcon },
  { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/account", label: "Account", Icon: AccountIcon },
];

/**
 * The phone-shaped column every signed-in screen sits in, plus the bottom
 * nav. Auth screens deliberately render outside this — they have no nav.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Starts empty (no hints/tour shown yet) rather than undefined, so
  // <Hint> children always have a real Set to check against — they'd just
  // render nothing extra for the brief window before the real state
  // arrives, never crash on a missing context value.
  const [engagementState, setEngagementState] = useState<EngagementState>({});
  const [showTour, setShowTour] = useState(false);
  // Set while the tour wants to show but a field had focus at the moment
  // it would have appeared — consumed (and cleared) once it actually
  // shows, so a stray late timer can't re-trigger it after that.
  const tourPendingRef = useRef(false);
  const tourPendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Account screens are all forms (edit profile, security, business
  // rules...) — a nav tour popping up mid-edit there is only ever an
  // interruption, never useful. Skipping it here doesn't lose it: tourShown
  // stays false server-side until dismissed, so it simply shows the next
  // time this account visits Week, Add or Calendar instead.
  const tourExcludedOnThisPage =
    pathname === "/account" || pathname.startsWith("/account/");

  // Only shows the tour if no field is focused and nothing else (e.g.
  // AhaMomentModal) is already on screen — called both right away (if
  // nothing's in the way yet) and after a pending tour's post-blur delay.
  function showTourIfClear() {
    if (
      document.body.dataset.fieldFocused === "true" ||
      document.querySelector(".modal-backdrop")
    ) {
      return;
    }
    tourPendingRef.current = false;
    setShowTour(true);
  }

  // First real entry into the app, regardless of which /welcome choice
  // was made: the tour only ever fires once, whenever this next fires
  // true for the first time. Fetched per-mount rather than passed down
  // from each page, since AppShell has no server-side data of its own
  // today and adding it would mean touching every page that renders one.
  useEffect(() => {
    getEngagementState()
      .then((state) => {
        setEngagementState(state);
        if (state.tourShown || tourExcludedOnThisPage) {
          return;
        }
        if (document.body.dataset.fieldFocused === "true") {
          tourPendingRef.current = true;
        } else {
          showTourIfClear();
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismissTour() {
    setShowTour(false);
    tourPendingRef.current = false;
    setEngagementState((current) => ({ ...current, tourShown: true }));
    markTourShown().catch(() => {});
  }

  // Flags the body while a form field has focus, so the fixed nav and FAB
  // can get out of the way of whatever the OS puts over the bottom of the
  // screen — the keyboard, or a date/time picker sheet.
  useEffect(() => {
    const isField = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);

    const onFocusIn = (event: FocusEvent) => {
      if (isField(event.target)) {
        document.body.dataset.fieldFocused = "true";
      }
    };
    const onFocusOut = (event: FocusEvent) => {
      if (!isField(event.target)) {
        return;
      }
      delete document.body.dataset.fieldFocused;

      // A tour was waiting for this field (or another one) to free up.
      // Don't show it the instant focus leaves — give the UI a moment to
      // settle (e.g. an address suggestion turning into a confirm step)
      // and re-check right before showing, since a lot can change in
      // 800ms.
      if (tourPendingRef.current) {
        if (tourPendingTimeoutRef.current !== null) {
          clearTimeout(tourPendingTimeoutRef.current);
        }
        tourPendingTimeoutRef.current = setTimeout(() => {
          tourPendingTimeoutRef.current = null;
          if (tourPendingRef.current) {
            showTourIfClear();
          }
        }, 800);
      }
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      delete document.body.dataset.fieldFocused;
      if (tourPendingTimeoutRef.current !== null) {
        clearTimeout(tourPendingTimeoutRef.current);
      }
    };
  }, []);

  // One-time self-heal for accounts still stuck on the dead 'UTC' default
  // (see 20260812000000_signup_timezone.sql) — silently corrects it using
  // the browser's real zone. No-ops once the stored value is anything else,
  // including a deliberate manual edit in Account.
  useEffect(() => {
    syncTimezoneIfDefault(Intl.DateTimeFormat().resolvedOptions().timeZone).catch(() => {});
  }, []);

  return (
    <EngagementProvider initialState={engagementState}>
      <main className="shell">{children}</main>
      <nav className="nav">
        {NAV.map(({ href, label, Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`nav-item${isActive ? " is-active" : ""}`}
            >
              <Icon />
              {label}
            </Link>
          );
        })}
      </nav>
      {showTour && <NavTour onDismiss={dismissTour} />}
    </EngagementProvider>
  );
}
