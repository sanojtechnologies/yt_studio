import { YouTubeVideo } from "@/types/youtube";

export type VideoFormat = "short" | "long";

/**
 * Inclusive duration cutoff for classifying a video as a Short. Mirrors
 * YouTube's own rule since 2024-10-15: vertical/square videos of 3 minutes
 * or less are auto-categorised as Shorts. Before that change the cutoff
 * was 60 s; raising it here catches the ~1–3 minute Shorts that now make
 * up a large share of modern creators' output.
 *
 * Caveat: the YouTube Data API v3 `contentDetails` response does NOT expose
 * aspect ratio, so this classification is duration-only. A horizontal
 * video ≤ 3 min (e.g. a trailer or intro) will therefore be tagged as a
 * Short here even though YouTube wouldn't show it in the Shorts feed.
 * This is a known false-positive edge — the only alternative would be
 * per-video HEAD requests to `youtube.com/shorts/{id}` which is blocked
 * by CORS from the browser and would add N round-trips per dashboard load.
 */
export const SHORT_MAX_SECONDS = 180;

// ISO-8601 duration grammar we care about: PnDTnHnMn(.n)S. The spec also
// allows weeks/years/months, but YouTube never emits those for video runtime,
// so we decode the practical subset and return NaN for anything else.
const ISO8601_DURATION_RE =
  /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/**
 * Parse an ISO-8601 duration string (e.g. `"PT1H2M3S"`) into whole seconds.
 * Returns `NaN` when the input isn't a valid, non-empty ISO-8601 duration so
 * downstream callers can decide whether to treat the video as long-form or
 * drop it entirely.
 */
export function parseIso8601DurationSeconds(raw: string | null | undefined): number {
  if (typeof raw !== "string") return NaN;
  const trimmed = raw.trim();
  if (!trimmed) return NaN;
  const match = ISO8601_DURATION_RE.exec(trimmed);
  if (!match) return NaN;
  const [, dStr, hStr, mStr, sStr] = match;
  // All groups optional, but `PT` alone (no value) is not a real duration.
  if (!dStr && !hStr && !mStr && !sStr) return NaN;
  const days = dStr ? Number(dStr) : 0;
  const hours = hStr ? Number(hStr) : 0;
  const minutes = mStr ? Number(mStr) : 0;
  const seconds = sStr ? Number(sStr) : 0;
  const total = days * 86_400 + hours * 3_600 + minutes * 60 + seconds;
  return Number.isFinite(total) ? total : NaN;
}

/**
 * Bucket a video into `"short"` or `"long"`. Resolution order:
 *
 *   1. `video.isShort` — authoritative flag populated by the server-side
 *      `/shorts/{id}` probe in `lib/shortsProbe.ts`. Use it whenever it
 *      was set so we match YouTube's own classification exactly (this
 *      is the only way to distinguish a 2-min vertical Short from a
 *      2-min horizontal trailer, since the Data API v3 doesn't expose
 *      aspect ratio).
 *   2. Duration heuristic — fallback when the probe didn't run
 *      (e.g. duration > `SHORT_MAX_SECONDS`, so it can't be a Short by
 *      YouTube's rule anyway) or returned inconclusive.
 *
 * Unparseable / non-positive durations default to `"long"` so the
 * Shorts totals aren't inflated by missing API data.
 */
export function classifyVideoFormat(
  video: Pick<YouTubeVideo, "duration" | "isShort">
): VideoFormat {
  if (typeof video.isShort === "boolean") return video.isShort ? "short" : "long";
  const seconds = parseIso8601DurationSeconds(video.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) return "long";
  return seconds <= SHORT_MAX_SECONDS ? "short" : "long";
}
