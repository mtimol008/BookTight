import type { MetadataRoute } from "next";

const SITE_URL = "https://booktight.co.uk";

// Allowlist, not a blocklist — everything defaults to disallowed, and only
// the landing page, legal pages, contact and the auth entry points are
// opened back up. Safer than enumerating app routes to block: a new
// behind-the-login route added later is excluded by default instead of
// needing someone to remember to add it here.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms", "/contact", "/help", "/login", "/signup", "/forgot-password"],
      disallow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
