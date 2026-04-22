export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  subscriberCount: number;
  viewCount: number;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  duration: string;
  thumbnailUrl?: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  /**
   * Authoritative Shorts classification populated by
   * `lib/shortsProbe.ts` server-side. `true` / `false` mean YouTube
   * itself confirmed the classification via `/shorts/{id}`. `undefined`
   * means no probe was attempted (video > SHORT_MAX_SECONDS) or the
   * probe was inconclusive (network error / unexpected status) — in
   * that case consumers fall back to the duration heuristic in
   * `lib/duration.ts`.
   */
  isShort?: boolean;
  /**
   * `snippet.tags[]` from the YouTube Data API. Returned for videos
   * regardless of ownership, but may be `undefined` (YouTube omits the
   * field when a creator hasn't set any tags) — callers should treat
   * missing and empty as equivalent. Consumed by the video metadata
   * analyzer (`/api/video-metadata` + `lib/metadataPrompt.ts`).
   */
  tags?: string[];
}
