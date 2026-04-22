import { describe, expect, it } from "vitest";
import { DEFAULT_STOPWORDS, extractNgrams } from "@/lib/ngrams";
import { YouTubeVideo } from "@/types/youtube";

function vid(title: string, views: number, id = title): YouTubeVideo {
  return {
    id,
    title,
    description: "",
    publishedAt: "2025-01-01T00:00:00Z",
    duration: "PT5M",
    viewCount: views,
    likeCount: 0,
    commentCount: 0,
  };
}

describe("extractNgrams", () => {
  it("returns an empty list when n is invalid", () => {
    expect(extractNgrams([vid("hello world", 10)], { n: 0 })).toEqual([]);
    expect(extractNgrams([vid("hello world", 10)], { n: Number.NaN })).toEqual([]);
  });

  it("applies default minCount and limit when not provided", () => {
    const videos = [
      vid("React tips for beginners", 1000, "a"),
      vid("React patterns", 500, "b"),
      vid("Solo term no repeats", 100, "c"),
    ];
    const result = extractNgrams(videos, { n: 1 });
    // Default minCount=2 drops the one-off "solo" phrase.
    expect(result.map((e) => e.phrase)).toContain("react");
    expect(result.map((e) => e.phrase)).not.toContain("solo");
  });

  it("extracts unigrams, drops stopwords, and ranks by weightedViews", () => {
    const videos = [
      vid("React tutorial for beginners", 1000, "a"),
      vid("Advanced React patterns", 500, "b"),
      vid("Remix is the best", 9000, "c"),
      vid("Remix data fetching", 200, "d"),
    ];
    const result = extractNgrams(videos, { n: 1, minCount: 2 });
    // "remix" and "react" both appear twice; "remix" wins on weighted views.
    expect(result[0]?.phrase).toBe("remix");
    expect(result[0]?.count).toBe(2);
    expect(result[0]?.weightedViews).toBe(9200);
    expect(result.find((e) => e.phrase === "react")?.count).toBe(2);
    // No stopwords should be present.
    for (const entry of result) {
      expect(DEFAULT_STOPWORDS.has(entry.phrase)).toBe(false);
    }
  });

  it("extracts bigrams without filtering stopwords inside the phrase", () => {
    const videos = [
      vid("How to build a React app", 1000, "a"),
      vid("How to ship a React app", 500, "b"),
    ];
    const result = extractNgrams(videos, { n: 2, minCount: 2 });
    const how = result.find((r) => r.phrase === "how to");
    expect(how).toBeDefined();
    expect(how?.count).toBe(2);
  });

  it("enforces minCount", () => {
    const videos = [vid("unique phrase here", 100, "a"), vid("another title", 100, "b")];
    expect(extractNgrams(videos, { n: 1, minCount: 2 })).toEqual([]);
    expect(extractNgrams(videos, { n: 1, minCount: 1 }).length).toBeGreaterThan(0);
  });

  it("honours the limit", () => {
    const videos = Array.from({ length: 5 }).map((_, i) =>
      vid(`shared common title number${i}`, 100 + i, `v${i}`)
    );
    const result = extractNgrams(videos, { n: 1, minCount: 2, limit: 2 });
    expect(result).toHaveLength(2);
  });

  it("accepts a custom stopwords set", () => {
    const videos = [
      vid("foo bar baz", 100, "a"),
      vid("foo bar qux", 200, "b"),
    ];
    const result = extractNgrams(videos, { n: 1, minCount: 2, stopwords: ["foo"] });
    expect(result.map((r) => r.phrase)).not.toContain("foo");
    expect(result.map((r) => r.phrase)).toContain("bar");
  });

  it("breaks ties deterministically", () => {
    const videos = [
      vid("alpha beta", 100, "a"),
      vid("alpha beta", 100, "b"),
    ];
    const result = extractNgrams(videos, { n: 1, minCount: 2 });
    expect(result.map((r) => r.phrase)).toEqual(["alpha", "beta"]);
  });

  it("counts a phrase at most once per title for weightedViews", () => {
    const videos = [vid("react react react patterns", 1_000, "a")];
    const result = extractNgrams(videos, { n: 1, minCount: 1 });
    const react = result.find((r) => r.phrase === "react");
    expect(react?.count).toBe(3);
    expect(react?.weightedViews).toBe(1_000);
  });

  it("skips titles that produce no phrases", () => {
    const videos = [vid("", 0, "a"), vid("   ", 0, "b"), vid("hello", 5, "c")];
    const result = extractNgrams(videos, { n: 2, minCount: 1 });
    expect(result).toEqual([]);
  });

  it("treats missing viewCount as zero", () => {
    const v: YouTubeVideo = {
      ...vid("rising star", 0, "a"),
      viewCount: 0,
    };
    const result = extractNgrams([v, vid("rising star", 500, "b")], {
      n: 2,
      minCount: 2,
    });
    expect(result[0]?.weightedViews).toBe(500);
  });

  it("normalises punctuation and unicode accents", () => {
    const videos = [
      vid("Café opened — again!", 50, "a"),
      vid("café owners, unite", 100, "b"),
    ];
    const result = extractNgrams(videos, { n: 1, minCount: 2 });
    expect(result.map((r) => r.phrase)).toContain("cafe");
  });
});
