import { describe, expect, it } from "vitest";
import { buildPublishHeatmap, DAY_NAMES_SHORT } from "@/lib/heatmap";
import { YouTubeVideo } from "@/types/youtube";

function video(publishedAt: string, viewCount: number, id = `v${Math.random()}`): YouTubeVideo {
  return {
    id,
    title: id,
    description: "",
    publishedAt,
    duration: "PT1M",
    viewCount,
    likeCount: 0,
    commentCount: 0,
  };
}

describe("buildPublishHeatmap", () => {
  it("returns a full 168-cell grid even when the input is empty", () => {
    const result = buildPublishHeatmap([]);
    expect(result.cells).toHaveLength(7 * 24);
    expect(result.cells.every((cell) => cell.count === 0 && cell.medianViews === 0)).toBe(true);
    expect(result.maxMedianViews).toBe(0);
    expect(result.bestCell).toBeNull();
  });

  it("buckets by UTC weekday and hour and reports counts", () => {
    // 2025-01-06 = Monday UTC. 17:00 UTC.
    const result = buildPublishHeatmap([
      video("2025-01-06T17:00:00Z", 1000),
      video("2025-01-06T17:30:00Z", 2000),
    ]);
    const cell = result.cells.find((c) => c.day === 1 && c.hour === 17);
    expect(cell?.count).toBe(2);
    // Median of [1000, 2000] = 1500.
    expect(cell?.medianViews).toBe(1500);
  });

  it("uses median (not mean) so a single viral video doesn't dominate a cell", () => {
    const result = buildPublishHeatmap([
      video("2025-01-07T10:00:00Z", 100),
      video("2025-01-07T10:00:00Z", 110),
      video("2025-01-07T10:00:00Z", 90),
      video("2025-01-07T10:00:00Z", 1_000_000), // viral
    ]);
    // 2025-01-07 = Tuesday UTC.
    const cell = result.cells.find((c) => c.day === 2 && c.hour === 10);
    // Median of [90, 100, 110, 1_000_000] = (100+110)/2 = 105 — not a million.
    expect(cell?.medianViews).toBe(105);
  });

  it("identifies the strongest cell across the grid", () => {
    const result = buildPublishHeatmap([
      video("2025-01-06T17:00:00Z", 5000), // Mon 17 UTC
      video("2025-01-08T03:00:00Z", 1000), // Wed 03 UTC
    ]);
    expect(result.bestCell).toEqual({ day: 1, hour: 17, medianViews: 5000 });
    expect(result.maxMedianViews).toBe(5000);
  });

  it("ignores videos with unparseable publishedAt", () => {
    const result = buildPublishHeatmap([
      video("not-a-date", 999_999),
      video("2025-01-06T17:00:00Z", 100),
    ]);
    expect(result.bestCell).toEqual({ day: 1, hour: 17, medianViews: 100 });
  });

  it("exports day-name labels in Sunday-first order matching getUTCDay()", () => {
    expect(DAY_NAMES_SHORT[0]).toBe("Sun");
    expect(DAY_NAMES_SHORT[6]).toBe("Sat");
    expect(DAY_NAMES_SHORT).toHaveLength(7);
  });

  it("buckets into the provided IANA timezone instead of UTC", () => {
    // 2025-01-07T02:30:00Z is Tuesday 02:30 UTC, but in America/Los_Angeles
    // that instant is still Monday 18:30 (UTC−08:00, standard time).
    const result = buildPublishHeatmap(
      [video("2025-01-07T02:30:00Z", 500)],
      "America/Los_Angeles"
    );
    const la = result.cells.find((c) => c.count > 0);
    expect(la).toEqual({ day: 1, hour: 18, count: 1, medianViews: 500 });

    // Same input, default zone — confirms the default path still lands on UTC.
    const utc = buildPublishHeatmap([video("2025-01-07T02:30:00Z", 500)]);
    const utcCell = utc.cells.find((c) => c.count > 0);
    expect(utcCell).toEqual({ day: 2, hour: 2, count: 1, medianViews: 500 });
  });
});
