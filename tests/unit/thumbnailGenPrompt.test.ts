import { describe, expect, it } from "vitest";
import {
  buildThumbnailGenPrompt,
  THUMBNAIL_GEN_LIMITS,
} from "@/lib/thumbnailGenPrompt";

describe("buildThumbnailGenPrompt", () => {
  it("includes the concept text", () => {
    const out = buildThumbnailGenPrompt({ prompt: "Indie hacker beating the algo" });
    expect(out).toContain("Concept: Indie hacker beating the algo");
    expect(out).toContain("16:9 aspect ratio");
  });

  it("threads channel style and style hint when provided", () => {
    const out = buildThumbnailGenPrompt({
      prompt: "x",
      channelStyle: "Bold reds, big faces",
      styleHint: "minimalist",
    });
    expect(out).toContain("Style hint: minimalist");
    expect(out).toContain("Bold reds, big faces");
  });

  it("omits optional lines when not supplied", () => {
    const out = buildThumbnailGenPrompt({ prompt: "x" });
    expect(out).not.toMatch(/Style hint:/);
    expect(out).not.toMatch(/Match this channel/);
  });

  it("exports the documented limits", () => {
    expect(THUMBNAIL_GEN_LIMITS.maxPromptLength).toBe(500);
    expect(THUMBNAIL_GEN_LIMITS.variantCount).toBe(3);
  });
});
