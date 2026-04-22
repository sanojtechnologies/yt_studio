import { describe, expect, it } from "vitest";
import {
  appendEntry,
  buildSnapshot,
  DashboardHistory,
  formatRelativeAge,
  HISTORY_CAP,
  HISTORY_DEDUPE_WINDOW_MS,
  HISTORY_SCHEMA_VERSION,
  isHistory,
  isSnapshot,
  isSnapshotFresh,
  latestEntry,
  migrateSnapshot,
  readHistory,
  SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_TTL_MS,
  summarizeHistory,
  summarizeSnapshot,
  upsertHistory,
  videosMaterialChange,
} from "@/lib/dashboardSnapshot";
import { YouTubeChannel, YouTubeVideo } from "@/types/youtube";

const channel: YouTubeChannel = {
  id: "UC1",
  title: "Channel One",
  description: "",
  thumbnailUrl: "https://t/c.jpg",
  subscriberCount: 1234,
  viewCount: 99999,
};

function vid(
  id: string,
  viewCount: number,
  publishedAt = "2025-01-01T00:00:00Z"
): YouTubeVideo {
  return {
    id,
    title: id,
    description: "",
    publishedAt,
    duration: "PT5M",
    viewCount,
    likeCount: 0,
    commentCount: 0,
  };
}

describe("buildSnapshot", () => {
  it("stamps schemaVersion and savedAt", () => {
    const now = new Date("2026-04-21T10:00:00Z");
    const snap = buildSnapshot(channel, [vid("a", 10)], now);
    expect(snap.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(snap.savedAt).toBe(now.toISOString());
    expect(snap.channelId).toBe(channel.id);
  });

  it("defaults `now` to system time when omitted", () => {
    const before = Date.now();
    const snap = buildSnapshot(channel, []);
    const saved = Date.parse(snap.savedAt);
    expect(saved).toBeGreaterThanOrEqual(before);
    expect(saved).toBeLessThanOrEqual(Date.now());
  });
});

describe("isSnapshot", () => {
  it("rejects nullish, primitives, and arrays", () => {
    expect(isSnapshot(null)).toBe(false);
    expect(isSnapshot(undefined)).toBe(false);
    expect(isSnapshot(42)).toBe(false);
    expect(isSnapshot("nope")).toBe(false);
  });

  it("rejects records with the wrong schemaVersion", () => {
    expect(isSnapshot({ schemaVersion: 99, channelId: "x", savedAt: "x", channel: {}, videos: [] })).toBe(false);
  });

  it("rejects when required fields are missing", () => {
    expect(isSnapshot({ schemaVersion: SNAPSHOT_SCHEMA_VERSION })).toBe(false);
    expect(
      isSnapshot({
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        channelId: "x",
        savedAt: "x",
        channel: null,
        videos: [],
      })
    ).toBe(false);
    expect(
      isSnapshot({
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        channelId: "x",
        savedAt: "x",
        channel: {},
        videos: "not-an-array",
      })
    ).toBe(false);
  });

  it("accepts a freshly-built snapshot", () => {
    expect(isSnapshot(buildSnapshot(channel, []))).toBe(true);
  });
});

describe("isSnapshotFresh", () => {
  const savedAt = "2026-04-21T10:00:00Z";

  it("returns true within the TTL window", () => {
    const now = new Date(Date.parse(savedAt) + SNAPSHOT_TTL_MS - 1);
    expect(isSnapshotFresh({ savedAt }, now)).toBe(true);
  });

  it("returns false at and beyond the TTL boundary", () => {
    const at = new Date(Date.parse(savedAt) + SNAPSHOT_TTL_MS);
    const beyond = new Date(Date.parse(savedAt) + SNAPSHOT_TTL_MS + 60_000);
    expect(isSnapshotFresh({ savedAt }, at)).toBe(false);
    expect(isSnapshotFresh({ savedAt }, beyond)).toBe(false);
  });

  it("returns false when savedAt is unparseable", () => {
    expect(isSnapshotFresh({ savedAt: "garbage" })).toBe(false);
  });

  it("honours a custom TTL when provided", () => {
    const now = new Date(Date.parse(savedAt) + 2_000);
    expect(isSnapshotFresh({ savedAt }, now, 1_000)).toBe(false);
    expect(isSnapshotFresh({ savedAt }, now, 5_000)).toBe(true);
  });
});

describe("summarizeSnapshot", () => {
  it("computes counts, averages, and the newest publish date", () => {
    const snap = buildSnapshot(channel, [
      vid("a", 100, "2025-02-01T00:00:00Z"),
      vid("b", 300, "2025-03-15T00:00:00Z"),
    ], new Date("2026-04-21T10:00:00Z"));
    const summary = summarizeSnapshot(snap, new Date("2026-04-21T10:00:01Z"));
    expect(summary.videoCount).toBe(2);
    expect(summary.avgViews).toBe(200);
    expect(summary.newestVideoAt).toBe("2025-03-15T00:00:00.000Z");
    expect(summary.isFresh).toBe(true);
    expect(summary.ageMs).toBe(1_000);
  });

  it("returns zeroed averages and null newest for an empty sample", () => {
    const snap = buildSnapshot(channel, []);
    const summary = summarizeSnapshot(snap);
    expect(summary.videoCount).toBe(0);
    expect(summary.avgViews).toBe(0);
    expect(summary.newestVideoAt).toBeNull();
  });

  it("ignores videos with unparseable publishedAt when picking newest", () => {
    const snap = buildSnapshot(channel, [
      vid("a", 1, "not-a-date"),
      vid("b", 1, "2025-06-01T00:00:00Z"),
    ]);
    const summary = summarizeSnapshot(snap);
    expect(summary.newestVideoAt).toBe("2025-06-01T00:00:00.000Z");
  });

  it("ignores zero-view videos and out-of-order publish dates correctly", () => {
    // Three videos: one zero-view (exercises `viewCount || 0` falsy branch),
    // newest first then oldest (exercises `ms > max` false branch).
    const snap = buildSnapshot(channel, [
      vid("a", 0, "2025-06-01T00:00:00Z"),
      vid("b", 200, "2025-03-01T00:00:00Z"),
    ]);
    const summary = summarizeSnapshot(snap);
    expect(summary.avgViews).toBe(100);
    expect(summary.newestVideoAt).toBe("2025-06-01T00:00:00.000Z");
  });

  it("treats an unparseable savedAt as infinitely stale", () => {
    const snap = { ...buildSnapshot(channel, []), savedAt: "garbage" };
    const summary = summarizeSnapshot(snap);
    expect(summary.ageMs).toBe(Number.POSITIVE_INFINITY);
    expect(summary.isFresh).toBe(false);
  });
});

describe("isHistory", () => {
  it("rejects non-objects, wrong schemaVersion, wrong field types, empty entries", () => {
    expect(isHistory(null)).toBe(false);
    expect(isHistory(42)).toBe(false);
    expect(isHistory({ schemaVersion: 1 })).toBe(false); // wrong version
    expect(
      isHistory({
        schemaVersion: HISTORY_SCHEMA_VERSION,
        channelId: 5,
        channelTitle: "x",
        entries: [buildSnapshot(channel, [])],
      })
    ).toBe(false);
    expect(
      isHistory({
        schemaVersion: HISTORY_SCHEMA_VERSION,
        channelId: "x",
        channelTitle: 9,
        entries: [buildSnapshot(channel, [])],
      })
    ).toBe(false);
    expect(
      isHistory({
        schemaVersion: HISTORY_SCHEMA_VERSION,
        channelId: "x",
        channelTitle: "x",
        entries: "nope",
      })
    ).toBe(false);
    expect(
      isHistory({
        schemaVersion: HISTORY_SCHEMA_VERSION,
        channelId: "x",
        channelTitle: "x",
        entries: [],
      })
    ).toBe(false);
  });

  it("rejects when any entry fails isSnapshot", () => {
    expect(
      isHistory({
        schemaVersion: HISTORY_SCHEMA_VERSION,
        channelId: "x",
        channelTitle: "x",
        entries: [{ schemaVersion: 99 }],
      })
    ).toBe(false);
  });

  it("accepts a well-formed history", () => {
    const snap = buildSnapshot(channel, [vid("a", 1)]);
    expect(
      isHistory({
        schemaVersion: HISTORY_SCHEMA_VERSION,
        channelId: channel.id,
        channelTitle: channel.title,
        entries: [snap],
      })
    ).toBe(true);
  });
});

describe("migrateSnapshot", () => {
  it("wraps a v1 snapshot in a single-entry v2 history", () => {
    const snap = buildSnapshot(channel, [vid("a", 100)]);
    const history = migrateSnapshot(snap);
    expect(history.schemaVersion).toBe(HISTORY_SCHEMA_VERSION);
    expect(history.channelId).toBe(channel.id);
    expect(history.channelTitle).toBe(channel.title);
    expect(history.entries).toEqual([snap]);
  });
});

describe("readHistory", () => {
  it("returns a valid history as-is", () => {
    const snap = buildSnapshot(channel, [vid("a", 1)]);
    const history: DashboardHistory = {
      schemaVersion: HISTORY_SCHEMA_VERSION,
      channelId: channel.id,
      channelTitle: channel.title,
      entries: [snap],
    };
    expect(readHistory(history)).toBe(history);
  });

  it("auto-migrates a v1 snapshot", () => {
    const snap = buildSnapshot(channel, [vid("a", 1)]);
    const history = readHistory(snap);
    expect(history?.schemaVersion).toBe(HISTORY_SCHEMA_VERSION);
    expect(history?.entries[0]).toBe(snap);
  });

  it("returns null when the value is neither", () => {
    expect(readHistory({ foo: "bar" })).toBeNull();
    expect(readHistory(null)).toBeNull();
  });
});

describe("videosMaterialChange", () => {
  it("flags a length mismatch", () => {
    expect(videosMaterialChange([vid("a", 10)], [])).toBe(true);
  });

  it("flags a missing id", () => {
    expect(
      videosMaterialChange([vid("a", 10)], [vid("b", 10)])
    ).toBe(true);
  });

  it("flags a view count delta", () => {
    expect(
      videosMaterialChange([vid("a", 10)], [vid("a", 20)])
    ).toBe(true);
  });

  it("returns false when ids and view counts match", () => {
    expect(
      videosMaterialChange(
        [vid("a", 10), vid("b", 20)],
        [vid("b", 20), vid("a", 10)] // reorder fine
      )
    ).toBe(false);
  });
});

describe("appendEntry", () => {
  const savedT0 = "2026-04-21T10:00:00Z";

  function makeHistory(...entries: { savedAt: string; videos: YouTubeVideo[] }[]): DashboardHistory {
    return {
      schemaVersion: HISTORY_SCHEMA_VERSION,
      channelId: channel.id,
      channelTitle: channel.title,
      entries: entries.map((e) => buildSnapshot(channel, e.videos, new Date(e.savedAt))),
    };
  }

  it("appends when the dedupe window has elapsed", () => {
    const history = makeHistory({ savedAt: savedT0, videos: [vid("a", 1)] });
    const next = buildSnapshot(
      channel,
      [vid("a", 1)],
      new Date(Date.parse(savedT0) + HISTORY_DEDUPE_WINDOW_MS + 1)
    );
    const out = appendEntry(history, next);
    expect(out.entries).toHaveLength(2);
    expect(latestEntry(out)).toBe(next);
  });

  it("appends when videos materially changed even inside the window", () => {
    const history = makeHistory({ savedAt: savedT0, videos: [vid("a", 1)] });
    const next = buildSnapshot(
      channel,
      [vid("a", 99)], // view count changed
      new Date(Date.parse(savedT0) + 1000)
    );
    expect(appendEntry(history, next).entries).toHaveLength(2);
  });

  it("skips the append inside the window when videos are unchanged", () => {
    const history = makeHistory({ savedAt: savedT0, videos: [vid("a", 1)] });
    const next = buildSnapshot(
      channel,
      [vid("a", 1)],
      new Date(Date.parse(savedT0) + 1000)
    );
    const out = appendEntry(history, next);
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]).toBe(history.entries[0]);
  });

  it("still refreshes the channelTitle when a duplicate is skipped", () => {
    const history = makeHistory({ savedAt: savedT0, videos: [vid("a", 1)] });
    const renamed: YouTubeChannel = { ...channel, title: "New Brand" };
    const next = buildSnapshot(
      renamed,
      [vid("a", 1)],
      new Date(Date.parse(savedT0) + 1000)
    );
    expect(appendEntry(history, next).channelTitle).toBe("New Brand");
  });

  it("appends when savedAt is unparseable (window check falls through)", () => {
    const history = makeHistory({ savedAt: savedT0, videos: [vid("a", 1)] });
    const next: ReturnType<typeof buildSnapshot> = {
      ...buildSnapshot(channel, [vid("a", 1)]),
      savedAt: "not-a-date",
    };
    expect(appendEntry(history, next).entries).toHaveLength(2);
  });

  it("appends when the incoming savedAt is older than the newest entry", () => {
    const history = makeHistory({ savedAt: savedT0, videos: [vid("a", 1)] });
    const older = buildSnapshot(
      channel,
      [vid("a", 1)],
      new Date(Date.parse(savedT0) - 60 * 1000)
    );
    // deltaMs < 0 falls out of `withinWindow`, forcing an append.
    expect(appendEntry(history, older).entries).toHaveLength(2);
  });

  it("honours a custom dedupeWindowMs override", () => {
    const history = makeHistory({ savedAt: savedT0, videos: [vid("a", 1)] });
    const next = buildSnapshot(
      channel,
      [vid("a", 1)],
      new Date(Date.parse(savedT0) + 1_000)
    );
    // Shrink the window so the 1s delta no longer qualifies as a dupe.
    expect(appendEntry(history, next, { dedupeWindowMs: 500 }).entries).toHaveLength(2);
  });

  it("prunes oldest entries when the cap is exceeded", () => {
    const baseMs = Date.parse(savedT0);
    const fresh: { savedAt: string; videos: YouTubeVideo[] }[] = [];
    for (let i = 0; i < 3; i++) {
      fresh.push({
        savedAt: new Date(baseMs + i * HISTORY_DEDUPE_WINDOW_MS * 2).toISOString(),
        videos: [vid("a", i)],
      });
    }
    const history = makeHistory(...fresh);
    const next = buildSnapshot(
      channel,
      [vid("a", 99)],
      new Date(baseMs + 3 * HISTORY_DEDUPE_WINDOW_MS * 2)
    );
    const out = appendEntry(history, next, { cap: 2 });
    expect(out.entries).toHaveLength(2);
    // Oldest (i=0, i=1) trimmed; i=2 and new kept.
    expect(out.entries[0].videos[0].viewCount).toBe(2);
    expect(out.entries[1]).toBe(next);
  });

  it("defaults cap to HISTORY_CAP", () => {
    // Seed HISTORY_CAP entries, append once more, assert we're still capped.
    const baseMs = Date.parse(savedT0);
    const spacing = HISTORY_DEDUPE_WINDOW_MS * 2;
    const seedEntries = Array.from({ length: HISTORY_CAP }).map((_, i) => ({
      savedAt: new Date(baseMs + i * spacing).toISOString(),
      videos: [vid("a", i)],
    }));
    const history = makeHistory(...seedEntries);
    const next = buildSnapshot(
      channel,
      [vid("a", HISTORY_CAP + 1)],
      new Date(baseMs + HISTORY_CAP * spacing)
    );
    expect(appendEntry(history, next).entries).toHaveLength(HISTORY_CAP);
  });
});

describe("upsertHistory", () => {
  it("creates a fresh single-entry history when none exists", () => {
    const snap = buildSnapshot(channel, [vid("a", 1)]);
    const out = upsertHistory(null, snap);
    expect(out.schemaVersion).toBe(HISTORY_SCHEMA_VERSION);
    expect(out.entries).toEqual([snap]);
    expect(out.channelTitle).toBe(channel.title);
  });

  it("delegates to appendEntry when one already exists", () => {
    const now = new Date("2026-04-21T10:00:00Z");
    const existing: DashboardHistory = {
      schemaVersion: HISTORY_SCHEMA_VERSION,
      channelId: channel.id,
      channelTitle: channel.title,
      entries: [buildSnapshot(channel, [vid("a", 1)], now)],
    };
    const next = buildSnapshot(
      channel,
      [vid("a", 1), vid("b", 2)],
      new Date(now.getTime() + HISTORY_DEDUPE_WINDOW_MS + 1)
    );
    expect(upsertHistory(existing, next).entries).toHaveLength(2);
  });
});

describe("latestEntry", () => {
  it("returns the last entry in the history", () => {
    const first = buildSnapshot(channel, [vid("a", 1)], new Date("2026-04-01T00:00:00Z"));
    const second = buildSnapshot(channel, [vid("a", 2)], new Date("2026-04-02T00:00:00Z"));
    expect(latestEntry({
      schemaVersion: HISTORY_SCHEMA_VERSION,
      channelId: channel.id,
      channelTitle: channel.title,
      entries: [first, second],
    })).toBe(second);
  });
});

describe("summarizeHistory", () => {
  it("summarises the latest entry", () => {
    const older = buildSnapshot(channel, [vid("a", 100)], new Date("2026-04-01T00:00:00Z"));
    const newer = buildSnapshot(channel, [vid("a", 500)], new Date("2026-04-20T00:00:00Z"));
    const summary = summarizeHistory(
      {
        schemaVersion: HISTORY_SCHEMA_VERSION,
        channelId: channel.id,
        channelTitle: channel.title,
        entries: [older, newer],
      },
      new Date("2026-04-20T00:01:00Z")
    );
    expect(summary.avgViews).toBe(500);
    expect(summary.savedAt).toBe(newer.savedAt);
  });
});

describe("formatRelativeAge", () => {
  it("handles every threshold band", () => {
    expect(formatRelativeAge(5_000)).toBe("just now");
    expect(formatRelativeAge(5 * 60_000)).toBe("5m ago");
    expect(formatRelativeAge(2 * 60 * 60_000)).toBe("2h ago");
    expect(formatRelativeAge(3 * 24 * 60 * 60_000)).toBe("3d ago");
    expect(formatRelativeAge(45 * 24 * 60 * 60_000)).toBe("1mo ago");
    expect(formatRelativeAge(800 * 24 * 60 * 60_000)).toBe("2y ago");
  });

  it("returns 'unknown' for non-finite or negative ages", () => {
    expect(formatRelativeAge(Number.POSITIVE_INFINITY)).toBe("unknown");
    expect(formatRelativeAge(-1)).toBe("unknown");
  });
});
