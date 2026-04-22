import { describe, expect, it } from "vitest";
import { detectBreakouts } from "@/lib/breakout";
import { YouTubeVideo } from "@/types/youtube";

function vid(id: string, views: number, title = id): YouTubeVideo {
  return {
    id,
    title,
    description: "",
    publishedAt: "2025-01-01T00:00:00Z",
    duration: "PT5M",
    viewCount: views,
    likeCount: 0,
    commentCount: 0,
    thumbnailUrl: `https://t/${id}.jpg`,
  };
}

describe("detectBreakouts", () => {
  it("returns an empty array when there are no overlapping ids", () => {
    expect(detectBreakouts([vid("a", 1000)], [vid("b", 2000)])).toEqual([]);
  });

  it("ignores videos below the minimum previous-view threshold", () => {
    const prev = [vid("a", 10), vid("b", 200)];
    const curr = [vid("a", 5000), vid("b", 250)];
    const out = detectBreakouts(prev, curr);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("b");
  });

  it("ignores zero-growth and negative-growth videos", () => {
    const prev = [vid("a", 1000), vid("b", 1000)];
    const curr = [vid("a", 1000), vid("b", 500)];
    expect(detectBreakouts(prev, curr)).toEqual([]);
  });

  it("ranks by percentage growth descending, not absolute growth", () => {
    const prev = [vid("big", 1_000_000), vid("small", 200)];
    const curr = [vid("big", 1_100_000), vid("small", 2_200)];
    const out = detectBreakouts(prev, curr);
    expect(out.map((b) => b.id)).toEqual(["small", "big"]);
    expect(Math.round(out[0].deltaPct)).toBe(1000);
  });

  it("honours the limit option", () => {
    const prev = Array.from({ length: 15 }, (_, i) => vid(`v${i}`, 1000 + i));
    const curr = prev.map((v) => ({ ...v, viewCount: v.viewCount * 2 }));
    const out = detectBreakouts(prev, curr, { limit: 3 });
    expect(out).toHaveLength(3);
  });

  it("honours a custom minPreviousViews override", () => {
    const prev = [vid("a", 50)];
    const curr = [vid("a", 500)];
    expect(detectBreakouts(prev, curr, { minPreviousViews: 10 })).toHaveLength(1);
    expect(detectBreakouts(prev, curr)).toHaveLength(0);
  });

  it("carries title + thumbnailUrl through to the result", () => {
    const prev = [vid("a", 1000, "Old title")];
    const curr = [vid("a", 2000, "New title")];
    const [entry] = detectBreakouts(prev, curr);
    expect(entry.title).toBe("New title");
    expect(entry.thumbnailUrl).toBe("https://t/a.jpg");
    expect(entry.previousViews).toBe(1000);
    expect(entry.currentViews).toBe(2000);
    expect(entry.deltaAbs).toBe(1000);
    expect(entry.deltaPct).toBeCloseTo(100);
  });
});
