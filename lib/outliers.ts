import { YouTubeVideo } from "@/types/youtube";
import { computeRobustStats, robustZScore } from "@/lib/robustStats";

export type OutlierKind = "over" | "under" | "normal";

export interface OutlierAnnotation {
  videoId: string;
  kind: OutlierKind;
  /** Robust z-score from `lib/robustStats`. 0 when MAD is 0. */
  score: number;
}

export interface OutlierStats {
  median: number;
  /** Median Absolute Deviation. Returns 0 when input is empty or constant. */
  mad: number;
  /** Robust threshold for "over" / "under" classification (default 1.5). */
  threshold: number;
}

export interface OutlierReport {
  stats: OutlierStats;
  annotations: Map<string, OutlierAnnotation>;
}

/**
 * Robust outlier detection on a video's `viewCount` axis. View distributions
 * are extremely right-skewed (one viral upload can drag a mean-based
 * threshold so high that nothing reads as anomalous), so we use median + MAD
 * from `lib/robustStats` instead.
 *
 * Semantics:
 * - Empty input → empty report.
 * - Single video → it's "normal" by definition (no spread).
 * - All identical views (MAD = 0) → everything is "normal", scores all 0.
 * - Otherwise, a video is "over" if score >  threshold, "under" if score < -threshold.
 */
export function computeOutliers(
  videos: YouTubeVideo[],
  threshold = 1.5
): OutlierReport {
  const annotations = new Map<string, OutlierAnnotation>();
  if (videos.length === 0) {
    return { stats: { median: 0, mad: 0, threshold }, annotations };
  }

  const stats = computeRobustStats(videos.map((v) => v.viewCount));

  for (const video of videos) {
    const score = robustZScore(video.viewCount, stats);
    let kind: OutlierKind = "normal";
    if (stats.mad > 0) {
      if (score > threshold) kind = "over";
      else if (score < -threshold) kind = "under";
    }
    annotations.set(video.id, { videoId: video.id, kind, score });
  }

  return {
    stats: { median: stats.median, mad: stats.mad, threshold },
    annotations,
  };
}

export function filterByOutlierKind(
  videos: YouTubeVideo[],
  report: OutlierReport,
  kinds: OutlierKind[]
): YouTubeVideo[] {
  if (kinds.length === 0) return videos;
  const wanted = new Set(kinds);
  return videos.filter((video) => {
    const annotation = report.annotations.get(video.id);
    return annotation ? wanted.has(annotation.kind) : false;
  });
}
