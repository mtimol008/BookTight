import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Help",
  description:
    "How Booktight's suggestions work, adding it to your Home Screen, and subscribing to your calendar feed.",
};

export default function HelpPage() {
  return (
    <main className="shell shell--bare">
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div className="wordmark wordmark--lg">Booktight</div>
        <div className="tagline" style={{ marginTop: 6 }}>
          Job scheduling, sorted by geography
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1 className="screen-title" style={{ marginBottom: 10 }}>Help</h1>
        <p className="legal-meta">Last updated: 8 November 2026</p>

        <div className="legal-doc">
          <h2>1. How suggestions work</h2>
          <p>
            When you add a job, Booktight looks at its address alongside every job you&apos;ve
            already got booked that week, and works out — for each day — the straight-line
            distance from your home address, to each job, and back home again. It then suggests
            the day and time that adds the <strong>least</strong> extra driving to that day&apos;s
            route.
          </p>
          <p>
            This is straight-line (&ldquo;as the crow flies&rdquo;) distance, not a real route from
            a mapping service — it doesn&apos;t know about traffic, road layout, or which way the
            roads actually go. It&apos;s a good guide for which day makes sense, not a sat-nav.
          </p>
          <p>A suggestion also respects the rules you&apos;ve set in Account:</p>
          <ul>
            <li>
              <strong>Working hours</strong> — each day of the week can have its own hours, or be
              turned off entirely. A day that&apos;s off, or whose hours don&apos;t cover the time
              slot you asked for, is never suggested.
            </li>
            <li>
              <strong>Max jobs per day</strong> — a day already at your limit won&apos;t be
              suggested, even if it would otherwise be the closest.
            </li>
            <li>
              <strong>Max travel range</strong> — a day that would add more driving than you&apos;ve
              allowed isn&apos;t offered as the top suggestion without good reason.
            </li>
            <li>
              <strong>Buffer time</strong> — if you&apos;ve set extra minutes required between
              jobs, that&apos;s added on top of the estimated drive time when checking whether two
              jobs actually fit back to back.
            </li>
          </ul>
          <p>
            How urgency changes the pick: <strong>Urgent</strong> books the soonest available day
            outright, using distance only to break a tie between two equally soon days.{" "}
            <strong>Normal</strong> balances soonest and least driving.{" "}
            <strong>Whenever</strong> leans more on least driving, with a small nudge toward
            filling an otherwise-awkward gap in your week.
          </p>
          <p>
            Booktight also shows why the <em>other</em> days didn&apos;t win — a day might be
            full, off, outside its working hours, or would simply add more driving than a closer
            day would. If you pick a day or time that breaks one of your own rules anyway, you get
            a warning first, not a block — &ldquo;Book it anyway&rdquo; always works, it&apos;s
            just a heads-up before you commit.
          </p>

          <h2 id="home-screen">2. Add Booktight to your Home Screen</h2>
          <p>
            Booktight works like an app once it&apos;s on your phone&apos;s Home Screen — no App
            Store needed, since it&apos;s a web app you add directly from your browser.
          </p>

          <h3>iPhone (Safari)</h3>
          <p className="note" style={{ marginBottom: 8 }}>
            This only works in Safari — not Chrome or another browser on iPhone.
          </p>
          <ol>
            <li>Open Booktight in the <strong>Safari</strong> app.</li>
            <li>
              Tap the <strong>Share</strong> icon (the square with an arrow pointing up).
            </li>
            <li>
              Scroll down the list of options and tap <strong>Add to Home Screen</strong>. If you
              don&apos;t see it, tap <strong>Edit Actions</strong> at the bottom of the list first,
              then add it from there.
            </li>
            <li>
              Leave <strong>Open as Web App</strong> on for a full-screen icon, or turn it off for a
              regular bookmark.
            </li>
            <li>Tap <strong>Add</strong>.</li>
          </ol>

          <h3>Android (Chrome)</h3>
          <ol>
            <li>Open Booktight in <strong>Chrome</strong>.</li>
            <li>
              Tap the three-dot menu on the right of the address bar.
            </li>
            <li>
              Tap <strong>Install and create shortcut</strong> (some versions of Chrome show this
              as <strong>Add to Home screen</strong> instead), then <strong>Install</strong>.
            </li>
            <li>Follow the on-screen instructions.</li>
          </ol>

          <h2 id="subscribing">3. Subscribing to your calendar feed</h2>
          <p>
            In Account, turning on the calendar feed gives you a private web address that your
            phone or computer&apos;s calendar app can check periodically and show your Booktight
            jobs automatically — no copying anything across by hand. Treat that address like a
            password: anyone with the link can see your schedule.
          </p>

          <h3>iPhone (Apple Calendar)</h3>
          <ol>
            <li>Open the <strong>Calendar</strong> app.</li>
            <li>
              Tap <strong>Calendars</strong> at the bottom (or the Calendars button), then tap{" "}
              <strong>Add Calendar</strong> → <strong>Add Subscription Calendar</strong>.
            </li>
            <li>Paste your feed address, then tap <strong>Subscribe</strong> (or <strong>Find</strong>, on newer iOS versions).</li>
            <li>Give it a name and colour if you&apos;d like, then confirm.</li>
          </ol>

          <h3>Google Calendar</h3>
          <p className="note" style={{ marginBottom: 8 }}>
            This has to be done on a computer, in a web browser — Google&apos;s own Calendar app
            on Android or iPhone can&apos;t add a calendar from a URL.
          </p>
          <ol>
            <li>
              On a computer, go to{" "}
              <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer">
                calendar.google.com
              </a>.
            </li>
            <li>
              Next to <strong>Other calendars</strong> in the left sidebar, click{" "}
              <strong>+</strong>, then choose <strong>From URL</strong>.
            </li>
            <li>Paste your feed address, then click <strong>Add calendar</strong>.</li>
          </ol>
          <p className="note">
            Google doesn&apos;t publish a fixed refresh schedule for calendars added this way —
            new or changed jobs can take a while to show up, sometimes the best part of a day. If
            you need to see a change right now, use <strong>Test in Browser</strong> on the
            Account page instead.
          </p>

          <h3>Samsung Calendar</h3>
          <p className="note" style={{ marginBottom: 8 }}>
            Samsung Calendar can&apos;t subscribe to a feed address directly. The way around it is
            to add the feed to Google Calendar (above), then make sure that Google account is
            syncing with your phone.
          </p>
          <ol>
            <li>Add your feed to Google Calendar using the steps above, on a computer.</li>
            <li>
              On your phone, open <strong>Samsung Calendar</strong> and tap the menu icon.
            </li>
            <li>
              If your Google account is already added, tap <strong>Sync now</strong>. If not, tap{" "}
              <strong>Settings</strong> → <strong>Add new account</strong> and add it.
            </li>
            <li>
              If your jobs still don&apos;t appear, open the calendar list from the menu and make
              sure your Google calendar is ticked on.
            </li>
          </ol>

          <h3>Outlook</h3>
          <ol>
            <li>
              In Outlook on the web (or Outlook.com), open <strong>Calendar</strong> and click{" "}
              <strong>Add calendar</strong>.
            </li>
            <li>Choose <strong>Subscribe from web</strong>.</li>
            <li>Paste your feed address, then click <strong>Import</strong>.</li>
          </ol>
          <p className="note" style={{ marginBottom: 0 }}>
            Outlook refreshes subscribed calendars automatically every few hours, though
            Microsoft&apos;s own guidance says it can occasionally take over a day.
          </p>

          <h2>4. Troubleshooting</h2>
          <h3>The feed isn&apos;t showing a change I just made</h3>
          <p>
            This is almost always just timing — your calendar app checks the feed on its own
            schedule, not the moment something changes in Booktight. Exactly how often varies by
            app (see above), and there&apos;s no way to force an outside calendar app to refresh
            sooner from Booktight&apos;s side. To see a change immediately, open the feed address
            directly in a browser (the <strong>Test in Browser</strong> link in Account), or check
            This Week in the app itself.
          </p>
          <h3>Some jobs are missing from the feed</h3>
          <p>A few things that would explain it:</p>
          <ul>
            <li>The feed only ever includes <strong>this week onward</strong>, roughly 12 weeks out — a job from a past week was never in it.</li>
            <li>A cancelled job doesn&apos;t appear, by design.</li>
            <li>Your calendar app may simply not have refreshed yet — see above.</li>
          </ul>
          <h3>The feed stopped working</h3>
          <p>
            If a free trial or subscription ends without renewing, the calendar feed keeps working
            for 30 days afterward so nothing breaks suddenly — then it stops. Turning the feed back
            on in Account (once you&apos;re subscribed again) gives you a fresh address to
            subscribe to.
          </p>

          <h2>5. Contact</h2>
          <p>
            Something not covered here, or not working the way it should? Email{" "}
            <a href="mailto:support@booktight.co.uk">support@booktight.co.uk</a>, or use{" "}
            <Link href="/contact">Send feedback</Link> from anywhere in the app.
          </p>
        </div>
      </div>

      <Footer />
      <p className="version">v1.0.2-stable</p>
    </main>
  );
}
