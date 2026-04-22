import { YouTubeVideo } from "@/types/youtube";
import { localDayHour } from "@/lib/timezone";

export const DAY_NAMES_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

export interface HeatmapCell {
  day: number; // 0..6, Sun..Sat (in the requested timezone)
  hour: number; // 0..23 (in the requested timezone)
  count: number;
  medianViews: number;
}

export interface HeatmapResult {
  /** 7 * 24 = 168 cells, row-major (day, then hour). Always full grid. */
  cells: HeatmapCell[];
  /** Highest medianViews across populated cells; 0 when empty. */
  maxMedianViews: number;
  /** Coordinates of the strongest cell, or null when empty. */
  bestCell: { day: number; hour: number; medianViews: number } | null;
}

function median(sorted: number[]): number {
  /* v8 ignore next */
  if (sorted.length === 0) return 0; // call sites gate on length > 0; defensive only.
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Bucket videos by (weekday, hour) in the given IANA `timeZone` and report
 * the median view count per bucket. Median (not mean) keeps a single viral
 * video from making an entire weekday/hour cell glow when it's actually a
 * one-off.
 *
 * The default timezone is `"UTC"` so server-side calls and pre-existing
 * tests remain deterministic. Clients pass their browser's resolved zone
 * (from `Intl.DateTimeFormat().resolvedOptions().timeZone`) so the heatmap
 * matches the creator's publishing schedule as they experienced it.
 *
 * Videos with unparseable `publishedAt` are silently skipped, matching the
 * behaviour of `lib/stats.ts` (PRD § 4.4).
 */
export function buildPublishHeatmap(
  videos: YouTubeVideo[],
  timeZone: string = "UTC"
): HeatmapResult {
  const buckets = new Map<string, number[]>();
  for (const video of videos) {
    const date = new Date(video.publishedAt);
    if (Number.isNaN(date.getTime())) continue;
    const { day, hour } = localDayHour(date, timeZone);
    const key = `${day}:${hour}`;
    const list = buckets.get(key);
    if (list) list.push(video.viewCount);
    else buckets.set(key, [video.viewCount]);
  }

  const cells: HeatmapCell[] = [];
  let maxMedianViews = 0;
  let bestCell: HeatmapResult["bestCell"] = null;

  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const sample = buckets.get(`${day}:${hour}`);
      const count = sample?.length ?? 0;
      let medianViews = 0;
      if (sample && sample.length > 0) {
        medianViews = median([...sample].sort((a, b) => a - b));
        if (medianViews > maxMedianViews) {
          maxMedianViews = medianViews;
          bestCell = { day, hour, medianViews };
        }
      }
      cells.push({ day, hour, count, medianViews });
    }
  }

  return { cells, maxMedianViews, bestCell };
}
