/**
 * Shared robust-statistics primitives. Used by any consumer that needs an
 * outlier-resistant summary of a skewed distribution (YouTube view counts,
 * engagement rates, etc.). Pure — no I/O, no time coupling, no mutation of
 * caller-owned arrays.
 *
 * We use median + MAD (Median Absolute Deviation) rather than mean + stddev
 * because creator metrics are extremely right-skewed: one viral video or one
 * dead upload drags mean-based thresholds far enough that nothing reads as
 * anomalous. MAD is the standard robust alternative.
 */

/**
 * Scale factor that makes MAD a consistent estimator of the standard
 * deviation for normally distributed data. Applying it lets us express the
 * "how unusual is this sample" score on roughly the same scale as a z-score.
 */
export const MAD_SCALE = 1.4826;

export interface RobustStats {
  /** Median of the input. 0 for empty input. */
  median: number;
  /** Median absolute deviation from the median. 0 for empty / constant input. */
  mad: number;
}

/**
 * Median of a finite array. Returns 0 for empty input so callers can safely
 * destructure the result; they're expected to guard length upstream when that
 * distinction matters. Does not mutate `values` — sorts a copy.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Single-pass convenience wrapper: median + MAD. Empty input yields
 * `{ median: 0, mad: 0 }`; a constant input yields `{ median: k, mad: 0 }`.
 */
export function computeRobustStats(values: readonly number[]): RobustStats {
  if (values.length === 0) return { median: 0, mad: 0 };
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  return { median: med, mad: median(deviations) };
}

/**
 * Robust analogue of a z-score: `(value − median) / (MAD_SCALE × MAD)`.
 * Returns 0 when `mad === 0` (constant distribution — every sample is
 * equidistant from the median, so "how unusual" is definitionally zero) so
 * callers can apply a single-branch threshold.
 */
export function robustZScore(value: number, stats: RobustStats): number {
  if (stats.mad === 0) return 0;
  return (value - stats.median) / (MAD_SCALE * stats.mad);
}
