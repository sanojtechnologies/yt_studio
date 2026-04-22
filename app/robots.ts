import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/lookup",
          "/getting-started",
          "/compare",
          "/compare/gap",
          "/studio",
          "/studio/titles",
          "/studio/hook",
          "/studio/thumbnails",
          "/studio/clusters",
          "/studio/script",
          "/studio/ab-title",
          "/studio/ab-thumbnail",
        ],
        disallow: ["/api/", "/dashboard/", "/keys", "/keys/", "/history"],
      },
    ],
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
