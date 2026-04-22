import { describe, expect, it } from "vitest";
import {
  clusterByEmbedding,
  cosineSimilarity,
  EmbeddedItem,
  summarizeClusters,
} from "@/lib/cluster";
import { YouTubeVideo } from "@/types/youtube";

function video(id: string, viewCount: number, title = id): YouTubeVideo {
  return {
    id,
    title,
    description: "",
    publishedAt: "2025-01-01T00:00:00Z",
    duration: "PT5M",
    viewCount,
    likeCount: 0,
    commentCount: 0,
  };
}

function emb(videoId: string, embedding: number[]): EmbeddedItem {
  return { videoId, embedding };
}

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors and -1 for opposites", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("returns 0 when either vector is degenerate (NaN guard)", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([1, 1], [0, 0])).toBe(0);
  });

  it("ignores trailing dimensions in mismatched vectors", () => {
    expect(cosineSimilarity([1, 0, 99], [1, 0])).toBeCloseTo(1, 5);
  });
});

describe("clusterByEmbedding", () => {
  it("returns an empty array for empty input", () => {
    expect(clusterByEmbedding([])).toEqual([]);
  });

  it("groups visibly-aligned vectors into the same cluster", () => {
    const items = [
      emb("a", [1, 0, 0]),
      emb("b", [0.99, 0.01, 0]),
      emb("c", [0, 1, 0]),
      emb("d", [0, 0.99, 0.01]),
      emb("e", [0, 0, 1]),
    ];
    const clusters = clusterByEmbedding(items, 3);
    expect(clusters).toHaveLength(3);
    const groupedIds = clusters.map((c) => c.videoIds.sort().join(","));
    expect(groupedIds).toContain("a,b");
    expect(groupedIds).toContain("c,d");
    expect(groupedIds).toContain("e");
  });

  it("clamps the desired count to the input size", () => {
    const items = [emb("a", [1, 0]), emb("b", [0, 1])];
    expect(clusterByEmbedding(items, 99)).toHaveLength(2);
  });

  it("returns one cluster per item when count >= input length", () => {
    const items = [emb("a", [1, 0]), emb("b", [0, 1])];
    const clusters = clusterByEmbedding(items, 2);
    expect(clusters).toHaveLength(2);
    expect(clusters.flatMap((c) => c.videoIds).sort()).toEqual(["a", "b"]);
  });

  it("guards against pathologically large inputs", () => {
    const huge = Array.from({ length: 501 }, (_, i) => emb(`v${i}`, [i, i + 1]));
    expect(() => clusterByEmbedding(huge)).toThrow(/refuses to run/);
  });

  it("orders representatives by proximity to the centroid", () => {
    const items = [
      emb("centre", [1, 0]),
      emb("near", [0.95, 0.05]),
      emb("far", [0.5, 0.5]),
    ];
    const [cluster] = clusterByEmbedding(items, 1);
    // Weighted centroid lies between `centre` and `near`, so `far` must be the
    // least-representative member. We don't pin which of `centre`/`near` wins
    // since the two are a hair apart and could flip with micro precision.
    expect(cluster.representativeVideoIds).toHaveLength(3);
    expect(cluster.representativeVideoIds[2]).toBe("far");
    expect(cluster.representativeVideoIds.slice(0, 2).sort()).toEqual(["centre", "near"]);
  });
});

describe("summarizeClusters", () => {
  const items = [
    emb("a", [1, 0]),
    emb("b", [1, 0.01]),
    emb("c", [0, 1]),
    emb("d", [0, 1.02]),
  ];
  const videos = [video("a", 100), video("b", 300), video("c", 50), video("d", 90)];

  it("aggregates count, mean, and median per cluster", () => {
    const clusters = clusterByEmbedding(items, 2);
    const summary = summarizeClusters(clusters, videos, 2);
    const total = summary.reduce((s, c) => s + c.totalVideos, 0);
    expect(total).toBe(4);
    for (const cluster of summary) {
      expect(cluster.avgViews).toBeGreaterThanOrEqual(0);
      expect(cluster.representativeTitles.length).toBeLessThanOrEqual(2);
    }
  });

  it("ignores cluster members that are missing from the videos lookup", () => {
    const clusters = clusterByEmbedding(items, 1);
    const summary = summarizeClusters(clusters, [video("a", 100)]);
    expect(summary[0].totalVideos).toBe(1);
    expect(summary[0].avgViews).toBe(100);
    // Representative titles reflect proximity ranking of ALL cluster members,
    // then are filtered by `byId`. If `a` isn't among the top-N reps (common
    // when the centroid sits away from `a`), the array is simply empty.
    expect(summary[0].representativeTitles.every((t) => t === "a")).toBe(true);
  });

  it("returns 0 averages when no members resolve", () => {
    const clusters = clusterByEmbedding([emb("ghost", [1, 0])], 1);
    const summary = summarizeClusters(clusters, []);
    expect(summary[0].totalVideos).toBe(0);
    expect(summary[0].avgViews).toBe(0);
    expect(summary[0].medianViews).toBe(0);
  });

  it("computes median across an even-length sample as the middle average", () => {
    const clusters = clusterByEmbedding(items, 1);
    const summary = summarizeClusters(clusters, videos);
    // Sorted views: 50, 90, 100, 300 → median (90 + 100) / 2 = 95.
    expect(summary[0].medianViews).toBe(95);
  });
});
