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
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, not exposed to the browser)
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
