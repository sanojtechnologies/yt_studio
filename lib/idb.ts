/**
 * Tiny promise wrapper around the IndexedDB key-value pattern. We intentionally
 * avoid the `idb` package — the API surface we need is small enough that an
 * extra dependency isn't justified.
 *
 * NOTE: This module touches the DOM and is excluded from coverage (see
 * vitest.config.ts) for the same reason as `lib/clientApiKey.ts`.
 *
 * Storage layout (Phase 4+):
 *   store: `dashboardSnapshots` (name kept for backwards compat with the v1
 *          installs — upgrading doesn't need a DB_VERSION bump because we
 *          read-migrate legacy v1 `DashboardSnapshot` records on the fly).
 *   value: `DashboardHistory` wrapping an append-ordered series of snapshots.
 *   key  : `channelId` (keyPath).
 */

import {
  DashboardHistory,
  DashboardSnapshot,
  HISTORY_SCHEMA_VERSION,
  isSnapshotFresh,
  latestEntry,
  readHistory,
  upsertHistory,
} from "@/lib/dashboardSnapshot";

const DB_NAME = "ytstudio";
const DB_VERSION = 1;
const STORE_NAME = "dashboardSnapshots";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "channelId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      })
  );
}

export async function getDashboardHistory(
  channelId: string
): Promise<DashboardHistory | null> {
  try {
    const value = await withStore<unknown>("readonly", (store) => store.get(channelId));
    return readHistory(value);
  } catch {
    return null;
  }
}

export async function getAllDashboardHistories(): Promise<DashboardHistory[]> {
  try {
    const values = await withStore<unknown[]>("readonly", (store) => store.getAll());
    if (!Array.isArray(values)) return [];
    return values
      .map((v) => readHistory(v))
      .filter((h): h is DashboardHistory => h !== null);
  } catch {
    return [];
  }
}

/**
 * Append a snapshot to the given channel's history (creating the wrapper
 * on first write). Returns the new history so callers don't have to
 * re-read. Any storage failure is swallowed and surfaces as a returned
 * in-memory history — the UI continues to function without the cache.
 */
export async function appendSnapshotEntry(
  snapshot: DashboardSnapshot
): Promise<DashboardHistory> {
  const existing = await getDashboardHistory(snapshot.channelId);
  const next = upsertHistory(existing, snapshot);
  try {
    await withStore("readwrite", (store) => store.put(next));
  } catch {
    // Best-effort cache — a write failure (quota, private mode) shouldn't
    // leak to the dashboard UI. Callers already assume stale-tolerance.
  }
  return next;
}

export async function deleteDashboardHistory(channelId: string): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(channelId));
  } catch {
    // Best-effort: nothing to do if the transaction failed.
  }
}

/**
 * Remove histories whose latest entry is older than the snapshot TTL.
 * Individual entries inside a fresh history are kept even if some are old —
 * we need the old datapoints for growth charts.
 */
export async function pruneStaleSnapshots(now: Date = new Date()): Promise<void> {
  const all = await getAllDashboardHistories();
  const stale = all.filter((h) => {
    const latest = latestEntry(h);
    return !isSnapshotFresh(latest, now);
  });
  await Promise.all(stale.map((h) => deleteDashboardHistory(h.channelId)));
}

// ---- Re-exports for consumers that already imported the old names ---------
// Keeping these thin wrappers means any dormant caller (tests, bookmarks,
// devtools snippets) keeps working through Phase 4 without breaking.
export async function getDashboardSnapshot(
  channelId: string
): Promise<DashboardSnapshot | null> {
  const history = await getDashboardHistory(channelId);
  return history ? latestEntry(history) : null;
}

export async function getAllDashboardSnapshots(): Promise<DashboardSnapshot[]> {
  const histories = await getAllDashboardHistories();
  return histories.map(latestEntry);
}

export async function deleteDashboardSnapshot(channelId: string): Promise<void> {
  await deleteDashboardHistory(channelId);
}

export const STORAGE_SCHEMA_VERSION = HISTORY_SCHEMA_VERSION;
