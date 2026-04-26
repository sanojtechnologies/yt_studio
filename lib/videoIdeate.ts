import { google } from "googleapis";
import { classifyVideoFormat } from "@/lib/duration";
import { isYouTubeInvalidApiKeyError, isYouTubeQuotaExceededError, YouTubeInvalidApiKeyError, YouTubeQuotaExceededError } from "@/lib/errors";
import { extractNgrams } from "@/lib/ngrams";
import { YouTubeVideo } from "@/types/youtube";
import { normalizeSeedKeywords } from "@/lib/videoIdeatePrompt";

export interface IdeateVideoSample {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  channelTitle: string;
  duration: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

export interface VideoIdeateEvidence {
  windowDays: number;
  sampleSize: number;
  topPhrases: Array<{ phrase: string; weightedViews: number; count: number }>;
  keywordPerformance: Array<{
    keyword: string;
    mentions: number;
    avgViews: number;
    avgEngagementRate: number;
  }>;
  topVideos: Array<{ title: string; channelTitle: string; viewCount: number; publishedAt: string }>;
  opportunitySignals: string[];
  formatMix: { short: number; long: number };
}

interface BuildEvidenceArgs {
  keywords: string[];
  videos: IdeateVideoSample[];
  now?: Date;
  windowDays?: number;
}

function engagementRate(video: IdeateVideoSample): number {
  if (video.viewCount <= 0) return 0;
  return ((video.likeCount + video.commentCount) / video.viewCount) * 100;
}

function parsePublishedAtMs(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function filterRecentVideos(videos: IdeateVideoSample[], now: Date = new Date(), windowDays = 30): IdeateVideoSample[] {
  const minMs = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  return videos.filter((video) => {
    const ms = parsePublishedAtMs(video.publishedAt);
    return ms !== null && ms >= minMs;
  });
}

function buildOpportunitySignals(evidence: VideoIdeateEvidence): string[] {
  if (evidence.sampleSize === 0) {
    return ["Recent signal is sparse; use conservative confidence."];
  }
  const signals: string[] = [];
  const topKeyword = evidence.keywordPerformance[0];
  if (topKeyword && topKeyword.mentions > 0) {
    signals.push(
      `Keyword "${topKeyword.keyword}" has ${topKeyword.mentions} mentions with average ${Math.round(topKeyword.avgViews).toLocaleString()} views in the last ${evidence.windowDays} days.`
    );
  }
  const topPhrase = evidence.topPhrases[0];
  if (topPhrase) {
    signals.push(
      `Phrase "${topPhrase.phrase}" appears ${topPhrase.count} times and has ${Math.round(topPhrase.weightedViews).toLocaleString()} weighted views.`
    );
  }
  if (evidence.formatMix.short > evidence.formatMix.long) {
    signals.push("Short-form output dominates recent winners.");
  } else if (evidence.formatMix.long > evidence.formatMix.short) {
    signals.push("Long-form output dominates recent winners.");
  } else {
    signals.push("Short and long-form performance are balanced.");
  }
  return signals.slice(0, 4);
}

export function buildVideoIdeateEvidence(args: BuildEvidenceArgs): VideoIdeateEvidence {
  const now = args.now ?? new Date();
  const windowDays = args.windowDays ?? 30;
  const keywords = normalizeSeedKeywords(args.keywords);
  const recent = filterRecentVideos(args.videos, now, windowDays);
  const ngramInput: YouTubeVideo[] = recent.map((video) => ({
    id: video.id,
    title: video.title,
    description: video.description,
    publishedAt: video.publishedAt,
    duration: video.duration,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    commentCount: video.commentCount,
  }));
  const topPhrases = extractNgrams(ngramInput, { n: 2, minCount: 2, limit: 8 }).map((entry) => ({
    phrase: entry.phrase,
    weightedViews: entry.weightedViews,
    count: entry.count,
  }));
  const keywordPerformance = keywords.map((keyword) => {
    const lower = keyword.toLowerCase();
    const matched = recent.filter((video) =>
      `${video.title} ${video.description}`.toLowerCase().includes(lower)
    );
    const mentions = matched.length;
    const avgViews =
      mentions > 0 ? matched.reduce((sum, video) => sum + video.viewCount, 0) / mentions : 0;
    const avgEngagementRate =
      mentions > 0 ? matched.reduce((sum, video) => sum + engagementRate(video), 0) / mentions : 0;
    return { keyword, mentions, avgViews, avgEngagementRate };
  });
  keywordPerformance.sort((a, b) => b.avgViews - a.avgViews || b.mentions - a.mentions);
  const ranked = recent.slice().sort((a, b) => b.viewCount - a.viewCount);
  const formatMix = ranked.slice(0, 20).reduce(
    (acc, video) => {
      const format = classifyVideoFormat(video);
      if (format === "short") acc.short += 1;
      else acc.long += 1;
      return acc;
    },
    { short: 0, long: 0 }
  );
  const evidence: VideoIdeateEvidence = {
    windowDays,
    sampleSize: recent.length,
    topPhrases,
    keywordPerformance,
    topVideos: ranked.slice(0, 10).map((video) => ({
      title: video.title,
      channelTitle: video.channelTitle,
      viewCount: video.viewCount,
      publishedAt: video.publishedAt,
    })),
    opportunitySignals: [],
    formatMix,
  };
  evidence.opportunitySignals = buildOpportunitySignals(evidence);
  return evidence;
}

function mapVideoItem(item: {
  id?: string | null;
  snippet?: { title?: string | null; description?: string | null; publishedAt?: string | null; channelTitle?: string | null };
  statistics?: { viewCount?: string | null; likeCount?: string | null; commentCount?: string | null };
  contentDetails?: { duration?: string | null };
}): IdeateVideoSample | null {
  const id = item.id ?? "";
  if (!id) return null;
  return {
    id,
    title: item.snippet?.title ?? "",
    description: item.snippet?.description ?? "",
    publishedAt: item.snippet?.publishedAt ?? "",
    channelTitle: item.snippet?.channelTitle ?? "",
    duration: item.contentDetails?.duration ?? "",
    viewCount: Number(item.statistics?.viewCount ?? 0),
    likeCount: Number(item.statistics?.likeCount ?? 0),
    commentCount: Number(item.statistics?.commentCount ?? 0),
  };
}

function rethrowYouTubeError(error: unknown): never {
  if (isYouTubeInvalidApiKeyError(error)) throw new YouTubeInvalidApiKeyError();
  if (isYouTubeQuotaExceededError(error)) throw new YouTubeQuotaExceededError();
  throw error;
}

export async function fetchVideosForIdeation(args: {
  apiKey: string;
  keywords: string[];
  now?: Date;
  windowDays?: number;
  maxVideosPerKeyword?: number;
}): Promise<IdeateVideoSample[]> {
  const apiKey = args.apiKey.trim();
  const keywords = normalizeSeedKeywords(args.keywords);
  const now = args.now ?? new Date();
  const windowDays = args.windowDays ?? 30;
  const maxPerKeyword = Math.max(1, Math.min(50, args.maxVideosPerKeyword ?? 25));
  if (!apiKey) throw new YouTubeInvalidApiKeyError();
  if (keywords.length === 0) return [];

  const youtube = google.youtube({ version: "v3", auth: apiKey });
  const publishedAfter = new Date(
    now.getTime() - windowDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const allIds = new Set<string>();
  try {
    for (const keyword of keywords) {
      const search = await youtube.search.list({
        q: keyword,
        type: ["video"],
        part: ["snippet"],
        maxResults: maxPerKeyword,
        order: "viewCount",
        publishedAfter,
      });
      for (const item of search.data.items ?? []) {
        const id = item.id?.videoId;
        if (id) allIds.add(id);
      }
    }
    const ids = [...allIds];
    if (ids.length === 0) return [];
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
    const videos: IdeateVideoSample[] = [];
    for (const chunk of chunks) {
      const detail = await youtube.videos.list({
        id: chunk,
        part: ["snippet", "statistics", "contentDetails"],
        maxResults: chunk.length,
      });
      for (const item of detail.data.items ?? []) {
        const mapped = mapVideoItem(item);
        if (mapped) videos.push(mapped);
      }
    }
    return videos;
  } catch (error) {
    rethrowYouTubeError(error);
  }
}
