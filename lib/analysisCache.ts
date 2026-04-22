/**
 * Generic localStorage-backed cache for per-video AI analyses (thumbnail,
 * metadata, future panels). Each concrete cache supplies its own key prefix,
 * TTL, and shape validator; the factory produces a uniform
 * `{ key, read, write, clear }` surface so panel components don't care which
 * analysis kind they're dealing with.
 *
 * Reads are defensive — malformed JSON, wrong shape, unparseable `savedAt`,
 * and expired rows are reported as misses *and* removed from storage so
 * quota isn't wasted on dead entries. Writes are best-effort — quota /
 * security errors from `setItem` are swallowed, and the call site can fall
 * back to in-memory state for the current session.
 */

export interface AnalysisCacheEntry<T> {
  analysis: T;
  /** ISO-8601 UTC timestamp of when the entry was written. */
  savedAt: string;
}

/**
 * Minimal `localStorage`-shaped interface. Kept narrow so tests can inject
 * an in-memory stub without pulling in DOM typings and so callers in
 * non-browser contexts can pass `null` / `undefined` without awkward guards.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AnalysisCache<T> {
  /** Build the storage key for a given videoId. */
  key(videoId: string): string;
  /** Returns `null` for missing / stale / malformed entries. */
  read(
    storage: KeyValueStorage | null | undefined,
    videoId: string,
    now?: Date
  ): AnalysisCacheEntry<T> | null;
  /** Best-effort persist. Returns the written entry, or `null` on failure. */
  write(
    storage: KeyValueStorage | null | undefined,
    videoId: string,
    analysis: T,
    now?: Date
  ): AnalysisCacheEntry<T> | null;
  /** Best-effort delete; no-op when storage is unavailable. */
  clear(storage: KeyValueStorage | null | undefined, videoId: string): void;
}

export interface AnalysisCacheOptions<T> {
  /** Storage key prefix, e.g. `"ytstudio:thumb:"`. Namespace collisions are the caller's responsibility. */
  prefix: string;
  /** Entries older than this are treated as misses. */
  ttlMs: number;
  /** Type guard run against the parsed `analysis` field before trusting a row. */
  isValidShape: (value: unknown) => value is T;
}

export function createAnalysisCache<T>(
  options: AnalysisCacheOptions<T>
): AnalysisCache<T> {
  const { prefix, ttlMs, isValidShape } = options;

  function key(videoId: string): string {
    return `${prefix}${videoId}`;
  }

  function read(
    storage: KeyValueStorage | null | undefined,
    videoId: string,
    now: Date = new Date()
  ): AnalysisCacheEntry<T> | null {
    if (!storage || !videoId) return null;
    const storageKey = key(videoId);

    const raw = safeGet(storage, storageKey);
    if (raw === null) return null;

    const entry = parseEntry(raw, isValidShape);
    if (!entry) {
      safeRemove(storage, storageKey);
      return null;
    }

    const savedMs = Date.parse(entry.savedAt);
    if (Number.isNaN(savedMs) || now.getTime() - savedMs > ttlMs) {
      safeRemove(storage, storageKey);
      return null;
    }

    return entry;
  }

  function write(
    storage: KeyValueStorage | null | undefined,
    videoId: string,
    analysis: T,
    now: Date = new Date()
  ): AnalysisCacheEntry<T> | null {
    if (!storage || !videoId) return null;
    const entry: AnalysisCacheEntry<T> = { analysis, savedAt: now.toISOString() };
    try {
      storage.setItem(key(videoId), JSON.stringify(entry));
      return entry;
    } catch {
      // QuotaExceededError, SecurityError, etc. — degrade silently.
      return null;
    }
  }

  function clear(
    storage: KeyValueStorage | null | undefined,
    videoId: string
  ): void {
    if (!storage || !videoId) return;
    safeRemove(storage, key(videoId));
  }

  return { key, read, write, clear };
}

function safeGet(storage: KeyValueStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeRemove(storage: KeyValueStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Ignored — removal is best-effort.
  }
}

function parseEntry<T>(
  raw: string,
  isValidShape: (value: unknown) => value is T
): AnalysisCacheEntry<T> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  const savedAt = parsed.savedAt;
  const analysis = parsed.analysis;
  if (typeof savedAt !== "string" || !isValidShape(analysis)) return null;
  return { analysis, savedAt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
