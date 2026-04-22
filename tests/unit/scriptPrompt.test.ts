import { describe, expect, it } from "vitest";
import {
  buildScriptPrompt,
  SCRIPT_LIMITS,
  SCRIPT_SCHEMA,
  suggestedBeatCount,
} from "@/lib/scriptPrompt";

describe("suggestedBeatCount", () => {
  it("handles the expected brackets", () => {
    expect(suggestedBeatCount(1)).toBe(3);
    expect(suggestedBeatCount(3)).toBe(3);
    expect(suggestedBeatCount(5)).toBe(5);
    expect(suggestedBeatCount(10)).toBe(7);
    expect(suggestedBeatCount(20)).toBe(9);
  });

  it("returns 3 for non-finite / non-positive inputs", () => {
    expect(suggestedBeatCount(Number.NaN)).toBe(3);
    expect(suggestedBeatCount(0)).toBe(3);
    expect(suggestedBeatCount(-2)).toBe(3);
  });
});

describe("buildScriptPrompt", () => {
  it("includes required header + title and omits missing optional fields", () => {
    const prompt = buildScriptPrompt({
      title: "How to ship a SaaS",
      targetMinutes: 5,
    });
    expect(prompt).toContain("5-minute");
    expect(prompt).toContain("Title: How to ship a SaaS");
    expect(prompt).not.toContain("Primary audience:");
    expect(prompt).not.toContain("Channel context:");
    // Beat count for 5 min == 5.
    expect(prompt).toContain("5 beats");
  });

  it("includes audience and channel context when provided", () => {
    const prompt = buildScriptPrompt({
      title: "Stop over-engineering",
      targetMinutes: 12,
      audience: "senior devs",
      channelContext: "calm, evidence-led",
    });
    expect(prompt).toContain("Primary audience: senior devs");
    expect(prompt).toContain("Channel context: calm, evidence-led");
  });
});

describe("SCRIPT_SCHEMA", () => {
  it("defines all required top-level fields", () => {
    expect(SCRIPT_SCHEMA.required).toEqual([
      "coldOpen",
      "hook",
      "beats",
      "callToAction",
      "outro",
    ]);
  });
});

describe("SCRIPT_LIMITS", () => {
  it("exposes practical bounds", () => {
    expect(SCRIPT_LIMITS.maxTitleLength).toBeGreaterThan(0);
    expect(SCRIPT_LIMITS.maxTargetMinutes).toBeGreaterThan(SCRIPT_LIMITS.minTargetMinutes);
  });
});
