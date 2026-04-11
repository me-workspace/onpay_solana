/**
 * robots.txt
 *
 * Served at /robots.txt via Next.js file convention. We allow indexing of
 * the marketing pages and block the authenticated dashboard + API routes
 * so crawlers don't waste budget on non-indexable pages.
 */
import type { MetadataRoute } from "next";

import { publicEnv } from "@/config/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard/"],
      },
    ],
    sitemap: `${publicEnv.NEXT_PUBLIC_APP_URL}/sitemap.xml`,
  };
}
