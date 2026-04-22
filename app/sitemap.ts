import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteUrl";

const PUBLIC_PATHS = [
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
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const siteUrl = getSiteUrl();
  return PUBLIC_PATHS.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : path === "/lookup" || path === "/studio" ? 0.9 : 0.7,
  }));
}
