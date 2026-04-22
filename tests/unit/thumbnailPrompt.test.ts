import { describe, expect, it } from "vitest";
import {
  buildThumbnailPrompt,
  isValidHttpUrl,
  SUPPORTED_IMAGE_TYPES,
  THUMBNAIL_SCHEMA,
} from "@/lib/thumbnailPrompt";

describe("isValidHttpUrl", () => {
  it("accepts http and https", () => {
    expect(isValidHttpUrl("https://i.ytimg.com/vi/abc/hqdefault.jpg")).toBe(true);
    expect(isValidHttpUrl("http://example.com/a.png")).toBe(true);
  });

  it("rejects non-http protocols and garbage", () => {
    expect(isValidHttpUrl("ftp://example.com")).toBe(false);
    expect(isValidHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isValidHttpUrl("not a url")).toBe(false);
    expect(isValidHttpUrl("")).toBe(false);
  });
});

describe("SUPPORTED_IMAGE_TYPES", () => {
  it("covers the mime types Gemini accepts for inline image data", () => {
    for (const mime of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]) {
      expect(SUPPORTED_IMAGE_TYPES.has(mime)).toBe(true);
    }
    expect(SUPPORTED_IMAGE_TYPES.has("image/gif")).toBe(false);
    expect(SUPPORTED_IMAGE_TYPES.has("text/html")).toBe(false);
  });
});

describe("buildThumbnailPrompt", () => {
  it("embeds videoId, title, and the scoring rules", () => {
    const prompt = buildThumbnailPrompt("abc123", "How I grew to 1M subs");
    expect(prompt).toContain("Video ID: abc123");
    expect(prompt).toContain("Video Title: How I grew to 1M subs");
    expect(prompt).toContain("textReadabilityScore is an integer 1-10");
    expect(prompt).toContain("improvementSuggestions must contain exactly 3");
  });
});

describe("THUMBNAIL_SCHEMA", () => {
  it("requires all five fields", () => {
    expect(THUMBNAIL_SCHEMA.required).toEqual([
      "faceEmotionDetection",
      "textReadabilityScore",
      "colorContrastAssessment",
      "titleCuriosityGapScore",
      "improvementSuggestions",
    ]);
  });
});
