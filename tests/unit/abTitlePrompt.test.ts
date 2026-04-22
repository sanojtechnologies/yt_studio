import { describe, expect, it } from "vitest";
import {
  AB_TITLE_LIMITS,
  AB_TITLE_SCHEMA,
  buildAbTitlePrompt,
} from "@/lib/abTitlePrompt";

describe("buildAbTitlePrompt", () => {
  it("includes both titles and omits empty optional fields", () => {
    const prompt = buildAbTitlePrompt({ titleA: "first option", titleB: "second option" });
    expect(prompt).toContain("Title A: first option");
    expect(prompt).toContain("Title B: second option");
    expect(prompt).not.toContain("Audience:");
    expect(prompt).not.toContain("Channel context:");
  });

  it("adds audience and channelContext when supplied", () => {
    const prompt = buildAbTitlePrompt({
      titleA: "a",
      titleB: "b",
      audience: "indies",
      channelContext: "calm",
    });
    expect(prompt).toContain("Audience: indies");
    expect(prompt).toContain("Channel context: calm");
  });
});

describe("AB_TITLE_SCHEMA + LIMITS", () => {
  it("has winnerIndex, axes, reasons as required", () => {
    expect(AB_TITLE_SCHEMA.required).toEqual(["winnerIndex", "axes", "reasons"]);
  });

  it("exposes positive, sensible limits", () => {
    expect(AB_TITLE_LIMITS.maxTitleLength).toBeGreaterThan(0);
    expect(AB_TITLE_LIMITS.maxAudienceLength).toBeGreaterThan(0);
    expect(AB_TITLE_LIMITS.maxChannelContextLength).toBeGreaterThan(0);
  });
});
