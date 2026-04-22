import { describe, expect, it } from "vitest";
import {
  extractDebugInfo,
  extractResponseText,
  GEMINI_MODEL,
  getGeminiClient,
} from "@/lib/gemini";

describe("getGeminiClient", () => {
  it("throws when the key is empty or whitespace", () => {
    expect(() => getGeminiClient("")).toThrow(/gemini api key is required/i);
    expect(() => getGeminiClient("   ")).toThrow(/gemini api key is required/i);
  });

  it("returns an instance when a key is provided", () => {
    const client = getGeminiClient("AIzaFakeKeyForTests");
    expect(client).toBeTruthy();
    expect(client.models).toBeTruthy();
  });

  it("exposes the model name constant", () => {
    expect(GEMINI_MODEL).toMatch(/^gemini-/);
  });
});

describe("extractResponseText", () => {
  it("prefers response.text when present", () => {
    const text = extractResponseText({ text: "  hello  " } as never);
    expect(text).toBe("hello");
  });

  it("falls back to concatenated candidate parts when response.text is empty", () => {
    const text = extractResponseText({
      text: "",
      candidates: [
        {
          content: {
            parts: [{ text: "foo" }, { text: "bar" }, {}],
          },
        },
      ],
    } as never);
    expect(text).toBe("foobar");
  });

  it("returns empty string when there is no text anywhere", () => {
    expect(extractResponseText({} as never)).toBe("");
    expect(
      extractResponseText({ candidates: [{ content: { parts: [] } }] } as never)
    ).toBe("");
  });
});

describe("extractDebugInfo", () => {
  it("pulls finishReason, safetyRatings, and promptFeedback from the response", () => {
    const info = extractDebugInfo({
      candidates: [
        {
          finishReason: "STOP",
          safetyRatings: [{ category: "SAFE" }],
        },
      ],
      promptFeedback: { blockReason: "" },
    } as never);

    expect(info.finishReason).toBe("STOP");
    expect(info.safetyRatings).toEqual([{ category: "SAFE" }]);
    expect(info.promptFeedback).toEqual({ blockReason: "" });
  });

  it("returns undefined fields when candidates are missing", () => {
    const info = extractDebugInfo({} as never);
    expect(info.finishReason).toBeUndefined();
    expect(info.safetyRatings).toBeUndefined();
    expect(info.promptFeedback).toBeUndefined();
  });
});
