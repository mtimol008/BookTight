This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment

This app is ready to deploy on Vercel or any platform that supports Next.js App Router.

### Environment variables

Copy `.env.local.example` to `.env.local` and fill in your values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL` (the public URL for the deployed app, e.g. `https://your-team.vercel.app`)
- `SUPABASE_SECRET_KEY` (server-only, not exposed to the browser)
- `MAPBOX_ACCESS_TOKEN`

### Build locally

```bash
npm install
npm run build
```

### Deploy on Vercel

The easiest way to publish is to connect this GitHub repository to Vercel and let Vercel detect the Next.js app.

If you prefer a direct deploy from this codebase, install the Vercel CLI and run:

```bash
npm install -g vercel
vercel
```

Need help with the deploy settings or environment variables? Ask me and I can make them exact for your project.

### Database migrations

Migration files live in `supabase/migrations/`, applied via the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) (pinned as a devDependency — `npx supabase <command>` always uses the exact version in `package.json`, not whatever's latest). The production project ref is `itijkrefaugbpagamxqr` (from `NEXT_PUBLIC_SUPABASE_URL` — a project ref isn't secret, it's the same string already in the public client URL).

**The database password is never shared with an AI assistant or pasted into chat.** Applying a migration to production is always run by a human, directly in their own terminal.

One-time setup (per machine), done once before any of this works:

```bash
npx supabase login
npx supabase link --project-ref itijkrefaugbpagamxqr
```

The very first time this repo is linked, every existing migration must be marked as already-applied (the CLI was never used for these — they were pasted into the Supabase SQL Editor by hand) **before running any `db push`**, or the CLI will try to replay all of them, including destructive ones from this project's early history. See the one-time repair commands below if this hasn't been done yet.

**Applying a new migration to production**, once linked:

```bash
# 1. Preview exactly what SQL would run — applies nothing.
npx supabase db push --project-ref itijkrefaugbpagamxqr --dry-run

# 2. Read the output carefully — same scrutiny as reading a migration
#    file before pasting it into the SQL Editor. If it's not exactly the
#    one new migration you expect, stop and find out why before step 3.

# 3. Apply for real. This is the only step that touches production, and
#    it needs the database password, so this part is always run by hand.
npx supabase db push --project-ref itijkrefaugbpagamxqr
```

If anything in step 2 looks wrong — more than the expected migration(s) listed, or output that doesn't match the file you just wrote — stop and investigate before running step 3.

### Switching on the paywall

Two steps, **in this order** — reversing them means some accounts' trials start before others', instead of everyone's starting together on the same day:

1. **Run this once, by hand, in the Supabase SQL Editor** — sets every existing account's trial to start right now:

   ```sql
   update public.subscriptions set trial_ends_at = now() + interval '14 days';
   ```

   This covers every account that existed before this point, including ones that signed up between the `subscriptions` migration landing and today (their trigger-set `trial_ends_at` gets overwritten here too) — "existing accounts' trial starts the day the paywall switches on" means *this* moment, not whenever each of them happened to sign up.

2. **Only after that's run**, set `PAYWALL_ENABLED=true` in Vercel (Production) and redeploy. Before this, `hasActiveEntitlement()` always returns `true` regardless of what's in `subscriptions` — the whole system can sit there inert, including new signups quietly accumulating a real `trial_ends_at` from the moment the migration ran, with zero effect until this flag flips.
