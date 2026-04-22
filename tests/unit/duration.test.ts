import { describe, expect, it } from "vitest";
import {
  classifyVideoFormat,
  parseIso8601DurationSeconds,
  SHORT_MAX_SECONDS,
} from "@/lib/duration";

describe("parseIso8601DurationSeconds", () => {
  it("parses hour/minute/second combinations", () => {
    expect(parseIso8601DurationSeconds("PT45S")).toBe(45);
    expect(parseIso8601DurationSeconds("PT1M30S")).toBe(90);
    expect(parseIso8601DurationSeconds("PT1H")).toBe(3_600);
    expect(parseIso8601DurationSeconds("PT1H2M3S")).toBe(3_723);
  });

  it("parses the rare D+T cases", () => {
    expect(parseIso8601DurationSeconds("P1D")).toBe(86_400);
    expect(parseIso8601DurationSeconds("P1DT1H")).toBe(90_000);
  });

  it("accepts fractional seconds", () => {
    expect(parseIso8601DurationSeconds("PT0.5S")).toBe(0.5);
    expect(parseIso8601DurationSeconds("PT1M0.25S")).toBe(60.25);
  });

  it("returns NaN for non-string, empty, or malformed inputs", () => {
    expect(parseIso8601DurationSeconds(null)).toBeNaN();
    expect(parseIso8601DurationSeconds(undefined)).toBeNaN();
    expect(parseIso8601DurationSeconds("")).toBeNaN();
    expect(parseIso8601DurationSeconds("   ")).toBeNaN();
    expect(parseIso8601DurationSeconds("5 minutes")).toBeNaN();
    expect(parseIso8601DurationSeconds("P")).toBeNaN();
    expect(parseIso8601DurationSeconds("PT")).toBeNaN();
  });

  it("returns NaN for non-string values", () => {
    // Runtime only: cast through unknown because the API signature accepts
    // `string | null | undefined`, but external data can still arrive as e.g. a number.
    expect(parseIso8601DurationSeconds(42 as unknown as string)).toBeNaN();
  });

  it("returns NaN when the parsed total overflows to Infinity", () => {
    const huge = `PT${"9".repeat(310)}M`;
    expect(parseIso8601DurationSeconds(huge)).toBeNaN();
  });
});

describe("classifyVideoFormat", () => {
  it("matches YouTube's post-2024-10-15 Shorts rule (≤3 minutes)", () => {
    expect(SHORT_MAX_SECONDS).toBe(180);
  });

  it("classifies videos at or below the cutoff as short", () => {
    expect(classifyVideoFormat({ duration: "PT30S" })).toBe("short");
    expect(classifyVideoFormat({ duration: "PT1M" })).toBe("short");
    // Covers the ~1–3 min Shorts that the old 60 s cutoff missed — this is
    // the exact bucket creators like UCLXMi-fsdb3GaJuoVvX8mMg publish into.
    expect(classifyVideoFormat({ duration: "PT90S" })).toBe("short");
    expect(classifyVideoFormat({ duration: "PT2M30S" })).toBe("short");
    expect(classifyVideoFormat({ duration: `PT${SHORT_MAX_SECONDS}S` })).toBe("short");
  });

  it("classifies videos past the cutoff as long", () => {
    expect(classifyVideoFormat({ duration: "PT181S" })).toBe("long");
    expect(classifyVideoFormat({ duration: "PT3M1S" })).toBe("long");
    expect(classifyVideoFormat({ duration: "PT5M" })).toBe("long");
  });

  it("defaults to long when the duration is missing, zero, or unparseable", () => {
    expect(classifyVideoFormat({ duration: "" })).toBe("long");
    expect(classifyVideoFormat({ duration: "PT0S" })).toBe("long");
    expect(classifyVideoFormat({ duration: "garbage" })).toBe("long");
  });

  it("prefers the authoritative isShort flag over the duration heuristic", () => {
    // A 2-minute horizontal trailer probed as "not a Short" by
    // /shorts/{id} must be classified as long, even though its
    // duration lies in the Shorts-eligible window.
    expect(classifyVideoFormat({ duration: "PT2M", isShort: false })).toBe("long");
    // Conversely, if the probe says Short, trust it — even if the
    // video's duration is somehow outside the duration rule (e.g.
    // edge-case upload or stale cached duration).
    expect(classifyVideoFormat({ duration: "PT10M", isShort: true })).toBe("short");
  });
});
