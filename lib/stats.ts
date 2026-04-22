import { YouTubeVideo } from "@/types/youtube";
import { localDayHour } from "@/lib/timezone";

export interface DashboardStats {
  avgViews: number;
  engagementRate: number;
  uploadFrequencyPerWeek: number;
  bestDay: string;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Size of the trailing window used to compute `uploadFrequencyPerWeek`. 90
 * days is the de-facto standard in creator analytics (YouTube Studio,
 * Social Blade) — long enough to average over a few posting cycles, short
 * enough that a long-tailed back catalogue doesn't crush the denominator.
 */
export const RECENT_CADENCE_WINDOW_DAYS = 90;
/** Fallback sample size when the trailing window is too sparse to be useful. */
export const RECENT_CADENCE_FALLBACK_SAMPLE = 10;

/**
 * Cadence, in publishes per week, over the creator's recent activity. Pure
 * function — anchored to the newest sample date so results are deterministic
 * regardless of wall-clock time. Callers must pass dates pre-filtered to
 * valid, chronological-ascending timestamps.
 *
 * Strategy (PRD § 4.4):
 *   1. Take the slice of `sorted` whose `publishedAt` is within
 *      `RECENT_CADENCE_WINDOW_DAYS` of the newest date. This is "recent
 *      cadence" — what the creator is doing right now.
 *   2. If that slice is sparse (<2 entries), fall back to the last
 *      `RECENT_CADENCE_FALLBACK_SAMPLE` dates so a returning-after-hiatus
 *      creator still gets a signal instead of a stale 0.
 *   3. Apply the `(N − 1) / spanDays × 7` interval formula. N publishes
 *      form N − 1 intervals; `spanDays` is floored at 1 so a same-day
 *      burst doesn't divide by zero.
 */
function recentCadencePerWeek(sorted: Date[]): number {
  if (sorted.length < 2) return 0;

  const newest = sorted[sorted.length - 1].getTime();
  const cutoff = newest - RECENT_CADENCE_WINDOW_DAYS * DAY_MS;
  const recent = sorted.filter((d) => d.getTime() >= cutoff);
  // `sorted.length >= 2` guarantees the fallback slice returns at least 2
  // entries, so no post-fallback sparsity guard is needed.
  const window =
    recent.length >= 2
      ? recent
      : sorted.slice(-Math.min(RECENT_CADENCE_FALLBACK_SAMPLE, sorted.length));

  const first = window[0].getTime();
  const last = window[window.length - 1].getTime();
  const spanDays = Math.max((last - first) / DAY_MS, 1);
  return ((window.length - 1) / spanDays) * 7;
}

/**
 * `timeZone` controls only the `bestDay` bucket — the rest of the stats are
 * timezone-independent. Defaults to `"UTC"` so server-side rendering and
 * tests stay deterministic; clients pass `Intl.DateTimeFormat().resolvedOptions().timeZone`
 * so the "Best Day" card reflects the creator's local publishing calendar.
 */
export function calculateStats(
  videos: YouTubeVideo[],
  timeZone: string = "UTC"
): DashboardStats {
  if (videos.length === 0) {
    return {
      avgViews: 0,
      engagementRate: 0,
      uploadFrequencyPerWeek: 0,
      bestDay: "N/A",
    };
  }

  const totalViews = videos.reduce((sum, video) => sum + video.viewCount, 0);
  const totalEngagement = videos.reduce(
    (sum, video) => sum + video.likeCount + video.commentCount,
    0
  );

  const publishedDates = videos
    .map((video) => new Date(video.publishedAt))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const uploadFrequencyPerWeek = recentCadencePerWeek(publishedDates);

  const dayViewTotals = new Map<number, number>();
  for (const video of videos) {
    const date = new Date(video.publishedAt);
    if (Number.isNaN(date.getTime())) continue;
    const { day } = localDayHour(date, timeZone);
    dayViewTotals.set(day, (dayViewTotals.get(day) ?? 0) + video.viewCount);
  }

  const bestDayIndex = Array.from(dayViewTotals.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0]?.[0];

  return {
    avgViews: totalViews / videos.length,
    engagementRate: totalViews > 0 ? (totalEngagement / totalViews) * 100 : 0,
    uploadFrequencyPerWeek,
    bestDay: typeof bestDayIndex === "number" ? DAY_NAMES[bestDayIndex] : "N/A",
  };
}
