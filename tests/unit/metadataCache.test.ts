import { describe, expect, it } from "vitest";
import { KeyValueStorage } from "@/lib/analysisCache";
import {
  clearCachedMetadata,
  METADATA_CACHE_KEY_PREFIX,
  METADATA_CACHE_TTL_MS,
  metadataCacheKey,
  readCachedMetadata,
  writeCachedMetadata,
} from "@/lib/metadataCache";
import { MetadataAnalysis } from "@/lib/metadataPrompt";

function memoryStorage(): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function sampleAnalysis(overrides: Partial<MetadataAnalysis> = {}): MetadataAnalysis {
  return {
    overallScore: 8,
    titleFeedback: "Strong hook, concise.",
    titleSuggestions: ["A", "B", "C"],
    descriptionFeedback: "Could use a CTA.",
    descriptionSuggestions: ["Add a CTA", "Add timestamps", "Link related videos"],
    tagsFeedback: "Covers core topic, missing long-tail.",
    suggestedTags: ["next.js", "react", "typescript", "vitest", "testing"],
    topRecommendations: ["Tighten title", "Add chapters", "Expand tag coverage"],
    ...overrides,
  };
}

const VIDEO_ID = "meta-vid-1";

describe("metadataCacheKey", () => {
  it("uses the metadata-specific prefix", () => {
    expect(metadataCacheKey(VIDEO_ID)).toBe(`${METADATA_CACHE_KEY_PREFIX}${VIDEO_ID}`);
    expect(METADATA_CACHE_KEY_PREFIX).not.toBe("ytstudio:thumb:");
  });
});

describe("metadataCache round-trip", () => {
  it("writes and reads back an analysis", () => {
    const storage = memoryStorage();
    const now = new Date("2026-04-21T12:00:00Z");
    const analysis = sampleAnalysis();
    writeCachedMetadata(storage, VIDEO_ID, analysis, now);
    const entry = readCachedMetadata(storage, VIDEO_ID, now);
    expect(entry?.analysis).toEqual(analysis);
    expect(entry?.savedAt).toBe(now.toISOString());
  });

  it("treats expired entries as misses", () => {
    const storage = memoryStorage();
    const writeTime = new Date("2026-04-20T00:00:00Z");
    writeCachedMetadata(storage, VIDEO_ID, sampleAnalysis(), writeTime);
    const later = new Date(writeTime.getTime() + METADATA_CACHE_TTL_MS + 1);
    expect(readCachedMetadata(storage, VIDEO_ID, later)).toBeNull();
    expect(storage.map.has(metadataCacheKey(VIDEO_ID))).toBe(false);
  });

  it("rejects an entry whose analysis fails the metadata shape guard", () => {
    const storage = memoryStorage();
    storage.setItem(
      metadataCacheKey(VIDEO_ID),
      JSON.stringify({
        analysis: { overallScore: "7" },
        savedAt: new Date().toISOString(),
      })
    );
    expect(readCachedMetadata(storage, VIDEO_ID)).toBeNull();
  });

  it("clears an entry from storage", () => {
    const storage = memoryStorage();
    writeCachedMetadata(storage, VIDEO_ID, sampleAnalysis());
    expect(storage.map.size).toBe(1);
    clearCachedMetadata(storage, VIDEO_ID);
    expect(storage.map.size).toBe(0);
  });

  it("is inert when storage is missing", () => {
    expect(readCachedMetadata(null, VIDEO_ID)).toBeNull();
    expect(writeCachedMetadata(null, VIDEO_ID, sampleAnalysis())).toBeNull();
    clearCachedMetadata(null, VIDEO_ID);
  });
});
