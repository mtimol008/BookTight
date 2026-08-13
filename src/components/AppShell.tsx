"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { syncTimezoneIfDefault } from "@/app/account/actions";

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
      if (isField(event.target)) {
        delete document.body.dataset.fieldFocused;
      }
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      delete document.body.dataset.fieldFocused;
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
    <>
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
    </>
  );
}
