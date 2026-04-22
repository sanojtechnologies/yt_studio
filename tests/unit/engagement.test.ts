import { describe, expect, it } from "vitest";
import {
  computeEngagementReport,
  DEFAULT_ENGAGEMENT_THRESHOLD,
  getEngagementRate,
} from "@/lib/engagement";
import { YouTubeVideo } from "@/types/youtube";

type VideoOverrides = Partial<YouTubeVideo> & { id: string };

function video(overrides: VideoOverrides): YouTubeVideo {
  return {
    title: overrides.id,
    description: "",
    publishedAt: "2025-01-01T00:00:00Z",
    duration: "PT10M", // long-form by default
    viewCount: 1_000,
    likeCount: 50,
    commentCount: 10,
    ...overrides,
  };
}

function shortVideo(overrides: VideoOverrides): YouTubeVideo {
  // isShort = true forces classifyVideoFormat to "short" regardless of duration.
  return video({ isShort: true, duration: "PT30S", ...overrides });
}

describe("getEngagementRate", () => {
  it("returns undefined when views are 0", () => {
    expect(getEngagementRate(video({ id: "a", viewCount: 0 }))).toBeUndefined();
  });

  it("returns undefined when likes AND comments are both 0", () => {
    expect(
      getEngagementRate(video({ id: "a", likeCount: 0, commentCount: 0 }))
    ).toBeUndefined();
  });

  it("returns a number when at least one signal is present", () => {
    expect(getEngagementRate(video({ id: "a", likeCount: 10, commentCount: 0 }))).toBe(1);
    expect(getEngagementRate(video({ id: "a", likeCount: 0, commentCount: 5 }))).toBe(0.5);
  });

  it("computes (likes + comments) / views * 100", () => {
    const v = video({ id: "a", viewCount: 500, likeCount: 20, commentCount: 5 });
    expect(getEngagementRate(v)).toBe(5);
  });
});

describe("computeEngagementReport", () => {
  it("returns an empty report for no videos", () => {
    const report = computeEngagementReport([]);
    expect(report.annotations.size).toBe(0);
    expect(report.shorts).toEqual({ median: 0, mad: 0, count: 0 });
    expect(report.long).toEqual({ median: 0, mad: 0, count: 0 });
    expect(report.threshold).toBe(DEFAULT_ENGAGEMENT_THRESHOLD);
  });

  it("classifies a single-video bucket as normal (MAD = 0)", () => {
    const v = video({ id: "only" });
    const report = computeEngagementReport([v]);
    const a = report.annotations.get("only");
    expect(a?.bucket).toBe("normal");
    expect(a?.score).toBe(0);
    expect(a?.rate).toBeGreaterThan(0);
    expect(a?.format).toBe("long");
  });

  it("flags a clear high-engagement long-form outperformer", () => {
    // Rates [6, 6, 6.5, 6.5, 20] → median 6.5, MAD 0.5, threshold 1.0:
    // normals land within ±0.67 z, viral is at z ≈ 18.2 → "high".
    const videos: YouTubeVideo[] = [
      video({ id: "a", likeCount: 60, commentCount: 0 }), // 6.0%
      video({ id: "b", likeCount: 60, commentCount: 0 }), // 6.0%
      video({ id: "c", likeCount: 65, commentCount: 0 }), // 6.5%
      video({ id: "d", likeCount: 65, commentCount: 0 }), // 6.5%
      video({ id: "viral", likeCount: 190, commentCount: 10 }), // 20.0%
    ];
    const report = computeEngagementReport(videos);
    expect(report.annotations.get("viral")?.bucket).toBe("high");
    for (const id of ["a", "b", "c", "d"]) {
      expect(report.annotations.get(id)?.bucket).toBe("normal");
    }
  });

  it("flags a clear below-average long-form video", () => {
    const videos: YouTubeVideo[] = [
      video({ id: "a", likeCount: 50, commentCount: 10 }), // 6.0%
      video({ id: "b", likeCount: 52, commentCount: 10 }), // 6.2%
      video({ id: "c", likeCount: 48, commentCount: 10 }), // 5.8%
      video({ id: "d", likeCount: 55, commentCount: 5 }), // 6.0%
      video({ id: "flop", likeCount: 2, commentCount: 0 }), // 0.2%
    ];
    const report = computeEngagementReport(videos);
    expect(report.annotations.get("flop")?.bucket).toBe("below");
  });

  it("classifies Shorts and long-form against separate baselines", () => {
    // Shorts baseline: ~10%. Long-form baseline: ~1%. A Short at 2% would be
    // below its own baseline but above long-form; the format split ensures it
    // is not labelled "high" just because long-form engagement is lower.
    const videos: YouTubeVideo[] = [
      // Long-form cluster around 1% with mild spread so MAD > 0.
      video({ id: "L1", likeCount: 8, commentCount: 2 }), // 1.0%
      video({ id: "L2", likeCount: 11, commentCount: 0 }), // 1.1%
      video({ id: "L3", likeCount: 9, commentCount: 2 }), // 1.1%
      video({ id: "L4", likeCount: 8, commentCount: 1 }), // 0.9%
      // Shorts cluster around 10% with mild spread so MAD > 0.
      shortVideo({ id: "S1", likeCount: 80, commentCount: 20 }), // 10%
      shortVideo({ id: "S2", likeCount: 95, commentCount: 5 }), // 10%
      shortVideo({ id: "S3", likeCount: 105, commentCount: 5 }), // 11%
      shortVideo({ id: "S4", likeCount: 85, commentCount: 5 }), // 9%
      // Ambiguous: 2% Short (low for Shorts), 2% long-form (above long median).
      shortVideo({ id: "Sweak", likeCount: 15, commentCount: 5 }),
      video({ id: "Lstrong", likeCount: 15, commentCount: 5 }),
    ];
    const report = computeEngagementReport(videos);
    expect(report.shorts.count).toBe(5);
    expect(report.long.count).toBe(5);
    expect(report.annotations.get("Sweak")?.bucket).toBe("below");
    expect(report.annotations.get("Lstrong")?.bucket).toBe("high");
    expect(report.annotations.get("Sweak")?.format).toBe("short");
    expect(report.annotations.get("Lstrong")?.format).toBe("long");
  });

  it("marks videos with 0 views as N/A and excludes them from stats", () => {
    const videos: YouTubeVideo[] = [
      video({ id: "a", likeCount: 50, commentCount: 10 }),
      video({ id: "b", likeCount: 50, commentCount: 10 }),
      video({ id: "c", likeCount: 50, commentCount: 10 }),
      video({ id: "zero", viewCount: 0, likeCount: 5, commentCount: 5 }),
    ];
    const report = computeEngagementReport(videos);
    const na = report.annotations.get("zero");
    expect(na?.bucket).toBe("na");
    expect(na?.rate).toBe(0);
    expect(na?.score).toBe(0);
    expect(na?.format).toBe("long");
    expect(na?.medianForFormat).toBe(report.long.median);
    expect(report.long.count).toBe(3);
  });

  it("marks videos with 0 likes AND 0 comments as N/A", () => {
    const videos: YouTubeVideo[] = [
      video({ id: "a", likeCount: 50, commentCount: 10 }),
      video({ id: "b", likeCount: 50, commentCount: 10 }),
      video({ id: "silent", likeCount: 0, commentCount: 0 }),
    ];
    const report = computeEngagementReport(videos);
    expect(report.annotations.get("silent")?.bucket).toBe("na");
  });

  it("keeps a video with only likes (no comments) out of the N/A bucket", () => {
    const videos: YouTubeVideo[] = [
      video({ id: "a", likeCount: 50, commentCount: 10 }),
      video({ id: "b", likeCount: 50, commentCount: 10 }),
      video({ id: "likes-only", likeCount: 30, commentCount: 0 }),
    ];
    const report = computeEngagementReport(videos);
    expect(report.annotations.get("likes-only")?.bucket).not.toBe("na");
  });

  it("treats a constant bucket (MAD = 0) as all-normal", () => {
    const videos: YouTubeVideo[] = [
      video({ id: "a", likeCount: 50, commentCount: 10 }),
      video({ id: "b", likeCount: 50, commentCount: 10 }),
      video({ id: "c", likeCount: 50, commentCount: 10 }),
    ];
    const report = computeEngagementReport(videos);
    expect(report.long.mad).toBe(0);
    for (const id of ["a", "b", "c"]) {
      const a = report.annotations.get(id);
      expect(a?.bucket).toBe("normal");
      expect(a?.score).toBe(0);
    }
  });

  it("respects a custom threshold", () => {
    // warm has z ≈ 1.69: within a generous 5-MAD window, but past a strict 0.25.
    const videos: YouTubeVideo[] = [
      video({ id: "a", likeCount: 50, commentCount: 10 }), // 6.0%
      video({ id: "b", likeCount: 52, commentCount: 10 }), // 6.2%
      video({ id: "c", likeCount: 48, commentCount: 10 }), // 5.8%
      video({ id: "d", likeCount: 55, commentCount: 5 }), // 6.0%
      video({ id: "warm", likeCount: 60, commentCount: 5 }), // 6.5%
    ];
    const lenient = computeEngagementReport(videos, 5);
    expect(lenient.annotations.get("warm")?.bucket).toBe("normal");
    const strict = computeEngagementReport(videos, 0.25);
    expect(strict.annotations.get("warm")?.bucket).toBe("high");
  });

  it("exposes the channel format median for tooltip use", () => {
    const videos: YouTubeVideo[] = [
      video({ id: "a", likeCount: 50, commentCount: 10 }), // 6%
      video({ id: "b", likeCount: 40, commentCount: 0 }), // 4%
      video({ id: "c", likeCount: 60, commentCount: 10 }), // 7%
    ];
    const report = computeEngagementReport(videos);
    const annotation = report.annotations.get("a");
    expect(annotation?.medianForFormat).toBe(report.long.median);
    expect(report.long.median).toBeCloseTo(6, 10);
  });
});
