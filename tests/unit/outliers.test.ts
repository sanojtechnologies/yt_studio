import { describe, expect, it } from "vitest";
import { computeOutliers, filterByOutlierKind } from "@/lib/outliers";
import { YouTubeVideo } from "@/types/youtube";

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

describe("computeOutliers", () => {
  it("returns an empty report for an empty input", () => {
    const report = computeOutliers([]);
    expect(report.annotations.size).toBe(0);
    expect(report.stats).toEqual({ median: 0, mad: 0, threshold: 1.5 });
  });

  it("flags the lone overperformer in a roughly-flat distribution", () => {
    const videos = [
      video("a", 100),
      video("b", 110),
      video("c", 90),
      video("d", 120),
      video("e", 95),
      video("f", 5000), // viral
    ];
    const report = computeOutliers(videos);
    expect(report.annotations.get("f")?.kind).toBe("over");
    for (const id of ["a", "b", "c", "d", "e"]) {
      expect(report.annotations.get(id)?.kind).toBe("normal");
    }
  });

  it("flags an underperformer when below the lower threshold", () => {
    const videos = [
      video("a", 100),
      video("b", 105),
      video("c", 95),
      video("d", 102),
      video("e", 1), // dud
    ];
    const report = computeOutliers(videos);
    expect(report.annotations.get("e")?.kind).toBe("under");
  });

  it("treats a constant distribution (MAD = 0) as all-normal with zero scores", () => {
    const videos = [video("a", 100), video("b", 100), video("c", 100)];
    const report = computeOutliers(videos);
    expect(report.stats.mad).toBe(0);
    for (const id of ["a", "b", "c"]) {
      const annotation = report.annotations.get(id);
      expect(annotation?.kind).toBe("normal");
      expect(annotation?.score).toBe(0);
    }
  });

  it("computes median across an even-length sample as the average of the two middle values", () => {
    const report = computeOutliers([video("a", 10), video("b", 20)]);
    expect(report.stats.median).toBe(15);
  });

  it("respects a custom threshold", () => {
    const videos = [video("a", 100), video("b", 110), video("c", 90), video("d", 200)];
    const lenient = computeOutliers(videos, 10);
    expect(lenient.annotations.get("d")?.kind).toBe("normal");
    const strict = computeOutliers(videos, 0.5);
    expect(strict.annotations.get("d")?.kind).toBe("over");
  });
});

describe("filterByOutlierKind", () => {
  const videos = [
    video("a", 100),
    video("b", 110),
    video("c", 90),
    video("d", 5000),
    video("e", 1),
  ];
  const report = computeOutliers(videos);

  it("returns the input unchanged when no kinds are requested", () => {
    expect(filterByOutlierKind(videos, report, [])).toBe(videos);
  });

  it("returns only videos matching the requested kinds", () => {
    const overOnly = filterByOutlierKind(videos, report, ["over"]);
    expect(overOnly.map((v) => v.id)).toEqual(["d"]);
    const extremes = filterByOutlierKind(videos, report, ["over", "under"]);
    expect(extremes.map((v) => v.id).sort()).toEqual(["d", "e"]);
  });

  it("excludes videos missing from the report", () => {
    const stranger = video("z", 999);
    const filtered = filterByOutlierKind([...videos, stranger], report, ["over", "under", "normal"]);
    expect(filtered.find((v) => v.id === "z")).toBeUndefined();
  });
});
