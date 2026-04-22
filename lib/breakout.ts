import { YouTubeVideo } from "@/types/youtube";

export interface BreakoutEntry {
  id: string;
  title: string;
  thumbnailUrl?: string;
  previousViews: number;
  currentViews: number;
  deltaAbs: number;
  deltaPct: number;
}

export interface DetectBreakoutsOptions {
  /** Minimum previous view count required before a video is considered. Guards against "0 -> 1 = +infinity%" spikes. */
  minPreviousViews?: number;
  /** Cap on how many breakouts to return. */
  limit?: number;
}

const DEFAULT_MIN_PREVIOUS_VIEWS = 100;
const DEFAULT_LIMIT = 10;

/**
 * Compare two snapshots of the same channel's videos and return the entries
 * whose view count grew the most, ranked by percentage growth (desc).
 *
 * Videos that weren't in `previous` are ignored — we can't compute a delta
 * without a baseline, and "new since last visit" is a separate signal that
 * callers can derive directly.
 *
 * Pure: deterministic given the inputs; no IO or randomness.
 */
export function detectBreakouts(
  previous: YouTubeVideo[],
  current: YouTubeVideo[],
  opts: DetectBreakoutsOptions = {}
): BreakoutEntry[] {
  const minPreviousViews = opts.minPreviousViews ?? DEFAULT_MIN_PREVIOUS_VIEWS;
  const limit = opts.limit ?? DEFAULT_LIMIT;

  const prevById = new Map(previous.map((v) => [v.id, v]));
  const breakouts: BreakoutEntry[] = [];

  for (const video of current) {
    const prev = prevById.get(video.id);
    if (!prev) continue;
    if (prev.viewCount < minPreviousViews) continue;
    const deltaAbs = video.viewCount - prev.viewCount;
    if (deltaAbs <= 0) continue;
    const deltaPct = (deltaAbs / prev.viewCount) * 100;
    breakouts.push({
      id: video.id,
      title: video.title,
      thumbnailUrl: video.thumbnailUrl,
      previousViews: prev.viewCount,
      currentViews: video.viewCount,
      deltaAbs,
      deltaPct,
    });
  }

  breakouts.sort((a, b) => b.deltaPct - a.deltaPct);
  return breakouts.slice(0, limit);
}
