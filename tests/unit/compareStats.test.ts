import { describe, expect, it } from "vitest";
import {
  buildComparisonRow,
  COMPARE_LIMITS,
  isCompareReady,
  parseCompareIds,
} from "@/lib/compareStats";
import { YouTubeChannel, YouTubeVideo } from "@/types/youtube";

function channel(id: string): YouTubeChannel {
  return {
    id,
    title: id,
    description: "",
    subscriberCount: 0,
    viewCount: 0,
  };
}

function video(id: string, viewCount: number): YouTubeVideo {
  return {
    id,
    title: id,
    description: "",
    publishedAt: "2025-01-01T00:00:00Z",
    duration: "PT1M",
    viewCount,
    likeCount: 0,
    commentCount: 0,
  };
}

describe("parseCompareIds", () => {
  it("returns an empty list for null, undefined, or empty input", () => {
    expect(parseCompareIds(null)).toEqual([]);
    expect(parseCompareIds(undefined)).toEqual([]);
    expect(parseCompareIds("")).toEqual([]);
    expect(parseCompareIds(",,, ,,")).toEqual([]);
  });

  it("trims whitespace and de-duplicates while preserving first-seen order", () => {
    expect(parseCompareIds(" UC1 ,UC2,UC1, UC3 ")).toEqual(["UC1", "UC2", "UC3"]);
  });

  it("clamps to the documented maximum", () => {
    const lots = Array.from({ length: 10 }, (_, i) => `UC${i}`).join(",");
    const parsed = parseCompareIds(lots);
    expect(parsed).toHaveLength(COMPARE_LIMITS.max);
    expect(parsed[0]).toBe("UC0");
  });
});

describe("isCompareReady", () => {
  it("requires at least the documented minimum", () => {
    expect(isCompareReady([])).toBe(false);
    expect(isCompareReady(["UC1"])).toBe(false);
    expect(isCompareReady(["UC1", "UC2"])).toBe(true);
    expect(isCompareReady(["UC1", "UC2", "UC3"])).toBe(true);
  });
});

describe("buildComparisonRow", () => {
  it("computes median, top videos, and stats for a non-empty channel", () => {
    const videos = [
      video("a", 100),
      video("b", 500),
      video("c", 200),
      video("d", 50),
      video("e", 1000),
    ];
    const row = buildComparisonRow(channel("UC1"), videos, 3);
    expect(row.videoCount).toBe(5);
    // Sorted view counts: 50, 100, 200, 500, 1000 → median 200.
    expect(row.medianViews).toBe(200);
    expect(row.topVideos.map((v) => v.id)).toEqual(["e", "b", "c"]);
    expect(row.stats.avgViews).toBe(370);
  });

  it("computes median across an even-length sample as the average of the two middle values", () => {
    const videos = [video("a", 10), video("b", 20), video("c", 30), video("d", 40)];
    expect(buildComparisonRow(channel("UC"), videos).medianViews).toBe(25);
  });

  it("handles an empty video list without throwing", () => {
    const row = buildComparisonRow(channel("UC"), []);
    expect(row.videoCount).toBe(0);
    expect(row.medianViews).toBe(0);
    expect(row.topVideos).toEqual([]);
    expect(row.stats.avgViews).toBe(0);
  });
});
