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
const MIN_RECOMMENDATION_COUNT = 2;

export interface HeatmapCell {
  day: number; // 0..6, Sun..Sat (in the requested timezone)
  hour: number; // 0..23 (in the requested timezone)
  count: number;
  medianViews: number;
  maxViews: number;
  recommendationScore: number;
}

export interface HeatmapResult {
  /** 7 * 24 = 168 cells, row-major (day, then hour). Always full grid. */
  cells: HeatmapCell[];
  /** Highest medianViews across populated cells; 0 when empty. */
  maxMedianViews: number;
  /** Highest maxViews across populated cells; 0 when empty. */
  maxPeakViews: number;
  /**
   * Coordinates of the strongest cell by reliability-adjusted recommendation
   * score, or null when empty.
   */
  bestCell: { day: number; hour: number; medianViews: number; count: number; score: number } | null;
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
 * Bucket videos by (weekday, hour) in the given IANA `timeZone` and report:
 * - `medianViews` for robust central tendency and heatmap colour intensity
 * - `maxViews` for peak context in tooltips/details
 * - `recommendationScore` for ranking suggested publish slots:
 *     `medianViews * ln(1 + count)`
 *
 * This balances expected performance (median) with evidence depth (count),
 * avoiding fragile single-hit peaks from dominating recommendations.
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
  let maxPeakViews = 0;
  let bestCell: HeatmapResult["bestCell"] = null;
  let bestScore = 0;
  let bestEligibleCell: HeatmapResult["bestCell"] = null;
  let bestEligibleScore = 0;

  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const sample = buckets.get(`${day}:${hour}`);
      const count = sample?.length ?? 0;
      let medianViews = 0;
      let maxViews = 0;
      let recommendationScore = 0;
      if (sample && sample.length > 0) {
        const sorted = [...sample].sort((a, b) => a - b);
        medianViews = median(sorted);
        maxViews = sorted[sorted.length - 1];
        recommendationScore = medianViews * Math.log1p(count);
        if (medianViews > maxMedianViews) {
          maxMedianViews = medianViews;
        }
        if (maxViews > maxPeakViews) {
          maxPeakViews = maxViews;
        }
        if (recommendationScore > bestScore) {
          bestScore = recommendationScore;
          bestCell = { day, hour, medianViews, count, score: recommendationScore };
        }
        if (count >= MIN_RECOMMENDATION_COUNT && recommendationScore > bestEligibleScore) {
          bestEligibleScore = recommendationScore;
          bestEligibleCell = { day, hour, medianViews, count, score: recommendationScore };
        }
      }
      cells.push({ day, hour, count, medianViews, maxViews, recommendationScore });
    }
  }

  return { cells, maxMedianViews, maxPeakViews, bestCell: bestEligibleCell ?? bestCell };
}
