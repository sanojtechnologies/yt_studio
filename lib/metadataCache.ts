import {
  AnalysisCacheEntry,
  createAnalysisCache,
  KeyValueStorage,
} from "@/lib/analysisCache";
import { isMetadataAnalysis, MetadataAnalysis } from "@/lib/metadataPrompt";

/**
 * Metadata analyses are deterministic for a given title/description/tags
 * input, so cache per-video for 24 h (same envelope as the thumbnail cache
 * — see `lib/thumbnailCache.ts` for rationale). Creators edit these fields
 * rarely; when they do, clicking "Re-analyze metadata" is an explicit
 * cache-busting action.
 */
export const METADATA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const METADATA_CACHE_KEY_PREFIX = "ytstudio:meta:";

export type { KeyValueStorage } from "@/lib/analysisCache";
export type MetadataCacheEntry = AnalysisCacheEntry<MetadataAnalysis>;

const cache = createAnalysisCache<MetadataAnalysis>({
  prefix: METADATA_CACHE_KEY_PREFIX,
  ttlMs: METADATA_CACHE_TTL_MS,
  isValidShape: isMetadataAnalysis,
});

export const metadataCacheKey = cache.key;
export const readCachedMetadata = cache.read;
export const writeCachedMetadata = cache.write;
export const clearCachedMetadata = cache.clear;
