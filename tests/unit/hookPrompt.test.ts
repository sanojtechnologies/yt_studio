import { describe, expect, it } from "vitest";
import { buildHookPrompt, HOOK_SCHEMA, isValidTimestamp } from "@/lib/hookPrompt";

describe("buildHookPrompt", () => {
  it("threads title, outline, and target length when provided", () => {
    const prompt = buildHookPrompt({
      title: "Build a SaaS in a weekend",
      outline: "Step 1: idea\nStep 2: build\nStep 3: ship",
      targetLengthMinutes: 12,
    });
    expect(prompt).toContain("Build a SaaS in a weekend");
    expect(prompt).toContain("Step 1: idea");
    expect(prompt).toContain("Target length: 12 minutes");
  });

  it("omits the target-length line when not supplied", () => {
    const prompt = buildHookPrompt({ title: "x", outline: "y" });
    expect(prompt).not.toMatch(/Target length:/);
  });
});

describe("isValidTimestamp", () => {
  it("accepts MM:SS and HH:MM:SS formats", () => {
    expect(isValidTimestamp("00:30")).toBe(true);
    expect(isValidTimestamp("12:45")).toBe(true);
    expect(isValidTimestamp("1:30:00")).toBe(true);
    expect(isValidTimestamp("01:30:00")).toBe(true);
  });

  it("rejects malformed timestamps", () => {
    expect(isValidTimestamp("foo")).toBe(false);
    expect(isValidTimestamp("12")).toBe(false);
    expect(isValidTimestamp("12:3")).toBe(false);
    expect(isValidTimestamp("")).toBe(false);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(isValidTimestamp("  01:30  ")).toBe(true);
  });
});

describe("HOOK_SCHEMA", () => {
  it("declares the four documented top-level fields", () => {
    expect(HOOK_SCHEMA.required).toEqual(["hooks", "description", "tags", "chapters"]);
  });
});
