import {
  AnalysisCacheEntry,
  createAnalysisCache,
  KeyValueStorage,
} from "@/lib/analysisCache";
import { ThumbnailAnalysis } from "@/lib/thumbnailPrompt";

/**
 * Per-video thumbnail analysis is expensive (one Gemini vision call per
 * request) and the inputs — thumbnail image + title — are effectively
 * immutable for a published video. Cache analyses locally so a creator
 * re-opening the same dashboard or re-clicking the same card doesn't burn
 * their Gemini quota. 24 h mirrors the YouTube Data API cache TTL used
 * elsewhere so the whole dashboard expires together on a stale day.
 */
export const THUMBNAIL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Namespace on `localStorage` to avoid colliding with other app state. */
export const THUMBNAIL_CACHE_KEY_PREFIX = "ytstudio:thumb:";

export type { KeyValueStorage } from "@/lib/analysisCache";
export type ThumbnailCacheEntry = AnalysisCacheEntry<ThumbnailAnalysis>;

function isThumbnailAnalysis(value: unknown): value is ThumbnailAnalysis {
  if (!isRecord(value)) return false;
  if (typeof value.faceEmotionDetection !== "string") return false;
  if (typeof value.colorContrastAssessment !== "string") return false;
  if (typeof value.textReadabilityScore !== "number") return false;
  if (typeof value.titleCuriosityGapScore !== "number") return false;
  const suggestions = value.improvementSuggestions;
  if (!Array.isArray(suggestions)) return false;
  return suggestions.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const cache = createAnalysisCache<ThumbnailAnalysis>({
  prefix: THUMBNAIL_CACHE_KEY_PREFIX,
  ttlMs: THUMBNAIL_CACHE_TTL_MS,
  isValidShape: isThumbnailAnalysis,
});

export const thumbnailCacheKey = cache.key;
export const readCachedAnalysis = cache.read;
export const writeCachedAnalysis = cache.write;
export const clearCachedAnalysis = cache.clear;
