/**
 * sitemap.xml
 *
 * Served at /sitemap.xml via Next.js file convention. We only list the
 * public marketing page (dashboard is behind auth and gated from crawlers
 * via robots.txt).
 */
import type { MetadataRoute } from "next";

import { publicEnv } from "@/config/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicEnv.NEXT_PUBLIC_APP_URL;
  const now = new Date();
  return [
    {
      url: base,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
