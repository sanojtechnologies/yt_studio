import { parseIso8601DurationSeconds, SHORT_MAX_SECONDS } from "@/lib/duration";
import { YouTubeVideo } from "@/types/youtube";

/**
 * Server-side probe that asks YouTube itself whether a given video ID is
 * a Short. This is the only authoritative signal available to us:
 *
 *   - `youtube.com/shorts/{id}` returns `200 OK` when the video qualifies
 *     as a Short (vertical/square aspect ratio AND duration ≤ 3 min for
 *     uploads after 2024-10-15).
 *   - For regular videos the same URL issues a `303 See Other` redirect
 *     to `/watch?v={id}`.
 *
 * The YouTube Data API v3 `contentDetails` block does not expose aspect
 * ratio or an `isShort` flag, so a duration-only heuristic
 * (`lib/duration.ts`) is necessarily imprecise in the 60 – 180 s range.
 * Probing closes that gap; the probe hits the public YouTube site — not
 * the Data API — so it consumes none of the user's quota.
 *
 * Must run from a Node/edge runtime (Next.js route handlers / RSCs),
 * never from the browser: `redirect: "manual"` requires a fetch that
 * isn't subject to CORS restrictions on redirects.
 */

const PROBE_TTL_MS = 24 * 60 * 60 * 1000;
const PROBE_TIMEOUT_MS = 4_000;
const DEFAULT_CONCURRENCY = 8;
const SHORTS_URL_PREFIX = "https://www.youtube.com/shorts/";
// Identify ourselves so YouTube can rate-limit or contact us if needed.
// Not a browser UA string — this is a legitimate server-to-server probe.
const SHORTS_PROBE_UA =
  "Mozilla/5.0 (compatible; YtStudioShortsProbe/1.0; +https://github.com/)";

const cache = new Map<string, { value: boolean; expiresAt: number }>();

/**
 * Reset the in-memory probe cache. Exported for tests only — production
 * callers rely on the 24 h TTL.
 */
export function __resetShortsProbeCacheForTests(): void {
  cache.clear();
}

/**
 * Probe a single video ID. Returns:
 *   - `true`  — YouTube served the Shorts player (HTTP 200)
 *   - `false` — YouTube redirected to /watch (any 3xx status)
 *   - `undefined` — the probe was inconclusive (network error, timeout,
 *     empty ID, or an unexpected HTTP status). Callers should fall back
 *     to the duration heuristic when undefined is returned.
 *
 * Successful probes (boolean results) are cached in-process for 24 h.
 * A video's Short/long-form status is immutable once uploaded, so a
 * long TTL is safe; inconclusive probes are not cached so a transient
 * network glitch doesn't freeze a wrong answer.
 */
export async function probeShort(videoId: string): Promise<boolean | undefined> {
  const id = typeof videoId === "string" ? videoId.trim() : "";
  if (!id) return undefined;

  const cached = cache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  let body: ReadableStream<Uint8Array> | null | undefined;
  try {
    const res = await fetch(`${SHORTS_URL_PREFIX}${encodeURIComponent(id)}`, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "user-agent": SHORTS_PROBE_UA },
    });
    body = res.body;
    const result = classifyProbeResponse(res.status);
    if (typeof result === "boolean") {
      cache.set(id, { value: result, expiresAt: Date.now() + PROBE_TTL_MS });
    }
    return result;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
    // Best-effort body cleanup — some runtimes (Node undici) warn about
    // unclosed response bodies. Swallow any cancel() rejection so it
    // doesn't surface as an unhandled promise rejection.
    if (body) {
      try {
        await body.cancel();
      } catch {
        /* cleanup is best-effort; probe result is already decided */
      }
    }
  }
}

/**
 * Map a `/shorts/{id}` HTTP status onto our tri-state classification.
 * Kept pure and exported so the mapping can be unit tested without
 * standing up a fake fetch.
 */
export function classifyProbeResponse(status: number): boolean | undefined {
  if (status === 200) return true;
  if (status >= 300 && status < 400) return false;
  return undefined;
}

/**
 * Populate `isShort` on every video whose duration lands in the
 * ambiguous (0, SHORT_MAX_SECONDS] window by probing YouTube. Videos
 * longer than `SHORT_MAX_SECONDS` can't be Shorts per YouTube's own
 * rule and are returned untouched, saving a round trip. Any video
 * whose probe returns `undefined` is also left untouched so downstream
 * duration-based fallback remains valid.
 *
 * Concurrency is bounded (default 8 workers) to stay polite to
 * YouTube's edge and to avoid saturating the Node event loop on large
 * channels.
 */
export async function enrichVideosWithShortsProbe(
  videos: YouTubeVideo[],
  options: { concurrency?: number } = {}
): Promise<YouTubeVideo[]> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const queue: string[] = [];
  for (const v of videos) {
    const seconds = parseIso8601DurationSeconds(v.duration);
    if (Number.isFinite(seconds) && seconds > 0 && seconds <= SHORT_MAX_SECONDS) {
      queue.push(v.id);
    }
  }
  if (queue.length === 0) return videos;

  const results = new Map<string, boolean>();
  let cursor = 0;
  const workers: Array<Promise<void>> = [];
  for (let w = 0; w < Math.min(concurrency, queue.length); w++) {
    workers.push(
      (async () => {
        while (cursor < queue.length) {
          const index = cursor++;
          const id = queue[index];
          const probed = await probeShort(id);
          if (typeof probed === "boolean") results.set(id, probed);
        }
      })()
    );
  }
  await Promise.all(workers);

  if (results.size === 0) return videos;
  return videos.map((v) => {
    const probed = results.get(v.id);
    return typeof probed === "boolean" ? { ...v, isShort: probed } : v;
  });
}
