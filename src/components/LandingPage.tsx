import { LandingScreenshot } from "@/components/LandingScreenshot";
import Link from "next/link";

const CHECK_PATH = "M4 12.5l5.5 5.5L20 7";

function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" aria-hidden="true">
      <path d={CHECK_PATH} />
    </svg>
  );
}

const STEPS = [
  {
    num: "01",
    title: "Add the job",
    body: "Type the address, roughly how long it'll take, and how soon it needs doing. That's it.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
    aside: null as string | null,
  },
  {
    num: "02",
    title: "See the best day and time",
    body: "Booktight checks it against everything already in your week and picks the slot that adds the least driving.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    ),
    aside: "And it tells you why not the others, like a day that's already full or one that would add more driving than you allow.",
  },
  {
    num: "03",
    title: "Confirm it",
    body: "One tap books it. It lands in your phone's calendar on its own, so your diary is always up to date.",
    icon: <CheckIcon size={20} />,
    aside: null,
  },
];

const RULES = [
  {
    title: "Working hours, day by day",
    body: "Different hours on Fridays, half day Saturday, Sundays off. Set each day separately.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </svg>
    ),
  },
  {
    title: "Max jobs and travel range",
    body: "Cap how many jobs go in a day and how much extra driving one new job is allowed to add.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
  },
  {
    title: "Calendar feed",
    body: "Your jobs show up in Apple, Google or Outlook Calendar automatically. No copying across.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    title: "End-of-day review",
    body: "Tick off what got done. Anything that didn't happen gets moved, not forgotten.",
    icon: <CheckIcon size={18} />,
  },
];

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Who's it for?",
    a: (
      <p>
        Solo tradespeople in the UK, like electricians, plumbers and heating engineers, who run their
        own diary and drive to every job. If you&apos;re the one deciding when to say &ldquo;I can do
        Tuesday&rdquo;, it&apos;s for you.
      </p>
    ),
  },
  {
    q: "How does it pick a day?",
    a: (
      <>
        <p>
          It looks at the jobs you&apos;ve already booked and works out how much extra distance the
          new job would add to each day, based on how far apart the addresses are. Then it suggests
          the day and time that adds the least, within your working hours and rules.
        </p>
        <p>It also shows why the other days lost out, and you can always pick a different slot yourself.</p>
      </>
    ),
  },
  {
    q: "Does it work with my calendar?",
    a: (
      <p>
        Yes. Turn on the calendar feed in Account and subscribe to it from Apple Calendar, Google
        Calendar or Outlook. Your Booktight jobs then show up there and stay up to date by themselves.
      </p>
    ),
  },
  {
    q: "What happens if I cancel?",
    a: (
      <>
        <p>
          You can cancel any time from Account, with no minimum term. You keep full access until the
          end of the period you&apos;ve paid for. After that:
        </p>
        <ul>
          <li>Your account becomes read-only, and you can still export all your jobs.</li>
          <li>Your calendar link keeps working for 30 days.</li>
          <li>We keep your data for 90 days in case you come back, and warn you before we delete it.</li>
        </ul>
      </>
    ),
  },
  {
    q: "Do you show ads or sell my data?",
    a: (
      <p>
        No. There are no ads, and we never sell your data or use it for advertising. See the{" "}
        <Link href="/privacy">privacy policy</Link> for the details.
      </p>
    ),
  },
  {
    q: "Does it work outside the UK?",
    a: <p>Not yet. Addresses, distances and pricing are all set up for the UK only for now.</p>,
  },
];

function RouteMap({ tidy, label }: { tidy: boolean; label: string }) {
  const path = tidy
    ? "M180 200 L66 178 L72 54 L300 52 L292 176 L180 200"
    : "M180 200 L300 52 L66 178 L72 54 L292 176 L180 200";
  return (
    <div className="landing-map">
      <svg viewBox="0 0 360 240" role="img" aria-label={label}>
        <path className="landing-m-road" d="M20 70 H340 M20 170 H340 M110 20 V220 M250 20 V220" />
        <path className={tidy ? "landing-m-tidy" : "landing-m-messy"} d={path} />
        <g>
          <circle className="landing-m-job" cx="72" cy="54" r="11" />
          <circle className="landing-m-job-in" cx="72" cy="54" r="4" />
        </g>
        <g>
          <circle className="landing-m-job" cx="300" cy="52" r="11" />
          <circle className="landing-m-job-in" cx="300" cy="52" r="4" />
        </g>
        <g>
          <circle className="landing-m-job" cx="66" cy="178" r="11" />
          <circle className="landing-m-job-in" cx="66" cy="178" r="4" />
        </g>
        <g>
          <circle className="landing-m-job" cx="292" cy="176" r="11" />
          <circle className="landing-m-job-in" cx="292" cy="176" r="4" />
        </g>
        <path className="landing-m-home" d="M168 214 V198 L180 188 L192 198 V214 Z" />
      </svg>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="landing-body">
      <a className="landing-skip" href="#main">
        Skip to content
      </a>

      <header className="landing-nav">
        <div className="landing-wrap">
          <Link className="wordmark" href="/" aria-label="Booktight home">
            Booktight
          </Link>
          <nav className="landing-nav-links" aria-label="Page sections">
            <a className="landing-nav-link" href="#how-it-works">
              How it works
            </a>
            <a className="landing-nav-link" href="#pricing">
              Pricing
            </a>
            <a className="landing-nav-link" href="#faq">
              FAQ
            </a>
            <Link className="landing-nav-link" href="/help">
              Help
            </Link>
          </nav>
          <div className="landing-nav-actions">
            <Link className="btn btn--ghost btn--sm" href="/login">
              Log in
            </Link>
            <Link className="btn btn--primary btn--sm" href="/signup">
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="landing-hero">
          <div className="landing-wrap">
            <div>
              <p className="landing-eyebrow">For solo tradespeople in the UK</p>
              <h1>
                Book the next job where it saves you the <em>most driving.</em>
              </h1>
              <p className="landing-lede">
                Booktight looks at where your jobs already are and tells you which day and time to
                offer a new one. Less time in the van, more work in the diary.
              </p>
              <div className="landing-hero-cta">
                <Link className="btn btn--primary btn--lg" href="/signup">
                  Start your 14-day free trial
                </Link>
                <span className="landing-note">
                  <CheckIcon size={14} />
                  No card needed.
                </span>
              </div>
            </div>
            <div className="landing-phone" role="img" aria-label="Booktight on a phone, suggesting the best day for a new job">
              <div className="landing-phone-screen">
                <LandingScreenshot name="screenshot-add" priority />
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="two-ways-title">
          <div className="landing-wrap">
            <div className="landing-section-head landing-section-head--center">
              <p className="landing-label">Why it matters</p>
              <h2 className="landing-h2" id="two-ways-title">
                Same four jobs. Two ways to drive them.
              </h2>
              <p className="landing-lede">
                Book jobs in the order people ring, and your week zig-zags across town. Book them by
                where they are, and each day becomes one loop.
              </p>
            </div>

            <div className="landing-routes">
              <figure className="card landing-route-card">
                <div className="landing-route-card-head">
                  <h3>Booked as they rang</h3>
                  <span className="landing-tag landing-tag--warn">Criss-cross</span>
                </div>
                <RouteMap
                  tidy={false}
                  label="A route from home to four jobs that crosses back over itself several times"
                />
                <figcaption>
                  <p>Back and forth across the same roads. Each crossing is driving you don&apos;t get paid for.</p>
                </figcaption>
              </figure>

              <figure className="card landing-route-card">
                <div className="landing-route-card-head">
                  <h3>Booked with Booktight</h3>
                  <span className="landing-tag landing-tag--route">One tidy loop</span>
                </div>
                <RouteMap
                  tidy
                  label="The same four jobs visited in one loop that starts and ends at home without crossing"
                />
                <figcaption>
                  <p>Out, round and home. Neighbouring jobs end up on the same day, one after another.</p>
                </figcaption>
              </figure>
            </div>
            <p className="landing-illustration-note">Illustration only.</p>
          </div>
        </section>

        <section className="landing-section" id="how-it-works" aria-labelledby="how-title">
          <div className="landing-wrap">
            <div className="landing-section-head">
              <p className="landing-label">How it works</p>
              <h2 className="landing-h2" id="how-title">
                Three steps, about a minute.
              </h2>
            </div>
            <ol className="landing-steps" role="list">
              {STEPS.map((step) => (
                <li className="card landing-step" key={step.num}>
                  <div className="landing-step-top">
                    <span className="landing-step-icon">{step.icon}</span>
                    <span className="landing-step-num">{step.num}</span>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  {step.aside && <p className="landing-step-aside">{step.aside}</p>}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="rules-title">
          <div className="landing-wrap landing-rules">
            <div>
              <div className="landing-section-head">
                <p className="landing-label">Your week, your way</p>
                <h2 className="landing-h2" id="rules-title">
                  You set the rules. It does the sums.
                </h2>
                <p className="landing-lede">Booktight only suggests slots that fit how you actually work.</p>
              </div>
              <ul className="landing-rule-list" role="list">
                {RULES.map((rule) => (
                  <li className="card landing-rule" key={rule.title}>
                    <span className="landing-rule-icon">{rule.icon}</span>
                    <div>
                      <h3>{rule.title}</h3>
                      <p>{rule.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="landing-phone" role="img" aria-label="Booktight's week view showing each day's jobs in driving order">
              <div className="landing-phone-screen">
                <LandingScreenshot name="screenshot-week" />
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section" id="pricing" aria-labelledby="pricing-title">
          <div className="landing-wrap">
            <div className="landing-section-head landing-section-head--center">
              <p className="landing-label">Pricing</p>
              <h2 className="landing-h2" id="pricing-title">
                One plan. Try it free for 14 days.
              </h2>
              <p className="landing-lede">Everything included, on either plan. No card needed to start.</p>
            </div>
            <div className="landing-plans">
              <article className="card landing-plan">
                <p className="landing-plan-name">Monthly</p>
                <p className="landing-plan-price">
                  £9.99<small>/month</small>
                </p>
                <p className="landing-plan-sub">Cancel any time.</p>
                <ul role="list">
                  <li>
                    <CheckIcon /> Best-slot suggestions for every job
                  </li>
                  <li>
                    <CheckIcon /> Calendar feed for your phone
                  </li>
                  <li>
                    <CheckIcon /> End-of-day review and export
                  </li>
                </ul>
                <Link className="btn btn--outline" href="/signup">
                  Start free trial
                </Link>
              </article>
              <article className="card landing-plan landing-plan--best">
                <span className="landing-plan-badge">Best value</span>
                <p className="landing-plan-name">Yearly</p>
                <p className="landing-plan-price">
                  £109<small>/year</small>
                </p>
                <p className="landing-plan-sub">
                  <strong>About a month free</strong> compared with paying monthly.
                </p>
                <ul role="list">
                  <li>
                    <CheckIcon /> Everything in monthly
                  </li>
                  <li>
                    <CheckIcon /> One payment a year
                  </li>
                  <li>
                    <CheckIcon /> Same 14-day free trial first
                  </li>
                </ul>
                <Link className="btn btn--primary" href="/signup">
                  Start free trial
                </Link>
              </article>
            </div>
            <div className="landing-pricing-foot">
              <p className="landing-vat">No VAT on top: the price you see is the price you pay.</p>
              <p className="landing-beta-note">
                Free for everyone during the closed beta. Pricing starts when we launch publicly.
              </p>
            </div>
          </div>
        </section>

        <section className="landing-section" id="faq" aria-labelledby="faq-title">
          <div className="landing-wrap">
            <div className="landing-section-head landing-section-head--center">
              <p className="landing-label">FAQ</p>
              <h2 className="landing-h2" id="faq-title">
                Questions tradespeople ask
              </h2>
            </div>
            <div className="landing-faq">
              {FAQ.map(({ q, a }) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <div className="landing-answer">{a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-final" aria-labelledby="final-title">
          <div className="landing-wrap">
            <div className="landing-final-band">
              <h2 id="final-title">Book your next job tighter.</h2>
              <p>Add one job and see which day it belongs on.</p>
              <Link className="btn btn--primary btn--lg" href="/signup">
                Start your 14-day free trial
              </Link>
              <p className="landing-note">No card needed.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-wrap">
          <Link className="wordmark" href="/">
            Booktight
          </Link>
          <nav aria-label="Legal and contact">
            <Link href="/help">Help</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/contact">Send feedback</Link>
          </nav>
          <small>© 2026 Booktight</small>
        </div>
      </footer>
    </div>
  );
}
