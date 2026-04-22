import { describe, expect, it } from "vitest";
import {
  buildTitleLabPrompt,
  pickTopPerformers,
  TITLE_LAB_LIMITS,
  TITLE_LAB_SCHEMA,
} from "@/lib/titleLabPrompt";
import { YouTubeVideo } from "@/types/youtube";

function video(id: string, title: string, viewCount: number): YouTubeVideo {
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

describe("pickTopPerformers", () => {
  it("returns the top N by viewCount, descending", () => {
    const result = pickTopPerformers(
      [video("a", "A", 100), video("b", "B", 1000), video("c", "C", 500)],
      2
    );
    expect(result.map((v) => v.title)).toEqual(["B", "C"]);
  });

  it("filters out videos with empty titles", () => {
    const result = pickTopPerformers([video("a", "", 999), video("b", "kept", 1)]);
    expect(result.map((v) => v.title)).toEqual(["kept"]);
  });

  it("returns up to the limit and never throws on an empty input", () => {
    expect(pickTopPerformers([])).toEqual([]);
  });
});

describe("buildTitleLabPrompt", () => {
  it("includes topic, performers, and the desired count instruction", () => {
    const prompt = buildTitleLabPrompt({
      topic: "How to monetize a small channel",
      topPerformers: [{ title: "Past hit", viewCount: 1000 }],
    });
    expect(prompt).toContain("How to monetize a small channel");
    expect(prompt).toContain("Past hit");
    expect(prompt).toContain(`exactly ${TITLE_LAB_LIMITS.desiredCount}`);
  });

  it("conditionally includes audience and tone lines only when present", () => {
    const minimal = buildTitleLabPrompt({ topic: "X", topPerformers: [] });
    expect(minimal).not.toMatch(/Audience:/);
    expect(minimal).not.toMatch(/Desired tone:/);

    const full = buildTitleLabPrompt({
      topic: "X",
      audience: "Indie devs",
      desiredTone: "Punchy",
      topPerformers: [],
    });
    expect(full).toContain("Audience: Indie devs");
    expect(full).toContain("Desired tone: Punchy");
  });
});

describe("TITLE_LAB_SCHEMA", () => {
  it("requires the documented top-level fields", () => {
    expect(TITLE_LAB_SCHEMA.required).toEqual(["channelStyleSummary", "candidates"]);
    expect(TITLE_LAB_SCHEMA.propertyOrdering).toEqual(["channelStyleSummary", "candidates"]);
  });
});
