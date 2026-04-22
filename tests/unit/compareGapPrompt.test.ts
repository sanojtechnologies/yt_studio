import { describe, expect, it } from "vitest";
import {
  buildCompareGapPrompt,
  COMPARE_GAP_LIMITS,
  COMPARE_GAP_SCHEMA,
  selectGapChannels,
} from "@/lib/compareGapPrompt";
import type { ChannelComparisonRow } from "@/lib/compareStats";
import type { YouTubeChannel, YouTubeVideo } from "@/types/youtube";

function channel(id: string, title: string): YouTubeChannel {
  return {
    id,
    title,
    description: "",
    thumbnailUrl: "",
    subscriberCount: 0,
    viewCount: 0,
  };
}

function video(title: string, views = 0): YouTubeVideo {
  return {
    id: title,
    title,
    description: "",
    thumbnailUrl: "",
    publishedAt: "2024-01-01T00:00:00Z",
    duration: "PT5M",
    viewCount: views,
    likeCount: 0,
    commentCount: 0,
  };
}

function makeRow(id: string, title: string, titles: string[]): ChannelComparisonRow {
  return {
    channel: channel(id, title),
    videoCount: titles.length,
    stats: {
      avgViews: 0,
      engagementRate: 0,
      uploadFrequencyPerWeek: 0,
      bestDay: "Mon",
    },
    medianViews: 1000,
    topVideos: titles.map((t) => video(t)),
  };
}

describe("selectGapChannels", () => {
  it("maps comparison rows into gap channel inputs", () => {
    const rows = [
      makeRow("c1", "Alpha", ["How to X", "Deep dive Y", ""]),
      makeRow("c2", "Beta", ["React tips"]),
    ];
    const out = selectGapChannels(rows, 2);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ channelId: "c1", channelTitle: "Alpha" });
    expect(out[0].topTitles).toEqual(["How to X", "Deep dive Y"]);
    expect(out[1].topTitles).toEqual(["React tips"]);
  });

  it("respects the default topN from COMPARE_GAP_LIMITS", () => {
    const titles = Array.from({ length: 12 }, (_, i) => `T${i}`);
    const rows = [makeRow("c1", "A", titles)];
    expect(selectGapChannels(rows)[0].topTitles).toHaveLength(
      COMPARE_GAP_LIMITS.maxTopTitles
    );
  });

  it("filters whitespace-only titles", () => {
    const rows = [makeRow("c1", "A", ["   ", "Real"])];
    expect(selectGapChannels(rows)[0].topTitles).toEqual(["Real"]);
  });
});

describe("buildCompareGapPrompt", () => {
  it("includes every channel and its titles", () => {
    const prompt = buildCompareGapPrompt({
      channels: [
        {
          channelId: "c1",
          channelTitle: "Alpha",
          medianViews: 1200,
          topTitles: ["Build X", "Ship Y"],
        },
        {
          channelId: "c2",
          channelTitle: "Beta",
          medianViews: 800,
          topTitles: ["Teach Z"],
        },
      ],
    });
    expect(prompt).toContain("Alpha");
    expect(prompt).toContain("(id=c1)");
    expect(prompt).toContain("Build X");
    expect(prompt).toContain("Ship Y");
    expect(prompt).toContain("Beta");
    expect(prompt).toContain("Teach Z");
  });

  it("handles channels with no titles", () => {
    const prompt = buildCompareGapPrompt({
      channels: [
        { channelId: "c1", channelTitle: "Alpha", medianViews: 0, topTitles: [] },
        { channelId: "c2", channelTitle: "Beta", medianViews: 0, topTitles: ["One"] },
      ],
    });
    expect(prompt).toContain("(no titles available)");
  });

  it("appends the focus line when provided", () => {
    const prompt = buildCompareGapPrompt({
      channels: [
        { channelId: "c1", channelTitle: "Alpha", medianViews: 0, topTitles: ["t"] },
        { channelId: "c2", channelTitle: "Beta", medianViews: 0, topTitles: ["t"] },
      ],
      focus: "Tutorials only",
    });
    expect(prompt).toContain("Focus / user note: Tutorials only");
  });

  it("omits the focus line when absent", () => {
    const prompt = buildCompareGapPrompt({
      channels: [
        { channelId: "c1", channelTitle: "Alpha", medianViews: 0, topTitles: ["t"] },
        { channelId: "c2", channelTitle: "Beta", medianViews: 0, topTitles: ["t"] },
      ],
    });
    expect(prompt).not.toContain("Focus / user note");
  });
});

describe("COMPARE_GAP_SCHEMA", () => {
  it("requires shared topics and per-channel gaps", () => {
    expect(COMPARE_GAP_SCHEMA.required).toEqual(["sharedTopics", "perChannelGaps"]);
  });

  it("enforces min/max channel constants", () => {
    expect(COMPARE_GAP_LIMITS.minChannels).toBe(2);
    expect(COMPARE_GAP_LIMITS.maxChannels).toBe(4);
  });
});
