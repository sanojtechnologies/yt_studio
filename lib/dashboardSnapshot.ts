import { YouTubeChannel, YouTubeVideo } from "@/types/youtube";

export const SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * Stored wrapper schema for a channel's dashboard history.
 * Bumped from 1 -> 2 in Phase 4 when we switched from "one snapshot per channel"
 * to "append-only series of snapshots per channel". Older records that still
 * look like a bare `DashboardSnapshot` are auto-migrated by {@link readHistory}.
 */
export const HISTORY_SCHEMA_VERSION = 2;

/** Snapshots older than this are considered stale and the UI should refetch. */
export const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

/** Hard cap on retained entries per channel; oldest pruned first. */
export const HISTORY_CAP = 30;

/**
 * Window during which two snapshots with identical video state are treated as
 * duplicates (e.g. page refresh). 5 minutes is long enough to collapse
 * refresh-mashing but short enough to still catch real re-renders triggered
 * by a fresh tab visit.
 */
export const HISTORY_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

export interface DashboardSnapshot {
  schemaVersion: number;
  channelId: string;
  savedAt: string; // ISO-8601 UTC
  channel: YouTubeChannel;
  videos: YouTubeVideo[];
}

/**
 * IndexedDB wrapper that holds one channel's ordered snapshot series.
 * `entries` is append-ordered (oldest first); consumers that need strict
 * chronological ordering should sort by `savedAt`.
 */
export interface DashboardHistory {
  schemaVersion: typeof HISTORY_SCHEMA_VERSION;
  channelId: string;
  channelTitle: string;
  entries: DashboardSnapshot[];
}

export interface SnapshotSummary {
  channelId: string;
  channelTitle: string;
  videoCount: number;
  avgViews: number;
  /** Most recent `publishedAt` across the snapshot (or `null` if none parseable). */
  newestVideoAt: string | null;
  savedAt: string;
  isFresh: boolean;
  ageMs: number;
}

/**
 * Build a snapshot suitable for IndexedDB storage. Pure: no Date.now()
 * baked in — caller passes `now` so tests stay deterministic.
 */
export function buildSnapshot(
  channel: YouTubeChannel,
  videos: YouTubeVideo[],
  now: Date = new Date()
): DashboardSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    channelId: channel.id,
    savedAt: now.toISOString(),
    channel,
    videos,
  };
}

/**
 * Validate a parsed object before trusting it as a snapshot. Snapshots are
 * persisted on the client so the schema can drift across versions; treat any
 * mismatch as a cache miss rather than throwing.
 */
export function isSnapshot(value: unknown): value is DashboardSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DashboardSnapshot>;
  return (
    candidate.schemaVersion === SNAPSHOT_SCHEMA_VERSION &&
    typeof candidate.channelId === "string" &&
    typeof candidate.savedAt === "string" &&
    !!candidate.channel &&
    Array.isArray(candidate.videos)
  );
}

/** Validate a persisted history wrapper. Requires at least one entry. */
export function isHistory(value: unknown): value is DashboardHistory {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DashboardHistory>;
  if (candidate.schemaVersion !== HISTORY_SCHEMA_VERSION) return false;
  if (typeof candidate.channelId !== "string") return false;
  if (typeof candidate.channelTitle !== "string") return false;
  if (!Array.isArray(candidate.entries) || candidate.entries.length === 0) return false;
  return candidate.entries.every(isSnapshot);
}

/** Wrap a legacy v1 snapshot into a v2 history with a single entry. */
export function migrateSnapshot(snap: DashboardSnapshot): DashboardHistory {
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    channelId: snap.channelId,
    channelTitle: snap.channel.title,
    entries: [snap],
  };
}

/**
 * Coerce an unknown IndexedDB value into a {@link DashboardHistory}. Accepts:
 *   - a valid v2 history (returned as-is)
 *   - a valid v1 snapshot (auto-migrated)
 * Everything else returns `null` so callers treat it as a cache miss.
 */
export function readHistory(value: unknown): DashboardHistory | null {
  if (isHistory(value)) return value;
  if (isSnapshot(value)) return migrateSnapshot(value);
  return null;
}

/**
 * Cheap shape comparison used by {@link appendEntry} to skip no-op
 * snapshots. Returns `true` when the video list is materially different
 * (new id, missing id, different view count) between `prev` and `next`.
 */
export function videosMaterialChange(
  prev: YouTubeVideo[],
  next: YouTubeVideo[]
): boolean {
  if (prev.length !== next.length) return true;
  const prevMap = new Map(prev.map((v) => [v.id, v.viewCount]));
  for (const v of next) {
    const prevViews = prevMap.get(v.id);
    if (prevViews === undefined) return true;
    if (prevViews !== v.viewCount) return true;
  }
  return false;
}

/**
 * Shape-only comparison for deciding whether two snapshots represent the same
 * video lineup. Ignores view-count drift so repeated dashboard opens on the
 * same day don't create noisy history entries.
 */
export function videosStructuralChange(
  prev: YouTubeVideo[],
  next: YouTubeVideo[]
): boolean {
  if (prev.length !== next.length) return true;
  const prevIds = new Set(prev.map((v) => v.id));
  for (const v of next) {
    if (!prevIds.has(v.id)) return true;
  }
  return false;
}

function isSameUtcDay(aIso: string, bIso: string): boolean {
  const a = new Date(aIso);
  const b = new Date(bIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Return the newest entry (last push) in a non-empty history. */
export function latestEntry(history: DashboardHistory): DashboardSnapshot {
  return history.entries[history.entries.length - 1];
}

interface AppendOptions {
  cap?: number;
  dedupeWindowMs?: number;
}

/**
 * Append `snap` to `history`, collapsing exact-duplicate refreshes that
 * land within `dedupeWindowMs` of the newest existing entry. Cap enforced
 * oldest-first. Pure: returns a new history; does not mutate the input.
 */
export function appendEntry(
  history: DashboardHistory,
  snap: DashboardSnapshot,
  opts: AppendOptions = {}
): DashboardHistory {
  const cap = opts.cap ?? HISTORY_CAP;
  const dedupeWindowMs = opts.dedupeWindowMs ?? HISTORY_DEDUPE_WINDOW_MS;

  const newest = latestEntry(history);
  const deltaMs = Date.parse(snap.savedAt) - Date.parse(newest.savedAt);
  const withinWindow =
    Number.isFinite(deltaMs) && deltaMs >= 0 && deltaMs < dedupeWindowMs;
  if (withinWindow && !videosMaterialChange(newest.videos, snap.videos)) {
    // No meaningful change; keep series unchanged but freshen the title
    // in case the creator renamed the channel between refreshes.
    return { ...history, channelTitle: snap.channel.title };
  }

  // Daily noise guard: when the channel/video lineup is unchanged on the same
  // UTC date, refresh the latest entry in place instead of appending another
  // row. This keeps "snapshots tracked" meaningful for day-level history.
  if (
    Number.isFinite(deltaMs) &&
    deltaMs >= dedupeWindowMs &&
    isSameUtcDay(newest.savedAt, snap.savedAt) &&
    !videosStructuralChange(newest.videos, snap.videos)
  ) {
    const nextEntries = [...history.entries];
    nextEntries[nextEntries.length - 1] = snap;
    return {
      ...history,
      channelTitle: snap.channel.title,
      entries: nextEntries,
    };
  }

  const nextEntries = [...history.entries, snap];
  const overflow = nextEntries.length - cap;
  const trimmed = overflow > 0 ? nextEntries.slice(overflow) : nextEntries;
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    channelId: history.channelId,
    channelTitle: snap.channel.title,
    entries: trimmed,
  };
}

/**
 * Convenience: upsert a history. Creates a fresh single-entry history
 * when `existing` is null, otherwise delegates to {@link appendEntry}.
 */
export function upsertHistory(
  existing: DashboardHistory | null,
  snap: DashboardSnapshot,
  opts?: AppendOptions
): DashboardHistory {
  if (!existing) {
    return {
      schemaVersion: HISTORY_SCHEMA_VERSION,
      channelId: snap.channelId,
      channelTitle: snap.channel.title,
      entries: [snap],
    };
  }
  return appendEntry(existing, snap, opts);
}

export function isSnapshotFresh(
  snapshot: Pick<DashboardSnapshot, "savedAt">,
  now: Date = new Date(),
  ttlMs = SNAPSHOT_TTL_MS
): boolean {
  const savedAt = Date.parse(snapshot.savedAt);
  if (Number.isNaN(savedAt)) return false;
  return now.getTime() - savedAt < ttlMs;
}

export function summarizeSnapshot(
  snapshot: DashboardSnapshot,
  now: Date = new Date()
): SnapshotSummary {
  const totalViews = snapshot.videos.reduce((sum, v) => sum + (v.viewCount || 0), 0);
  const newest = snapshot.videos
    .map((v) => Date.parse(v.publishedAt))
    .filter((ms) => !Number.isNaN(ms))
    .reduce<number | null>((max, ms) => (max === null || ms > max ? ms : max), null);
  const savedAtMs = Date.parse(snapshot.savedAt);
  const ageMs = Number.isNaN(savedAtMs) ? Number.POSITIVE_INFINITY : now.getTime() - savedAtMs;

  return {
    channelId: snapshot.channelId,
    channelTitle: snapshot.channel.title,
    videoCount: snapshot.videos.length,
    avgViews: snapshot.videos.length > 0 ? totalViews / snapshot.videos.length : 0,
    newestVideoAt: newest === null ? null : new Date(newest).toISOString(),
    savedAt: snapshot.savedAt,
    isFresh: isSnapshotFresh(snapshot, now),
    ageMs,
  };
}

/** Summarise the latest entry in a history. */
export function summarizeHistory(
  history: DashboardHistory,
  now: Date = new Date()
): SnapshotSummary {
  return summarizeSnapshot(latestEntry(history), now);
}

export function formatRelativeAge(ageMs: number, now: Date = new Date()): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "unknown";
  void now;
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}
