import { describe, expect, it } from "vitest";
import {
  buildVideoIdeatePrompt,
  clampIdeaCount,
  normalizeSeedKeywords,
  VIDEO_IDEATE_SCHEMA,
} from "@/lib/videoIdeatePrompt";

describe("videoIdeatePrompt", () => {
  it("clamps idea count into supported bounds", () => {
    expect(clampIdeaCount(undefined)).toBe(5);
    expect(clampIdeaCount(1)).toBe(3);
    expect(clampIdeaCount(99)).toBe(10);
    expect(clampIdeaCount(6)).toBe(6);
  });

  it("normalizes keywords by trim, dedupe, and count cap", () => {
    const out = normalizeSeedKeywords(["  AI ", "ai", "", "Graph RAG", 42] as never);
    expect(out).toEqual(["AI", "Graph RAG"]);
  });

  it("returns [] when keywords input is not an array", () => {
    expect(normalizeSeedKeywords("ai" as never)).toEqual([]);
  });

  it("caps normalized keywords to max limit", () => {
    const many = Array.from({ length: 20 }, (_, index) => `k${index}`);
    const out = normalizeSeedKeywords(many);
    expect(out).toHaveLength(8);
  });

  it("builds prompt with evidence json and requested count", () => {
    const prompt = buildVideoIdeatePrompt({
      keywords: ["ai niche"],
      ideaCount: 4,
      evidence: {
        windowDays: 30,
        sampleSize: 12,
        topPhrases: [],
        keywordPerformance: [],
        topVideos: [],
        opportunitySignals: ["signal"],
      },
    });
    expect(prompt).toContain("Return exactly 4 ideas.");
    expect(prompt).toContain("Niche seed keywords: \"ai niche\"");
    expect(prompt).toContain("\"sampleSize\":12");
  });

  it("exports a schema with required summary and ideas", () => {
    expect(VIDEO_IDEATE_SCHEMA.required).toEqual(["summary", "ideas"]);
  });
});
