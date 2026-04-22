import { describe, expect, it } from "vitest";
import {
  computeRobustStats,
  MAD_SCALE,
  median,
  robustZScore,
} from "@/lib/robustStats";

describe("median", () => {
  it("returns 0 for an empty input", () => {
    expect(median([])).toBe(0);
  });

  it("returns the middle value for an odd-length array", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages the two middle values for an even-length array", () => {
    expect(median([10, 20])).toBe(15);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("does not mutate the input array", () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe("computeRobustStats", () => {
  it("returns zero-valued stats for an empty input", () => {
    expect(computeRobustStats([])).toEqual({ median: 0, mad: 0 });
  });

  it("returns mad = 0 for a constant input", () => {
    expect(computeRobustStats([5, 5, 5])).toEqual({ median: 5, mad: 0 });
  });

  it("computes median and MAD for a varied sample", () => {
    // Values: 1, 2, 4, 7, 10. median = 4. Deviations: 3, 2, 0, 3, 6 → median = 3.
    expect(computeRobustStats([1, 2, 4, 7, 10])).toEqual({ median: 4, mad: 3 });
  });
});

describe("robustZScore", () => {
  it("returns 0 when MAD is 0 regardless of value", () => {
    expect(robustZScore(100, { median: 5, mad: 0 })).toBe(0);
    expect(robustZScore(-100, { median: 5, mad: 0 })).toBe(0);
  });

  it("scales deviation by MAD_SCALE * MAD", () => {
    const stats = { median: 10, mad: 2 };
    expect(robustZScore(10, stats)).toBe(0);
    expect(robustZScore(10 + MAD_SCALE * 2, stats)).toBeCloseTo(1, 12);
    expect(robustZScore(10 - MAD_SCALE * 2, stats)).toBeCloseTo(-1, 12);
  });
});
