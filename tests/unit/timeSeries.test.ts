import { describe, expect, it } from "vitest";
import {
  buildSnapshot,
  DashboardHistory,
  HISTORY_SCHEMA_VERSION,
} from "@/lib/dashboardSnapshot";
import { deltaRow, summarizeHistory } from "@/lib/timeSeries";
import { YouTubeChannel, YouTubeVideo } from "@/types/youtube";

function channel(subs: number, totalViews: number): YouTubeChannel {
  return {
    id: "UC1",
    title: "Channel",
    description: "",
    thumbnailUrl: "https://t/c.jpg",
    subscriberCount: subs,
    viewCount: totalViews,
  };
}

function vid(id: string, viewCount: number, publishedAt: string): YouTubeVideo {
  return {
    id,
    title: id,
    description: "",
    publishedAt,
    duration: "PT5M",
    viewCount,
    likeCount: 1,
    commentCount: 1,
  };
}

function history(
  entries: { savedAt: string; subs: number; totalViews: number; videos: YouTubeVideo[] }[]
): DashboardHistory {
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    channelId: "UC1",
    channelTitle: "Channel",
    entries: entries.map((e) =>
      buildSnapshot(channel(e.subs, e.totalViews), e.videos, new Date(e.savedAt))
    ),
  };
}

describe("summarizeHistory", () => {
  it("projects each snapshot into a GrowthPoint ordered chronologically", () => {
    // Feed in reverse order to verify sort-by-savedAt.
    const h = history([
      {
        savedAt: "2026-04-10T00:00:00Z",
        subs: 2000,
        totalViews: 1_000_000,
        videos: [
          vid("a", 100, "2026-04-01T00:00:00Z"),
          vid("b", 200, "2026-04-08T00:00:00Z"),
        ],
      },
      {
        savedAt: "2026-04-01T00:00:00Z",
        subs: 1000,
        totalViews: 500_000,
        videos: [vid("a", 50, "2026-03-25T00:00:00Z"), vid("b", 150, "2026-04-01T00:00:00Z")],
      },
    ]);

    const summary = summarizeHistory(h);
    expect(summary.points).toHaveLength(2);
    expect(summary.points[0].savedAt).toBe("2026-04-01T00:00:00.000Z");
    expect(summary.points[1].savedAt).toBe("2026-04-10T00:00:00.000Z");
    expect(summary.points[0].subCount).toBe(1000);
    expect(summary.points[1].subCount).toBe(2000);
    expect(summary.points[1].totalViews).toBe(1_000_000);
    expect(summary.points[1].avgViews).toBe(150);
  });

  it("returns a null latestDelta when there is only one point", () => {
    const h = history([
      {
        savedAt: "2026-04-01T00:00:00Z",
        subs: 10,
        totalViews: 100,
        videos: [vid("a", 5, "2026-03-01T00:00:00Z")],
      },
    ]);
    const summary = summarizeHistory(h);
    expect(summary.latestDelta).toBeNull();
  });

  it("computes latestDelta using the two most recent points", () => {
    const h = history([
      {
        savedAt: "2026-04-01T00:00:00Z",
        subs: 100,
        totalViews: 1_000,
        videos: [
          vid("a", 50, "2026-03-01T00:00:00Z"),
          vid("b", 150, "2026-03-15T00:00:00Z"),
        ],
      },
      {
        savedAt: "2026-04-08T00:00:00Z",
        subs: 150,
        totalViews: 1_500,
        videos: [
          vid("a", 70, "2026-03-01T00:00:00Z"),
          vid("b", 180, "2026-03-15T00:00:00Z"),
        ],
      },
    ]);
    const summary = summarizeHistory(h);
    expect(summary.latestDelta).not.toBeNull();
    expect(summary.latestDelta?.subCountDelta).toBe(50);
    expect(summary.latestDelta?.totalViewsDelta).toBe(500);
    expect(summary.latestDelta?.spanMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("drops entries with unparseable savedAt", () => {
    const h = history([
      {
        savedAt: "2026-04-01T00:00:00Z",
        subs: 10,
        totalViews: 100,
        videos: [],
      },
    ]);
    // Inject one garbage entry.
    h.entries.push({
      ...h.entries[0],
      savedAt: "not-a-date",
    });
    const summary = summarizeHistory(h);
    expect(summary.points).toHaveLength(1);
    expect(summary.latestDelta).toBeNull();
  });
});

describe("deltaRow", () => {
  it("clamps a negative spanMs to zero when savedAt order is inverted", () => {
    const future = {
      savedAt: "2026-05-01T00:00:00Z",
      subCount: 10,
      totalViews: 0,
      avgViews: 0,
      uploadsPerWeek: 0,
    };
    const past = {
      savedAt: "2026-04-01T00:00:00Z",
      subCount: 5,
      totalViews: 0,
      avgViews: 0,
      uploadsPerWeek: 0,
    };
    expect(deltaRow(future, past).spanMs).toBe(0);
    expect(deltaRow(future, past).subCountDelta).toBe(-5);
  });

  it("derives straightforward per-metric differences", () => {
    const a = {
      savedAt: "2026-04-01T00:00:00Z",
      subCount: 100,
      totalViews: 1_000,
      avgViews: 10,
      uploadsPerWeek: 1,
    };
    const b = {
      savedAt: "2026-04-08T00:00:00Z",
      subCount: 150,
      totalViews: 2_000,
      avgViews: 20,
      uploadsPerWeek: 2.5,
    };
    const row = deltaRow(a, b);
    expect(row.subCountDelta).toBe(50);
    expect(row.totalViewsDelta).toBe(1_000);
    expect(row.avgViewsDelta).toBe(10);
    expect(row.uploadsPerWeekDelta).toBe(1.5);
    expect(row.spanMs).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
