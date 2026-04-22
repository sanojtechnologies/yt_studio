import { DashboardHistory, DashboardSnapshot } from "@/lib/dashboardSnapshot";
import { calculateStats } from "@/lib/stats";

export interface GrowthPoint {
  savedAt: string;
  subCount: number;
  totalViews: number;
  avgViews: number;
  uploadsPerWeek: number;
}

/** Difference between the two most recent {@link GrowthPoint}s. */
export interface DeltaRow {
  subCountDelta: number;
  totalViewsDelta: number;
  avgViewsDelta: number;
  uploadsPerWeekDelta: number;
  /** Wall-clock ms between the two points (useful for "per day" framings). */
  spanMs: number;
}

export interface HistorySummary {
  points: GrowthPoint[];
  /** Null when fewer than two points are available. */
  latestDelta: DeltaRow | null;
}

function pointFromSnapshot(snapshot: DashboardSnapshot): GrowthPoint {
  const stats = calculateStats(snapshot.videos);
  return {
    savedAt: snapshot.savedAt,
    subCount: snapshot.channel.subscriberCount,
    totalViews: snapshot.channel.viewCount,
    avgViews: stats.avgViews,
    uploadsPerWeek: stats.uploadFrequencyPerWeek,
  };
}

/** Sort entries chronologically by `savedAt`; unparseable dates drop out. */
function sortEntriesByTime(history: DashboardHistory): DashboardSnapshot[] {
  return history.entries
    .slice()
    .filter((e) => !Number.isNaN(Date.parse(e.savedAt)))
    .sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt));
}

export function deltaRow(previous: GrowthPoint, current: GrowthPoint): DeltaRow {
  const spanMs = Math.max(Date.parse(current.savedAt) - Date.parse(previous.savedAt), 0);
  return {
    subCountDelta: current.subCount - previous.subCount,
    totalViewsDelta: current.totalViews - previous.totalViews,
    avgViewsDelta: current.avgViews - previous.avgViews,
    uploadsPerWeekDelta: current.uploadsPerWeek - previous.uploadsPerWeek,
    spanMs,
  };
}

/**
 * Project a {@link DashboardHistory} into a chronologically-ordered series of
 * {@link GrowthPoint}s plus a diff of the two most recent points. Pure:
 * deterministic given the input history.
 */
export function summarizeHistory(history: DashboardHistory): HistorySummary {
  const chronological = sortEntriesByTime(history);
  const points = chronological.map(pointFromSnapshot);
  const latestDelta =
    points.length >= 2 ? deltaRow(points[points.length - 2], points[points.length - 1]) : null;
  return { points, latestDelta };
}
