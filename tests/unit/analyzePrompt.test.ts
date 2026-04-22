import { describe, expect, it } from "vitest";
import {
  ANALYZE_SCHEMA,
  buildAnalyzePrompt,
  summarizeVideos,
  toDayOfWeek,
} from "@/lib/analyzePrompt";
import { YouTubeVideo } from "@/types/youtube";

describe("toDayOfWeek", () => {
  it("returns the UTC weekday name", () => {
    // 2025-01-06 is a Monday in UTC.
    expect(toDayOfWeek("2025-01-06T12:00:00Z")).toBe("Monday");
    expect(toDayOfWeek("2025-01-05T00:00:00Z")).toBe("Sunday");
  });

  it("returns Unknown for invalid dates", () => {
    expect(toDayOfWeek("")).toBe("Unknown");
    expect(toDayOfWeek("not-a-date")).toBe("Unknown");
  });
});

describe("summarizeVideos", () => {
  it("maps videos into a compact summary including the UTC day-of-week", () => {
    const video: YouTubeVideo = {
      id: "abc",
      title: "Title",
      description: "desc",
      publishedAt: "2025-01-06T00:00:00Z",
      duration: "PT10M",
      viewCount: 123,
      likeCount: 10,
      commentCount: 5,
    };
    const [summary] = summarizeVideos([video]);
    expect(summary).toEqual({
      title: "Title",
      views: 123,
      likes: 10,
      comments: 5,
      duration: "PT10M",
      publishedAt: "2025-01-06T00:00:00Z",
      dayOfWeek: "Monday",
    });
  });

  it("returns an empty list for no input", () => {
    expect(summarizeVideos([])).toEqual([]);
  });
});

describe("buildAnalyzePrompt", () => {
  it("includes the channelId and the JSON-encoded summary", () => {
    const prompt = buildAnalyzePrompt("UC123", [
      {
        title: "T",
        views: 1,
        likes: 0,
        comments: 0,
        duration: "PT1M",
        publishedAt: "2025-01-06T00:00:00Z",
        dayOfWeek: "Monday",
      },
    ]);
    expect(prompt).toContain("Channel ID: UC123");
    expect(prompt).toContain('"title":"T"');
    expect(prompt).toContain("Return this exact JSON shape:");
  });
});

describe("ANALYZE_SCHEMA", () => {
  it("declares all four required top-level properties", () => {
    expect(ANALYZE_SCHEMA.required).toEqual([
      "topPatternsThatWork",
      "topUnderperformingPatterns",
      "contentGapSuggestions",
      "optimalPostingSchedule",
    ]);
    expect(Object.keys(ANALYZE_SCHEMA.properties)).toContain("optimalPostingSchedule");
  });
});
