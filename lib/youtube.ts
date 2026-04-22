import { createHash } from "node:crypto";
import { google, youtube_v3 } from "googleapis";
import { YouTubeChannel, YouTubeVideo } from "@/types/youtube";
import {
  isYouTubeInvalidApiKeyError,
  isYouTubeQuotaExceededError,
  YouTubeInvalidApiKeyError,
  YouTubeQuotaExceededError,
} from "@/lib/errors";

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; data: unknown }>();

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

function setCached<T>(key: string, data: T): T {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data });
  return data;
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
  channelId: string
): Promise<string | null> {
  const cacheKey = `${scope(apiKey)}:channel:uploads:${channelId}`;
  const cached = getCached<string | null>(cacheKey);
  if (cached !== null) return cached;

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
  handle: string
): Promise<YouTubeChannel | null> {
  const normalizedHandle = handle.trim().replace(/^@/, "");
  if (!normalizedHandle) return null;

  const cacheKey = `${scope(apiKey)}:channel:handle:${normalizedHandle.toLowerCase()}`;
  const cached = getCached<YouTubeChannel | null>(cacheKey);
  if (cached !== null) return cached;

  try {
    const youtube = getYouTubeClient(apiKey);
    const response = await youtube.channels.list({
      forHandle: normalizedHandle,
      part: ["snippet", "statistics"],
      maxResults: 1,
    });

    const item = response.data.items?.[0];
    return setCached(cacheKey, item ? toChannel(item) : null);
  } catch (error) {
    rethrowYouTubeError(error);
  }
}

export async function getChannelById(
  apiKey: string,
  id: string
): Promise<YouTubeChannel | null> {
  const normalizedId = id.trim();
  if (!normalizedId) return null;

  const cacheKey = `${scope(apiKey)}:channel:id:${normalizedId}`;
  const cached = getCached<YouTubeChannel | null>(cacheKey);
  if (cached !== null) return cached;

  try {
    const youtube = getYouTubeClient(apiKey);
    const response = await youtube.channels.list({
      id: [normalizedId],
      part: ["snippet", "statistics"],
      maxResults: 1,
    });

    const item = response.data.items?.[0];
    return setCached(cacheKey, item ? toChannel(item) : null);
  } catch (error) {
    rethrowYouTubeError(error);
  }
}

export async function getChannelVideos(
  apiKey: string,
  channelId: string,
  maxResults = 50
): Promise<YouTubeVideo[]> {
  const normalizedId = channelId.trim();
  const normalizedMax = Math.max(1, Math.min(50, maxResults));
  if (!normalizedId) return [];

  const cacheKey = `${scope(apiKey)}:videos:channel:${normalizedId}:${normalizedMax}`;
  const cached = getCached<YouTubeVideo[]>(cacheKey);
  if (cached !== null) return cached;

  try {
    const uploadsPlaylistId = await getChannelUploadsPlaylistId(apiKey, normalizedId);
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

    const videos = await getVideoDetails(apiKey, videoIds.slice(0, normalizedMax));
    return setCached(cacheKey, videos);
  } catch (error) {
    rethrowYouTubeError(error);
  }
}

export async function getVideoDetails(
  apiKey: string,
  videoIds: string[]
): Promise<YouTubeVideo[]> {
  const normalizedIds = Array.from(
    new Set(videoIds.map((id) => id.trim()).filter(Boolean))
  );
  if (normalizedIds.length === 0) return [];

  const cacheKey = `${scope(apiKey)}:videos:details:${normalizedIds.join(",")}`;
  const cached = getCached<YouTubeVideo[]>(cacheKey);
  if (cached !== null) return cached;

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
