import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CalendarFeedSection } from "@/components/CalendarFeed";
import {
  ClockIcon,
  ForwardIcon,
  LockIcon,
  MailIcon,
  PinIcon,
  StackIcon,
  TargetIcon,
  TrashIcon,
} from "@/components/icons";
import { signOut } from "@/app/login/actions";
import { getCalendarFeedState } from "@/app/account/calendar-feed/actions";
import { getCurrentProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import { formatDistance } from "@/lib/format";
import { formatMinutesAsClock, parseTimeToMinutes, WEEKDAY_KEYS } from "@/lib/scheduling";

/**
 * One-line summary of a per-day working-hours map. When every enabled day
 * shares the same start/end (the common case, including the default) that
 * one window is shown; otherwise the days genuinely differ, so a plain
 * "Varies by day" is more honest than a squeezed multi-range string.
 */
function summarizeWorkingHours(
  workingHours: Record<string, { enabled: boolean; start: string; end: string }>
): string {
  const enabledDays = WEEKDAY_KEYS.filter((day) => workingHours[day]?.enabled);
  if (enabledDays.length === 0) {
    return "No working days set";
  }

  const first = workingHours[enabledDays[0]];
  const uniform = enabledDays.every(
    (day) => workingHours[day].start === first.start && workingHours[day].end === first.end
  );

  if (!uniform) {
    return "Varies by day";
  }

  return `${formatMinutesAsClock(parseTimeToMinutes(first.start))} – ${formatMinutesAsClock(
    parseTimeToMinutes(first.end)
  )}`;
}

/**
 * Up to two initials for the avatar placeholder: first + last word of a
 * real name, or the first letter of whatever we're falling back to (an
 * email, for an account that predates the full_name column).
 */
function initialsOf(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ securityMessage?: string }>;
}) {
  const { securityMessage } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName = profile.full_name || user?.email || "Your account";
  const workingHours = summarizeWorkingHours(profile.working_hours);

  const initialFeedState = await getCalendarFeedState();

  return (
    <AppShell>
      <div className="screen-head">
        <div className="wordmark">Booktight</div>
      </div>

      {securityMessage && (
        <p className="error-text" style={{ color: "var(--success)", marginTop: 12 }}>
          {securityMessage}
        </p>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <div className="account-header">
          <span className="account-avatar" aria-hidden="true">
            {initialsOf(displayName)}
          </span>
          <span className="account-header-body">
            <span className="account-header-name">{displayName}</span>
            {profile.business_name && (
              <span className="account-header-business">{profile.business_name}</span>
            )}
          </span>
        </div>
        <Link
          href="/account/edit/profile"
          className="btn btn--outline btn--sm"
          // .btn never sets display, so this <a> defaults to inline —
          // vertical margins are ignored on inline elements, which is why
          // marginTop below was silently doing nothing. inline-block (not
          // block/btn--block) keeps it sized to its content instead of
          // stretching full-width.
          style={{ display: "inline-block", marginTop: 14 }}
        >
          Edit profile
        </Link>
      </div>

      <div className="section-label" style={{ marginTop: 20, marginBottom: 8 }}>
        Business Rules
      </div>
      <div className="card">
        {/* Home address lives on the profile edit screen, not business
            rules — it's stored alongside the identity fields and needs the
            address autocomplete + re-geocoding that form already has. */}
        <Link href="/account/edit/profile" className="summary-row">
          <span className="summary-row-icon">
            <PinIcon />
          </span>
          <span className="summary-row-body">
            <span className="summary-row-label">Starting Location</span>
            <span className="summary-row-value">{profile.home_address}</span>
          </span>
          <span className="summary-row-chevron">
            <ForwardIcon />
          </span>
        </Link>
        <Link href="/account/edit/business-rules" className="summary-row">
          <span className="summary-row-icon">
            <ClockIcon />
          </span>
          <span className="summary-row-body">
            <span className="summary-row-label">Working Hours</span>
            <span className="summary-row-value">{workingHours}</span>
          </span>
          <span className="summary-row-chevron">
            <ForwardIcon />
          </span>
        </Link>
        <Link href="/account/edit/business-rules" className="summary-row">
          <span className="summary-row-icon">
            <TargetIcon />
          </span>
          <span className="summary-row-body">
            <span className="summary-row-label">Max Travel Range</span>
            <span className="summary-row-value">
              {formatDistance(profile.max_travel_range_km, profile.distance_unit)} from home base
            </span>
          </span>
          <span className="summary-row-chevron">
            <ForwardIcon />
          </span>
        </Link>
        <Link href="/account/edit/business-rules" className="summary-row">
          <span className="summary-row-icon">
            <StackIcon />
          </span>
          <span className="summary-row-body">
            <span className="summary-row-label">Max Jobs Per Day</span>
            <span className="summary-row-value">
              {profile.max_jobs_per_day ?? "No limit"}
            </span>
          </span>
          <span className="summary-row-chevron">
            <ForwardIcon />
          </span>
        </Link>
      </div>

      <div className="section-label" style={{ marginTop: 20, marginBottom: 8 }}>
        Account
      </div>
      <div className="card">
        <Link href="/account/edit/security" className="summary-row">
          <span className="summary-row-icon">
            <MailIcon />
          </span>
          <span className="summary-row-body">
            <span className="summary-row-label">Email</span>
            <span className="summary-row-value">{user?.email ?? "—"}</span>
          </span>
          <span className="summary-row-chevron">
            <ForwardIcon />
          </span>
        </Link>
        <Link href="/account/edit/security" className="summary-row">
          <span className="summary-row-icon">
            <LockIcon />
          </span>
          <span className="summary-row-body">
            <span className="summary-row-label">Password</span>
            <span className="summary-row-value">••••••••</span>
          </span>
          <span className="summary-row-chevron">
            <ForwardIcon />
          </span>
        </Link>
        <Link href="/account/delete" className="summary-row">
          <span className="summary-row-icon" style={{ background: "var(--tint-warning)", color: "var(--warning)" }}>
            <TrashIcon />
          </span>
          <span className="summary-row-body">
            <span className="summary-row-label" style={{ color: "var(--warning)" }}>
              Delete Account
            </span>
          </span>
          <span className="summary-row-chevron">
            <ForwardIcon />
          </span>
        </Link>
      </div>

      <form action={signOut} style={{ marginTop: 20 }}>
        <button
          type="submit"
          className="btn btn--outline btn--block"
          style={{ color: "var(--warning)" }}
        >
          Sign out
        </button>
      </form>

      <CalendarFeedSection initialFeedState={initialFeedState} />

      <p className="version">v1.0.2-stable</p>
    </AppShell>
  );
}
