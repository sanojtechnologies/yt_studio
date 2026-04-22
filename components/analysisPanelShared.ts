"use client";

import { KeyValueStorage } from "@/lib/analysisCache";

/**
 * Resolve `window.localStorage` safely. Returns `null` in non-browser
 * contexts (SSR) and when localStorage access throws (Safari private
 * mode, cookies disabled). Consumers pass the result straight into
 * `createAnalysisCache` readers which are `null`-safe by design.
 */
export function resolveBrowserStorage(): KeyValueStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Human-friendly "cached N ago" label shared by the thumbnail and metadata
 * panels. Granularity caps at "yesterday" because results expire at 24 h —
 * anything older than that shouldn't be in the cache.
 */
export function formatRelativeTime(savedAt: string, now: Date): string {
  const saved = Date.parse(savedAt);
  if (Number.isNaN(saved)) return "moments ago";
  const diffMinutes = Math.max(0, Math.round((now.getTime() - saved) / 60_000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  return "yesterday";
}
