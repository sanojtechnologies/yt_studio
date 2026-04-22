import { createHash } from "node:crypto";
import { google, youtube_v3 } from "googleapis";
import { YouTubeChannel, YouTubeVideo } from "@/types/youtube";
import {
  isYouTubeInvalidApiKeyError,
  isYouTubeQuotaExceededError,
  YouTubeInvalidApiKeyError,
  YouTubeQuotaExceededError,
} from "@/lib/errors";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { cachedAt: number; expiresAt: number; data: unknown }>();

interface CacheOptions {
  /**
   * Skip in-memory cache reads for this call. Fresh results are still written
   * back into cache so subsequent requests can reuse them.
   */
  bypassCache?: boolean;
}

function normalizeKey(apiKey: string): string {
  const trimmed = apiKey?.trim();
  if (!trimmed) throw new YouTubeInvalidApiKeyError();
  return trimmed;
}

function getYouTubeClient(apiKey: string) {
  return google.youtube({ version: "v3", auth: normalizeKey(apiKey) });
}

function scope(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

function getCached<T>(key: string): T | null {
  const cached = cache.get(key);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return cached.data as T;
}

function getCachedMeta(key: string): { cachedAt: number } | null {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return { cachedAt: cached.cachedAt };
}

function setCached<T>(key: string, data: T): T {
  const now = Date.now();
  cache.set(key, { cachedAt: now, expiresAt: now + CACHE_TTL_MS, data });
  return data;
}

function channelByIdCacheKey(apiKey: string, channelId: string): string {
  return `${scope(apiKey)}:channel:id:${channelId}`;
}

function channelVideosCacheKey(apiKey: string, channelId: string, maxResults: number): string {
  return `${scope(apiKey)}:videos:channel:${channelId}:${maxResults}`;
}

export interface DashboardRefreshState {
  lastRefreshedAt: string | null;
  shouldForceRefresh: boolean;
}

export function getDashboardRefreshState(
  apiKey: string,
  channelId: string,
  maxResults = 50
): DashboardRefreshState {
  const trimmedKey = apiKey.trim();
  const normalizedId = channelId.trim();
  const normalizedMax = Math.max(1, Math.min(50, maxResults));
  if (!trimmedKey || !normalizedId) {
    return { lastRefreshedAt: null, shouldForceRefresh: true };
  }

  const channelMeta = getCachedMeta(channelByIdCacheKey(trimmedKey, normalizedId));
  const videosMeta = getCachedMeta(channelVideosCacheKey(trimmedKey, normalizedId, normalizedMax));

  if (!channelMeta || !videosMeta) {
    return { lastRefreshedAt: null, shouldForceRefresh: true };
  }

  const lastRefreshedMs = Math.min(channelMeta.cachedAt, videosMeta.cachedAt);
  const isOlderThanDay = Date.now() - lastRefreshedMs > 24 * 60 * 60 * 1000;

  return {
    lastRefreshedAt: new Date(lastRefreshedMs).toISOString(),
    shouldForceRefresh: isOlderThanDay,
  };
}

function rethrowYouTubeError(error: unknown): never {
  if (isYouTubeInvalidApiKeyError(error)) {
    throw new YouTubeInvalidApiKeyError();
  }
  if (isYouTubeQuotaExceededError(error)) {
    throw new YouTubeQuotaExceededError();
  }
  throw error;
}

function toChannel(item: youtube_v3.Schema$Channel): YouTubeChannel {
  return {
    id: item.id ?? "",
    title: item.snippet?.title ?? "",
    description: item.snippet?.description ?? "",
    thumbnailUrl:
      item.snippet?.thumbnails?.high?.url ??
      item.snippet?.thumbnails?.default?.url ??
      undefined,
    subscriberCount: Number(item.statistics?.subscriberCount ?? 0),
    viewCount: Number(item.statistics?.viewCount ?? 0),
  };
}

function toVideo(item: youtube_v3.Schema$Video): YouTubeVideo {
  // `snippet.tags` is absent when the creator set no tags; we normalise that
  // to `undefined` rather than `[]` so downstream callers can distinguish
  // "no data available" from "creator explicitly set no tags" if they ever
  // need to. Non-string tag entries are filtered out defensively.
  const rawTags = item.snippet?.tags;
  const tags = Array.isArray(rawTags)
    ? rawTags.filter((tag): tag is string => typeof tag === "string")
    : undefined;

  return {
    id: item.id ?? "",
    title: item.snippet?.title ?? "",
    description: item.snippet?.description ?? "",
    publishedAt: item.snippet?.publishedAt ?? "",
    duration: item.contentDetails?.duration ?? "",
    thumbnailUrl:
      item.snippet?.thumbnails?.high?.url ??
      item.snippet?.thumbnails?.default?.url ??
      undefined,
    viewCount: Number(item.statistics?.viewCount ?? 0),
    likeCount: Number(item.statistics?.likeCount ?? 0),
    commentCount: Number(item.statistics?.commentCount ?? 0),
    tags,
  };
}

async function getChannelUploadsPlaylistId(
  apiKey: string,
  channelId: string,
  options: CacheOptions = {}
): Promise<string | null> {
  const bypassCache = options.bypassCache === true;
  const cacheKey = `${scope(apiKey)}:channel:uploads:${channelId}`;
  if (!bypassCache) {
    const cached = getCached<string | null>(cacheKey);
    if (cached !== null) return cached;
  }

  const youtube = getYouTubeClient(apiKey);
  const response = await youtube.channels.list({
    id: [channelId],
    part: ["contentDetails"],
    maxResults: 1,
  });

  const uploadsPlaylistId =
    response.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;

  return setCached(cacheKey, uploadsPlaylistId);
}

export async function getChannelByHandle(
  apiKey: string,
  handle: string,
  options: CacheOptions = {}
): Promise<YouTubeChannel | null> {
  const bypassCache = options.bypassCache === true;
  const normalizedHandle = handle.trim().replace(/^@/, "");
  if (!normalizedHandle) return null;

  const cacheKey = `${scope(apiKey)}:channel:handle:${normalizedHandle.toLowerCase()}`;
  if (!bypassCache) {
    const cached = getCached<YouTubeChannel | null>(cacheKey);
    if (cached !== null) return cached;
  }

  try {
    const youtube = getYouTubeClient(apiKey);
    const response = await youtube.channels.list({
      forHandle: normalizedHandle,
      part: ["snippet", "statistics"],
      maxResults: 1,
    });

    const item = response.data.items?.[0];
    const mapped = item ? toChannel(item) : null;
    return setCached(cacheKey, mapped);
  } catch (error) {
    rethrowYouTubeError(error);
  }
}

export async function getChannelById(
  apiKey: string,
  id: string,
  options: CacheOptions = {}
): Promise<YouTubeChannel | null> {
  const bypassCache = options.bypassCache === true;
  const normalizedId = id.trim();
  if (!normalizedId) return null;

  const cacheKey = channelByIdCacheKey(apiKey, normalizedId);
  if (!bypassCache) {
    const cached = getCached<YouTubeChannel | null>(cacheKey);
    if (cached !== null) return cached;
  }

  try {
    const youtube = getYouTubeClient(apiKey);
    const response = await youtube.channels.list({
      id: [normalizedId],
      part: ["snippet", "statistics"],
      maxResults: 1,
    });

    const item = response.data.items?.[0];
    const mapped = item ? toChannel(item) : null;
    return setCached(cacheKey, mapped);
  } catch (error) {
    rethrowYouTubeError(error);
  }
}

export async function getChannelVideos(
  apiKey: string,
  channelId: string,
  maxResults = 50,
  options: CacheOptions = {}
): Promise<YouTubeVideo[]> {
  const bypassCache = options.bypassCache === true;
  const normalizedId = channelId.trim();
  const normalizedMax = Math.max(1, Math.min(50, maxResults));
  if (!normalizedId) return [];

  const cacheKey = channelVideosCacheKey(apiKey, normalizedId, normalizedMax);
  if (!bypassCache) {
    const cached = getCached<YouTubeVideo[]>(cacheKey);
    if (cached !== null) return cached;
  }

  try {
    const uploadsPlaylistId = await getChannelUploadsPlaylistId(apiKey, normalizedId, {
      bypassCache,
    });
    if (!uploadsPlaylistId) return setCached(cacheKey, []);

    const youtube = getYouTubeClient(apiKey);
    const videoIds: string[] = [];
    let pageToken: string | undefined;

    while (videoIds.length < normalizedMax) {
      const playlistResponse = await youtube.playlistItems.list({
        playlistId: uploadsPlaylistId,
        part: ["contentDetails"],
        maxResults: Math.min(50, normalizedMax - videoIds.length),
        pageToken,
      });

      const idsFromPage =
        playlistResponse.data.items
          ?.map((item) => item.contentDetails?.videoId)
          .filter((id): id is string => Boolean(id)) ?? [];
      videoIds.push(...idsFromPage);

      pageToken = playlistResponse.data.nextPageToken ?? undefined;
      if (!pageToken || idsFromPage.length === 0) break;
    }

    const videos = await getVideoDetails(apiKey, videoIds.slice(0, normalizedMax), {
      bypassCache,
    });
    return setCached(cacheKey, videos);
  } catch (error) {
    rethrowYouTubeError(error);
  }
}

export async function getVideoDetails(
  apiKey: string,
  videoIds: string[],
  options: CacheOptions = {}
): Promise<YouTubeVideo[]> {
  const bypassCache = options.bypassCache === true;
  const normalizedIds = Array.from(
    new Set(videoIds.map((id) => id.trim()).filter(Boolean))
  );
  if (normalizedIds.length === 0) return [];

  const cacheKey = `${scope(apiKey)}:videos:details:${normalizedIds.join(",")}`;
  if (!bypassCache) {
    const cached = getCached<YouTubeVideo[]>(cacheKey);
    if (cached !== null) return cached;
  }

  try {
    const youtube = getYouTubeClient(apiKey);
    const response = await youtube.videos.list({
      id: normalizedIds,
      part: ["snippet", "statistics", "contentDetails"],
      maxResults: Math.min(50, normalizedIds.length),
    });

    const videos =
      response.data.items
        ?.map((item) => toVideo(item))
        .filter((video) => Boolean(video.id)) ?? [];

    return setCached(cacheKey, videos);
  } catch (error) {
    rethrowYouTubeError(error);
  }
}
