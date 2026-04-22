import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatTimeZoneLabel,
  getBrowserTimeZone,
  localDayHour,
} from "@/lib/timezone";

describe("localDayHour", () => {
  it("uses UTC getters when timeZone is UTC (default)", () => {
    // 2025-01-06T17:30:00Z → Monday 17:00 UTC.
    expect(localDayHour(new Date("2025-01-06T17:30:00Z"))).toEqual({
      day: 1,
      hour: 17,
    });
  });

  it("buckets into an IANA zone via Intl.DateTimeFormat", () => {
    // Same UTC instant → Monday 18:30 in New York (UTC−05:00, EST)
    // and Tuesday 04:30 in Kolkata (UTC+05:30, half-hour offset).
    const t = new Date("2025-01-06T23:30:00Z");
    expect(localDayHour(t, "America/New_York")).toEqual({ day: 1, hour: 18 });
    expect(localDayHour(t, "Asia/Kolkata")).toEqual({ day: 2, hour: 5 });
  });

  it("clamps the '24' midnight edge case to 0 and falls back to Sun on unknown weekday", () => {
    // Force a weekday string Intl doesn't emit so the `?? 0` fallback fires.
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockReturnValue([
      { type: "weekday", value: "???" },
      { type: "literal", value: " " },
      { type: "hour", value: "24" },
    ]);
    try {
      expect(localDayHour(new Date("2025-01-06T00:00:00Z"), "Etc/UTC")).toEqual({
        day: 0,
        hour: 0,
      });
    } finally {
      spy.mockRestore();
    }
  });

  it("falls back to hour 0 and Sun when formatToParts omits both parts", () => {
    const spy = vi
      .spyOn(Intl.DateTimeFormat.prototype, "formatToParts")
      .mockReturnValue([{ type: "literal", value: "" }]);
    try {
      expect(localDayHour(new Date("2025-01-06T00:00:00Z"), "Etc/UTC")).toEqual({
        day: 0,
        hour: 0,
      });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("getBrowserTimeZone", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the resolved IANA zone when Intl is available", () => {
    const zone = getBrowserTimeZone();
    expect(typeof zone).toBe("string");
    expect(zone.length).toBeGreaterThan(0);
  });

  it("falls back to UTC when resolvedOptions throws", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(() => {
      throw new Error("no Intl here");
    });
    expect(getBrowserTimeZone()).toBe("UTC");
  });

  it("falls back to UTC when resolvedOptions returns an empty zone", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "",
    } as ReturnType<typeof Intl.DateTimeFormat.prototype.resolvedOptions>);
    expect(getBrowserTimeZone()).toBe("UTC");
  });
});

describe("formatTimeZoneLabel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a short timezone name for a known zone", () => {
    const label = formatTimeZoneLabel(new Date("2025-01-06T00:00:00Z"), "UTC");
    expect(label.length).toBeGreaterThan(0);
  });

  it("uses UTC as the default when no arguments are passed", () => {
    expect(formatTimeZoneLabel()).toBe("UTC");
  });

  it("falls back to the IANA id when Intl cannot emit a short name", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockReturnValue([
      { type: "literal", value: "" },
    ]);
    expect(formatTimeZoneLabel(new Date("2025-01-06T00:00:00Z"), "Asia/Kolkata")).toBe(
      "Asia/Kolkata"
    );
  });

  it("falls back to the IANA id when Intl throws", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(formatTimeZoneLabel(new Date(), "Asia/Kolkata")).toBe("Asia/Kolkata");
  });
});
