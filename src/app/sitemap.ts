import type { MetadataRoute } from "next";

const SITE_URL = "https://booktight.co.uk";

// Just the pages meant to be found by search — the landing page and the
// legal pages. Everything behind the login gate (This Week, Add, Calendar,
// Account, Billing...) has nothing for a crawler to usefully index anyway,
// since it's the same empty/signed-out shell for every visitor who isn't
// already a user.
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/privacy", "/terms", "/contact", "/help"];

  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
  }));
}
