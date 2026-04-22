import { describe, expect, it, vi } from "vitest";
import {
  clearCachedAnalysis,
  KeyValueStorage,
  readCachedAnalysis,
  THUMBNAIL_CACHE_KEY_PREFIX,
  THUMBNAIL_CACHE_TTL_MS,
  thumbnailCacheKey,
  writeCachedAnalysis,
} from "@/lib/thumbnailCache";
import { ThumbnailAnalysis } from "@/lib/thumbnailPrompt";

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

function sampleAnalysis(overrides: Partial<ThumbnailAnalysis> = {}): ThumbnailAnalysis {
  return {
    faceEmotionDetection: "Smiling presenter, mid-30s.",
    textReadabilityScore: 7,
    colorContrastAssessment: "Strong complementary palette (orange on teal).",
    titleCuriosityGapScore: 8,
    improvementSuggestions: ["Shorten the overlay text.", "Tighten the crop.", "Add a focal arrow."],
    ...overrides,
  };
}

const VIDEO_ID = "abc123";

describe("thumbnailCacheKey", () => {
  it("namespaces the videoId under the shared prefix", () => {
    expect(thumbnailCacheKey(VIDEO_ID)).toBe(`${THUMBNAIL_CACHE_KEY_PREFIX}${VIDEO_ID}`);
  });
});

describe("writeCachedAnalysis + readCachedAnalysis", () => {
  it("round-trips an analysis through storage", () => {
    const storage = memoryStorage();
    const now = new Date("2026-04-21T10:00:00Z");
    const written = writeCachedAnalysis(storage, VIDEO_ID, sampleAnalysis(), now);
    expect(written?.savedAt).toBe(now.toISOString());

    const entry = readCachedAnalysis(storage, VIDEO_ID, now);
    expect(entry?.analysis).toEqual(sampleAnalysis());
    expect(entry?.savedAt).toBe(now.toISOString());
  });

  it("returns null from read when no entry exists", () => {
    const storage = memoryStorage();
    expect(readCachedAnalysis(storage, VIDEO_ID)).toBeNull();
  });

  it("treats an entry older than the TTL as a cache miss and removes it", () => {
    const storage = memoryStorage();
    const writeTime = new Date("2026-04-20T00:00:00Z");
    writeCachedAnalysis(storage, VIDEO_ID, sampleAnalysis(), writeTime);
    const later = new Date(writeTime.getTime() + THUMBNAIL_CACHE_TTL_MS + 1);
    expect(readCachedAnalysis(storage, VIDEO_ID, later)).toBeNull();
    expect(storage.map.has(thumbnailCacheKey(VIDEO_ID))).toBe(false);
  });

  it("keeps an entry exactly at the TTL boundary (inclusive freshness)", () => {
    const storage = memoryStorage();
    const writeTime = new Date("2026-04-20T00:00:00Z");
    writeCachedAnalysis(storage, VIDEO_ID, sampleAnalysis(), writeTime);
    const edge = new Date(writeTime.getTime() + THUMBNAIL_CACHE_TTL_MS);
    expect(readCachedAnalysis(storage, VIDEO_ID, edge)).not.toBeNull();
  });

  it("drops and reports a miss when the stored JSON is malformed", () => {
    const storage = memoryStorage();
    storage.setItem(thumbnailCacheKey(VIDEO_ID), "{not json");
    expect(readCachedAnalysis(storage, VIDEO_ID)).toBeNull();
    expect(storage.map.has(thumbnailCacheKey(VIDEO_ID))).toBe(false);
  });

  it("drops and reports a miss when the stored entry has the wrong shape", () => {
    const storage = memoryStorage();
    storage.setItem(
      thumbnailCacheKey(VIDEO_ID),
      JSON.stringify({ analysis: { faceEmotionDetection: "x" }, savedAt: "2026-01-01T00:00:00Z" })
    );
    expect(readCachedAnalysis(storage, VIDEO_ID)).toBeNull();
    expect(storage.map.has(thumbnailCacheKey(VIDEO_ID))).toBe(false);
  });

  it("drops an entry whose savedAt is not a parseable date", () => {
    const storage = memoryStorage();
    storage.setItem(
      thumbnailCacheKey(VIDEO_ID),
      JSON.stringify({ analysis: sampleAnalysis(), savedAt: "not-a-date" })
    );
    expect(readCachedAnalysis(storage, VIDEO_ID)).toBeNull();
    expect(storage.map.has(thumbnailCacheKey(VIDEO_ID))).toBe(false);
  });

  it("rejects an analysis whose suggestions contain non-strings", () => {
    const storage = memoryStorage();
    const bad = { ...sampleAnalysis(), improvementSuggestions: ["ok", 42] };
    storage.setItem(
      thumbnailCacheKey(VIDEO_ID),
      JSON.stringify({ analysis: bad, savedAt: new Date().toISOString() })
    );
    expect(readCachedAnalysis(storage, VIDEO_ID)).toBeNull();
  });

  it("rejects a parsed value that isn't an object (e.g. JSON array)", () => {
    const storage = memoryStorage();
    storage.setItem(thumbnailCacheKey(VIDEO_ID), JSON.stringify([1, 2, 3]));
    expect(readCachedAnalysis(storage, VIDEO_ID)).toBeNull();
  });

  it.each([JSON.stringify(null), JSON.stringify(42), JSON.stringify("a string")])(
    "rejects a non-object JSON root (%s)",
    (raw) => {
      const storage = memoryStorage();
      storage.setItem(thumbnailCacheKey(VIDEO_ID), raw);
      expect(readCachedAnalysis(storage, VIDEO_ID)).toBeNull();
      expect(storage.map.has(thumbnailCacheKey(VIDEO_ID))).toBe(false);
    }
  );

  it("rejects an entry whose analysis field is not an object", () => {
    const storage = memoryStorage();
    storage.setItem(
      thumbnailCacheKey(VIDEO_ID),
      JSON.stringify({ analysis: "not-an-object", savedAt: new Date().toISOString() })
    );
    expect(readCachedAnalysis(storage, VIDEO_ID)).toBeNull();
  });

  it.each([
    { field: "faceEmotionDetection", value: 1 },
    { field: "colorContrastAssessment", value: 1 },
    { field: "textReadabilityScore", value: "7" },
    { field: "titleCuriosityGapScore", value: "8" },
    { field: "improvementSuggestions", value: "not-array" },
  ])("rejects an analysis with invalid %s", ({ field, value }) => {
    const storage = memoryStorage();
    const bad = { ...sampleAnalysis(), [field]: value };
    storage.setItem(
      thumbnailCacheKey(VIDEO_ID),
      JSON.stringify({ analysis: bad, savedAt: new Date().toISOString() })
    );
    expect(readCachedAnalysis(storage, VIDEO_ID)).toBeNull();
  });
});

describe("storage unavailability + errors", () => {
  it("is a no-op when storage is null (SSR / private mode)", () => {
    expect(readCachedAnalysis(null, VIDEO_ID)).toBeNull();
    expect(writeCachedAnalysis(null, VIDEO_ID, sampleAnalysis())).toBeNull();
    // Should not throw:
    clearCachedAnalysis(null, VIDEO_ID);
  });

  it("is a no-op when storage is undefined", () => {
    expect(readCachedAnalysis(undefined, VIDEO_ID)).toBeNull();
    expect(writeCachedAnalysis(undefined, VIDEO_ID, sampleAnalysis())).toBeNull();
    clearCachedAnalysis(undefined, VIDEO_ID);
  });

  it("returns null and does not throw when the videoId is empty", () => {
    const storage = memoryStorage();
    expect(readCachedAnalysis(storage, "")).toBeNull();
    expect(writeCachedAnalysis(storage, "", sampleAnalysis())).toBeNull();
    clearCachedAnalysis(storage, "");
    expect(storage.map.size).toBe(0);
  });

  it("returns null when setItem throws (e.g. quota exceeded)", () => {
    const storage: KeyValueStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    };
    expect(writeCachedAnalysis(storage, VIDEO_ID, sampleAnalysis())).toBeNull();
  });

  it("tolerates getItem throwing and treats it as a miss", () => {
    const storage: KeyValueStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(readCachedAnalysis(storage, VIDEO_ID)).toBeNull();
  });

  it("tolerates removeItem throwing while dropping a stale entry", () => {
    const raw = JSON.stringify({ analysis: sampleAnalysis(), savedAt: "not-a-date" });
    const removeSpy = vi.fn(() => {
      throw new Error("SecurityError");
    });
    const storage: KeyValueStorage = {
      getItem: () => raw,
      setItem: () => {},
      removeItem: removeSpy,
    };
    expect(readCachedAnalysis(storage, VIDEO_ID)).toBeNull();
    expect(removeSpy).toHaveBeenCalledOnce();
  });
});

describe("clearCachedAnalysis", () => {
  it("removes an existing entry", () => {
    const storage = memoryStorage();
    writeCachedAnalysis(storage, VIDEO_ID, sampleAnalysis());
    expect(storage.map.size).toBe(1);
    clearCachedAnalysis(storage, VIDEO_ID);
    expect(storage.map.size).toBe(0);
  });
});
