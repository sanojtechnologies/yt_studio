import { describe, expect, it } from "vitest";
import {
  calculateStats,
  RECENT_CADENCE_FALLBACK_SAMPLE,
  RECENT_CADENCE_WINDOW_DAYS,
} from "@/lib/stats";
import { YouTubeVideo } from "@/types/youtube";

function video(overrides: Partial<YouTubeVideo> = {}): YouTubeVideo {
  return {
    id: "v",
    title: "t",
    description: "",
    publishedAt: "2025-01-01T00:00:00Z",
    duration: "PT5M",
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    ...overrides,
  };
}

describe("calculateStats", () => {
  it("returns zeros and N/A when there are no videos", () => {
    expect(calculateStats([])).toEqual({
      avgViews: 0,
      engagementRate: 0,
      uploadFrequencyPerWeek: 0,
      bestDay: "N/A",
    });
  });

  it("computes avg views and engagement rate", () => {
    const videos = [
      video({ publishedAt: "2025-01-01T00:00:00Z", viewCount: 100, likeCount: 5, commentCount: 5 }),
      video({ publishedAt: "2025-01-08T00:00:00Z", viewCount: 300, likeCount: 15, commentCount: 15 }),
    ];
    const stats = calculateStats(videos);
    expect(stats.avgViews).toBe(200);
    // total engagement = 40, total views = 400 → 10%
    expect(stats.engagementRate).toBeCloseTo(10, 5);
  });

  it("returns 0 engagement rate when total views is 0", () => {
    const stats = calculateStats([
      video({ viewCount: 0, likeCount: 0, commentCount: 0 }),
      video({ viewCount: 0, likeCount: 0, commentCount: 0 }),
    ]);
    expect(stats.engagementRate).toBe(0);
    expect(Number.isFinite(stats.engagementRate)).toBe(true);
  });

  it("computes upload frequency from the cadence between publishes", () => {
    // 2 videos a week apart → 1 publish per week (one interval, 7 days).
    // PRD § 4.4: ((validDateCount - 1) / spanDays) * 7.
    const stats = calculateStats([
      video({ publishedAt: "2025-01-01T00:00:00Z" }),
      video({ publishedAt: "2025-01-08T00:00:00Z" }),
    ]);
    expect(stats.uploadFrequencyPerWeek).toBeCloseTo(1, 5);
  });

  it("reports a steady weekly cadence as exactly 1.0 per week", () => {
    // 5 videos posted weekly → 4 intervals over 28 days = 1.0/week.
    const stats = calculateStats([
      video({ publishedAt: "2025-01-01T00:00:00Z" }),
      video({ publishedAt: "2025-01-08T00:00:00Z" }),
      video({ publishedAt: "2025-01-15T00:00:00Z" }),
      video({ publishedAt: "2025-01-22T00:00:00Z" }),
      video({ publishedAt: "2025-01-29T00:00:00Z" }),
    ]);
    expect(stats.uploadFrequencyPerWeek).toBeCloseTo(1, 5);
  });

  it("excludes videos with invalid publishedAt from cadence math", () => {
    // 3 valid dates a week apart → 2 intervals / 14 days = 1.0/week. The bad
    // row must NOT count as a publish and must NOT inflate the rate.
    const stats = calculateStats([
      video({ publishedAt: "2025-01-01T00:00:00Z" }),
      video({ publishedAt: "2025-01-08T00:00:00Z" }),
      video({ publishedAt: "2025-01-15T00:00:00Z" }),
      video({ publishedAt: "garbage" }),
    ]);
    expect(stats.uploadFrequencyPerWeek).toBeCloseTo(1, 5);
  });

  it("clamps spanDays to 1 when every sampled video shares a publish day", () => {
    // 3 same-day publishes → span 0 → clamped to 1 day → 2 intervals * 7 = 14/week.
    // Honest about the burst, but obviously not predictive (see PRD § 4.4).
    const stats = calculateStats([
      video({ publishedAt: "2025-01-01T08:00:00Z" }),
      video({ publishedAt: "2025-01-01T12:00:00Z" }),
      video({ publishedAt: "2025-01-01T18:00:00Z" }),
    ]);
    expect(stats.uploadFrequencyPerWeek).toBeCloseTo(14, 5);
  });

  it("keeps upload frequency at 0 with only one dated video", () => {
    const stats = calculateStats([video({ publishedAt: "2025-01-01T00:00:00Z" })]);
    expect(stats.uploadFrequencyPerWeek).toBe(0);
  });

  it("ignores videos with invalid publishedAt when computing bestDay", () => {
    // Published Monday UTC with 1000 views, invalid date with 999999 views.
    const stats = calculateStats([
      video({ publishedAt: "2025-01-06T00:00:00Z", viewCount: 1000 }),
      video({ publishedAt: "not-a-date", viewCount: 999999 }),
    ]);
    expect(stats.bestDay).toBe("Monday");
  });

  it("returns bestDay 'N/A' when every video has an invalid publishedAt", () => {
    const stats = calculateStats([
      video({ publishedAt: "nope", viewCount: 10 }),
      video({ publishedAt: "also-bad", viewCount: 20 }),
    ]);
    expect(stats.bestDay).toBe("N/A");
    // Upload frequency also folds to 0 since no valid dates survive the filter.
    expect(stats.uploadFrequencyPerWeek).toBe(0);
  });

  it("picks the UTC weekday with the highest summed views as bestDay", () => {
    // 2025-01-05 = Sunday, 2025-01-06 = Monday, 2025-01-07 = Tuesday (UTC).
    const stats = calculateStats([
      video({ publishedAt: "2025-01-05T00:00:00Z", viewCount: 100 }),
      video({ publishedAt: "2025-01-06T00:00:00Z", viewCount: 50 }),
      video({ publishedAt: "2025-01-07T00:00:00Z", viewCount: 300 }),
      video({ publishedAt: "2025-01-07T10:00:00Z", viewCount: 100 }), // Tuesday again
    ]);
    expect(stats.bestDay).toBe("Tuesday");
  });

  it("picks bestDay in the caller's timezone when provided", () => {
    // 2025-01-06T02:00:00Z is Monday 02:00 UTC but Sunday 21:00 America/New_York.
    // In UTC the best day should be Monday; in New York it should be Sunday.
    const videos = [
      video({ publishedAt: "2025-01-06T02:00:00Z", viewCount: 1000 }),
    ];
    expect(calculateStats(videos).bestDay).toBe("Monday");
    expect(calculateStats(videos, "America/New_York").bestDay).toBe("Sunday");
  });

  it("reports recent cadence even when older uploads widen the raw sample", () => {
    // Scenario mirrors @LearnwithManoj: 30 daily uploads in the last month,
    // plus 20 older uploads spread across ~4 years. The lifetime formula
    // used to crush the number to ~0.2/week; the windowed formula should
    // report ~7/week because the last 90 days are all daily posts.
    const daily: YouTubeVideo[] = [];
    const anchor = Date.UTC(2025, 5, 30); // 2025-06-30 UTC
    for (let i = 0; i < 30; i++) {
      daily.push(
        video({
          publishedAt: new Date(anchor - i * 24 * 60 * 60 * 1000).toISOString(),
        })
      );
    }
    const older: YouTubeVideo[] = [];
    for (let i = 0; i < 20; i++) {
      // Spread 20 videos evenly across 4 years ending 6 months before the
      // daily run began. All pre-cutoff, so the 90-day window must ignore
      // them — otherwise the cadence collapses again.
      const offsetDays = 180 + i * 70;
      older.push(
        video({
          publishedAt: new Date(anchor - offsetDays * 24 * 60 * 60 * 1000).toISOString(),
        })
      );
    }
    const stats = calculateStats([...daily, ...older]);
    // 30 uploads in 29 days → (30 − 1) / 29 × 7 = 7.0/week exactly.
    expect(stats.uploadFrequencyPerWeek).toBeCloseTo(7, 5);
  });

  it("ignores uploads published before the recent-cadence cutoff", () => {
    // A single pre-cutoff straggler and two in-window uploads.
    const newest = Date.UTC(2025, 0, 15);
    const stats = calculateStats([
      video({ publishedAt: new Date(newest).toISOString() }),
      video({
        publishedAt: new Date(newest - 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      video({
        publishedAt: new Date(
          newest - (RECENT_CADENCE_WINDOW_DAYS + 30) * 24 * 60 * 60 * 1000
        ).toISOString(),
      }),
    ]);
    // 2 in-window uploads, 7 days apart → 1.0/week. The straggler must not
    // count, otherwise spanDays inflates and cadence drops.
    expect(stats.uploadFrequencyPerWeek).toBeCloseTo(1, 5);
  });

  it("falls back to the last N uploads when the recent window is sparse", () => {
    // A channel that posted 5 times 2 years ago and then went silent. The
    // recent window is empty, so the fallback kicks in — we want a signal
    // ("you used to post ~1/week") rather than a confusing 0.
    const anchor = Date.UTC(2023, 0, 1);
    const stats = calculateStats([
      video({ publishedAt: new Date(anchor).toISOString() }),
      video({
        publishedAt: new Date(anchor + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      video({
        publishedAt: new Date(anchor + 14 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ]);
    // Fallback uses all 3 (< FALLBACK_SAMPLE), 14-day span → 2/14 × 7 = 1.
    expect(stats.uploadFrequencyPerWeek).toBeCloseTo(1, 5);
  });

  it("caps the sparse fallback at RECENT_CADENCE_FALLBACK_SAMPLE uploads", () => {
    // 14 pre-cutoff weekly uploads (all > 90d before newest) + 1 fresh
    // upload. `recent` has length 1 → fallback fires. With the cap, only
    // the most recent 10 of the 15 total are used (spanDays = 126);
    // without the cap, all 15 would be used (spanDays = 182) and the
    // result would be ≈ 0.538/week instead of the pinned 0.5.
    expect(RECENT_CADENCE_FALLBACK_SAMPLE).toBe(10);
    const newest = Date.UTC(2025, 0, 1);
    const samples: YouTubeVideo[] = [];
    for (let k = 26; k >= 13; k--) {
      samples.push(
        video({
          publishedAt: new Date(newest - k * 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
      );
    }
    samples.push(video({ publishedAt: new Date(newest).toISOString() }));
    const stats = calculateStats(samples);
    // Capped slice: last 10 dates span 147 days → (10 − 1) / 147 × 7 = 9/21 = 3/7 ≈ 0.4286.
    // Without the cap, all 15 entries span 182 days → 14/182 × 7 ≈ 0.5385, which
    // is enough separation to prove the cap actually fired.
    expect(stats.uploadFrequencyPerWeek).toBeCloseTo(3 / 7, 5);
  });
});
