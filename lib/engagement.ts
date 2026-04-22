import { classifyVideoFormat, VideoFormat } from "@/lib/duration";
import { computeRobustStats, RobustStats, robustZScore } from "@/lib/robustStats";
import { YouTubeVideo } from "@/types/youtube";

/**
 * Engagement classification buckets. Unlike the old fixed-threshold approach
 * ("High ≥ 6%", "Medium ≥ 3%", "Low otherwise"), these are **channel-relative
 * and format-aware**: a video is "high" only when its engagement rate is
 * unusually strong compared to the creator's own Shorts (or long-form)
 * baseline. Two channels can have identical raw rates and classify
 * differently — that's the point.
 *
 * - `high`   — robust z-score > threshold within the video's format bucket
 * - `normal` — within ±threshold of the channel's format-specific median
 * - `below`  — robust z-score < -threshold
 * - `na`     — no defensible signal: views ≤ 0, or both likes and comments
 *              are 0 (typically a brand-new upload or comments/ratings
 *              disabled; lumping these in would distort the bucket).
 */
export type EngagementBucket = "high" | "normal" | "below" | "na";

export interface EngagementAnnotation {
  videoId: string;
  format: VideoFormat;
  bucket: EngagementBucket;
  /** `(likes + comments) / views * 100`. 0 when the video is "na". */
  rate: number;
  /** Robust z-score within the video's format bucket. 0 for "na" / constant bucket. */
  score: number;
  /** Channel median engagement rate in this video's format. 0 when bucket is empty. */
  medianForFormat: number;
}

export interface FormatEngagementStats extends RobustStats {
  /** Number of **classifiable** (non-"na") videos in this format bucket. */
  count: number;
}

export interface EngagementReport {
  shorts: FormatEngagementStats;
  long: FormatEngagementStats;
  annotations: Map<string, EngagementAnnotation>;
  /** Absolute-value cutoff applied to the robust z-score. */
  threshold: number;
}

/**
 * Default z-score cutoff. Engagement distributions are typically tighter
 * than view distributions, so we use 1.0 here (vs. 1.5 in `lib/outliers.ts`)
 * to surface signal without requiring a viral outlier to exist first.
 */
export const DEFAULT_ENGAGEMENT_THRESHOLD = 1.0;

/**
 * Raw engagement rate as a percentage, or `undefined` when the video is
 * "na" (no views, or both likes and comments are 0). Pure — exported so
 * callers that only need the rate (tooltips, CSV export) can skip the full
 * report.
 */
export function getEngagementRate(video: YouTubeVideo): number | undefined {
  if (video.viewCount <= 0) return undefined;
  if (video.likeCount <= 0 && video.commentCount <= 0) return undefined;
  return ((video.likeCount + video.commentCount) / video.viewCount) * 100;
}

/**
 * Classify every video in `videos` by engagement, relative to the creator's
 * own Shorts / long-form baselines. The format split matters: Shorts
 * engagement rates are typically 3–5× higher than long-form on the same
 * channel, so mixing them would either wash out long-form outperformers or
 * mislabel ordinary Shorts as "high".
 *
 * Algorithm:
 *   1. Compute `rate` per video; mark "na" videos (excluded from stats).
 *   2. Bucket remaining videos by `classifyVideoFormat` (probe-aware).
 *   3. Compute median + MAD per bucket via `lib/robustStats`.
 *   4. Classify each video via its bucket's robust z-score:
 *        score >  threshold → "high"
 *        score < -threshold → "below"
 *        otherwise          → "normal"
 *      (MAD = 0 collapses every bucket member to score 0 → "normal".)
 *
 * The returned `annotations` map is keyed by `video.id` and includes every
 * input video (including "na"s), so UI consumers can do a single O(1)
 * lookup per card.
 */
export function computeEngagementReport(
  videos: YouTubeVideo[],
  threshold = DEFAULT_ENGAGEMENT_THRESHOLD
): EngagementReport {
  const annotations = new Map<string, EngagementAnnotation>();

  interface ScoredVideo {
    video: YouTubeVideo;
    format: VideoFormat;
    rate: number;
  }
  const byFormat: Record<VideoFormat, ScoredVideo[]> = { short: [], long: [] };
  const naVideos: { video: YouTubeVideo; format: VideoFormat }[] = [];

  for (const video of videos) {
    const format = classifyVideoFormat(video);
    const rate = getEngagementRate(video);
    if (rate === undefined) {
      naVideos.push({ video, format });
      continue;
    }
    byFormat[format].push({ video, format, rate });
  }

  const shortsStats = computeRobustStats(byFormat.short.map((s) => s.rate));
  const longStats = computeRobustStats(byFormat.long.map((s) => s.rate));
  const statsByFormat: Record<VideoFormat, RobustStats> = {
    short: shortsStats,
    long: longStats,
  };

  for (const format of ["short", "long"] as const) {
    const stats = statsByFormat[format];
    for (const { video, rate } of byFormat[format]) {
      const score = robustZScore(rate, stats);
      let bucket: EngagementBucket = "normal";
      if (stats.mad > 0) {
        if (score > threshold) bucket = "high";
        else if (score < -threshold) bucket = "below";
      }
      annotations.set(video.id, {
        videoId: video.id,
        format,
        bucket,
        rate,
        score,
        medianForFormat: stats.median,
      });
    }
  }

  for (const { video, format } of naVideos) {
    annotations.set(video.id, {
      videoId: video.id,
      format,
      bucket: "na",
      rate: 0,
      score: 0,
      medianForFormat: statsByFormat[format].median,
    });
  }

  return {
    shorts: { ...shortsStats, count: byFormat.short.length },
    long: { ...longStats, count: byFormat.long.length },
    annotations,
    threshold,
  };
}
