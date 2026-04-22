import { describe, expect, it } from "vitest";
import {
  buildMetadataPrompt,
  isMetadataAnalysis,
  METADATA_LIMITS,
  METADATA_SCHEMA,
  normaliseTags,
  type MetadataAnalysis,
} from "@/lib/metadataPrompt";

function sampleAnalysis(overrides: Partial<MetadataAnalysis> = {}): MetadataAnalysis {
  return {
    overallScore: 7,
    titleFeedback: "Clear but a bit generic; curiosity gap is thin.",
    titleSuggestions: ["A", "B", "C"],
    descriptionFeedback: "Missing hook; timestamps would help.",
    descriptionSuggestions: ["Add a 1-line hook", "Add chapters", "Add a CTA"],
    tagsFeedback: "Reasonable coverage but missing long-tail keywords.",
    suggestedTags: ["react hooks", "useEffect", "state", "components", "next.js"],
    topRecommendations: ["Shorten the title", "Add chapters", "Add 5 more tags"],
    ...overrides,
  };
}

describe("normaliseTags", () => {
  it("returns an empty array for undefined or non-array input", () => {
    expect(normaliseTags(undefined)).toEqual([]);
    // Exercise the defensive non-array branch — TypeScript rejects this at
    // the signature, so cast through unknown.
    expect(normaliseTags("not an array" as unknown as string[])).toEqual([]);
  });

  it("trims, drops empty/non-string entries, and preserves order", () => {
    expect(
      normaliseTags([
        "  first ",
        "",
        42 as unknown as string,
        "second",
        "   ",
      ])
    ).toEqual(["first", "second"]);
  });

  it("clamps each tag to METADATA_LIMITS.maxTagLength", () => {
    const long = "x".repeat(METADATA_LIMITS.maxTagLength + 10);
    const [tag] = normaliseTags([long]);
    expect(tag.length).toBe(METADATA_LIMITS.maxTagLength);
  });

  it("stops at METADATA_LIMITS.maxTagCount", () => {
    const tags = Array.from({ length: METADATA_LIMITS.maxTagCount + 5 }, (_, i) => `tag${i}`);
    expect(normaliseTags(tags)).toHaveLength(METADATA_LIMITS.maxTagCount);
  });
});

describe("buildMetadataPrompt", () => {
  it("embeds videoId, title, description, and tag list", () => {
    const prompt = buildMetadataPrompt({
      videoId: "vid_1",
      title: "How I grew to 1M subs",
      description: "Long-form story.",
      tags: ["youtube", "growth"],
    });
    expect(prompt).toContain("Video ID: vid_1");
    expect(prompt).toContain("Title: How I grew to 1M subs");
    expect(prompt).toContain("Long-form story.");
    expect(prompt).toContain("- youtube");
    expect(prompt).toContain("- growth");
  });

  it("substitutes placeholders for empty description and empty tag list", () => {
    const prompt = buildMetadataPrompt({
      videoId: "vid_2",
      title: "t",
      description: "",
      tags: [],
    });
    expect(prompt).toContain("(no description)");
    expect(prompt).toContain("(no tags set)");
  });

  it("documents the exact-count constraints so Gemini honours them", () => {
    const prompt = buildMetadataPrompt({ videoId: "v", title: "t", description: "d", tags: [] });
    expect(prompt).toContain("exactly 3 alternative titles");
    expect(prompt).toContain("exactly 3 copy-pasteable edits");
    expect(prompt).toContain("exactly 5 additional tags");
    expect(prompt).toContain("exactly 3 prioritised action items");
  });
});

describe("METADATA_SCHEMA", () => {
  it("requires every field the panel renders", () => {
    expect(METADATA_SCHEMA.required).toEqual([
      "overallScore",
      "titleFeedback",
      "titleSuggestions",
      "descriptionFeedback",
      "descriptionSuggestions",
      "tagsFeedback",
      "suggestedTags",
      "topRecommendations",
    ]);
  });
});

describe("isMetadataAnalysis", () => {
  it("accepts a valid analysis", () => {
    expect(isMetadataAnalysis(sampleAnalysis())).toBe(true);
  });

  it.each([null, 42, "string", [1, 2, 3]])("rejects non-object roots (%s)", (value) => {
    expect(isMetadataAnalysis(value)).toBe(false);
  });

  it.each([
    ["overallScore", "7"],
    ["titleFeedback", 1],
    ["descriptionFeedback", 1],
    ["tagsFeedback", 1],
  ])("rejects when %s has wrong scalar type", (field, value) => {
    const bad = { ...sampleAnalysis(), [field]: value };
    expect(isMetadataAnalysis(bad)).toBe(false);
  });

  it.each([
    "titleSuggestions",
    "descriptionSuggestions",
    "suggestedTags",
    "topRecommendations",
  ])("rejects when %s is not a string array", (field) => {
    const bad = { ...sampleAnalysis(), [field]: "not-an-array" };
    expect(isMetadataAnalysis(bad)).toBe(false);
  });

  it("rejects a string array that contains non-strings", () => {
    const bad = { ...sampleAnalysis(), suggestedTags: ["ok", 42] };
    expect(isMetadataAnalysis(bad)).toBe(false);
  });
});
