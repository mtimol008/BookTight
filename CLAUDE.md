Project: Booktight
What this is
A simple web app for solo trade businesses (electricians, plumbers, etc).
It has ONE job: given a tradesperson's already-booked jobs for the week
(with addresses), and a new job that needs scheduling, suggest which
day/time slot minimizes added driving distance.
Tech stack

* Next.js (React) frontend
* Supabase for database + auth
* Deployed on Vercel
* Geocoding via [Google Maps Geocoding API / Mapbox — pick one] free tier

Rules

* Do NOT add features beyond what's explicitly asked in a given session.
If you think of an improvement, mention it — don't implement it without
being asked first.
* Keep the suggestion logic simple: straight-line (haversine) distance
between job coordinates is good enough for v1. No real routing API yet.
* This is a solo non-technical founder using Claude Code as the only
developer. Explain what you're doing in plain terms as you go.

Not yet in scope (future phases, don't build yet)

* Calendar sync (iOS/Google Calendar) so users can see jobs in their
normal calendar app — planned, not started
* Multi-technician/team support
* Payment/subscription billing
