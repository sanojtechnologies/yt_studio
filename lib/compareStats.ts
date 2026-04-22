import { YouTubeChannel, YouTubeVideo } from "@/types/youtube";
import { calculateStats, DashboardStats } from "@/lib/stats";

export interface ChannelComparisonRow {
  channel: YouTubeChannel;
  videoCount: number;
  stats: DashboardStats;
  medianViews: number;
  topVideos: YouTubeVideo[];
}

const MAX_COMPARE_CHANNELS = 4;
const MIN_COMPARE_CHANNELS = 2;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function buildComparisonRow(
  channel: YouTubeChannel,
  videos: YouTubeVideo[],
  topN = 3
): ChannelComparisonRow {
  return {
    channel,
    videoCount: videos.length,
    stats: calculateStats(videos),
    medianViews: median(videos.map((v) => v.viewCount)),
    topVideos: [...videos].sort((a, b) => b.viewCount - a.viewCount).slice(0, topN),
  };
}

/**
 * Parse and clamp the `ids` query value used by `/compare`. Strips empty
 * tokens, dedupes (preserving first-seen order), and trims to at most 4 ids
 * — past that the side-by-side layout collapses on tablet widths.
 */
export function parseCompareIds(value: string | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(",")) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_COMPARE_CHANNELS) break;
  }
  return out;
}

export function isCompareReady(ids: string[]): boolean {
  return ids.length >= MIN_COMPARE_CHANNELS;
}

export const COMPARE_LIMITS = {
  min: MIN_COMPARE_CHANNELS,
  max: MAX_COMPARE_CHANNELS,
} as const;
