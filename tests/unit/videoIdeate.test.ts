import { beforeEach, describe, expect, it, vi } from "vitest";

const { searchList, videosList, youtubeFactory } = vi.hoisted(() => {
  const searchList = vi.fn();
  const videosList = vi.fn();
  const youtubeFactory = vi.fn(() => ({
    search: { list: searchList },
    videos: { list: videosList },
  }));
  return { searchList, videosList, youtubeFactory };
});

vi.mock("googleapis", () => ({
  google: { youtube: youtubeFactory },
}));

const KEY = "AIzaFakeKey1234567890ABCDEF";

function sampleVideo(id: string, views: number, publishedAt = "2026-04-10T00:00:00Z") {
  return {
    id,
    title: `Video ${id}`,
    description: "graph rag workflows",
    publishedAt,
    channelTitle: "Channel",
    duration: "PT6M",
    viewCount: views,
    likeCount: Math.round(views * 0.1),
    commentCount: Math.round(views * 0.01),
  };
}

beforeEach(() => {
  searchList.mockReset();
  videosList.mockReset();
  youtubeFactory.mockClear();
  vi.resetModules();
});

async function load() {
  return import("@/lib/videoIdeate");
}

describe("videoIdeate evidence", () => {
  it("filters only recent videos in window", async () => {
    const { filterRecentVideos } = await load();
    const now = new Date("2026-04-30T00:00:00Z");
    const out = filterRecentVideos(
      [
        sampleVideo("a", 100, "2026-04-20T00:00:00Z"),
        sampleVideo("b", 100, "2026-03-01T00:00:00Z"),
        sampleVideo("c", 100, "bad-date"),
      ],
      now,
      30
    );
    expect(out.map((v) => v.id)).toEqual(["a"]);
  });

  it("builds evidence with keyword performance and opportunity signals", async () => {
    const { buildVideoIdeateEvidence } = await load();
    const evidence = buildVideoIdeateEvidence({
      keywords: ["graph rag", "agents"],
      videos: [
        sampleVideo("a", 1000),
        sampleVideo("b", 700),
        { ...sampleVideo("c", 200), description: "nothing here", title: "No keyword" },
      ],
      now: new Date("2026-04-30T00:00:00Z"),
      windowDays: 30,
    });
    expect(evidence.sampleSize).toBe(3);
    expect(evidence.keywordPerformance[0].keyword).toBe("graph rag");
    expect(evidence.opportunitySignals.length).toBeGreaterThan(0);
    expect(evidence.topVideos[0].viewCount).toBe(1000);
  });

  it("handles zero-view videos without engagement divide errors", async () => {
    const { buildVideoIdeateEvidence } = await load();
    const evidence = buildVideoIdeateEvidence({
      keywords: ["graph rag"],
      videos: [{ ...sampleVideo("z1", 0), likeCount: 10, commentCount: 5 }],
      now: new Date("2026-04-30T00:00:00Z"),
      windowDays: 30,
    });
    expect(evidence.keywordPerformance[0].avgEngagementRate).toBe(0);
  });

  it("uses default now/window and secondary keyword sort fallback", async () => {
    const { buildVideoIdeateEvidence } = await load();
    const evidence = buildVideoIdeateEvidence({
      keywords: ["alpha", "beta"],
      videos: [
        { ...sampleVideo("k1", 100), title: "alpha item", description: "" },
        { ...sampleVideo("k2", 100), title: "alpha second", description: "" },
        { ...sampleVideo("k3", 100), title: "beta item", description: "" },
      ],
    });
    expect(evidence.windowDays).toBe(30);
    expect(evidence.keywordPerformance[0].keyword).toBe("alpha");
  });

  it("produces short-dominant and long-dominant format signals", async () => {
    const { buildVideoIdeateEvidence } = await load();
    const shortHeavy = buildVideoIdeateEvidence({
      keywords: ["x"],
      videos: [
        { ...sampleVideo("s1", 100), duration: "PT30S" },
        { ...sampleVideo("s2", 120), duration: "PT45S" },
      ],
      now: new Date("2026-04-30T00:00:00Z"),
      windowDays: 30,
    });
    expect(shortHeavy.opportunitySignals.join(" ")).toMatch(/short-form/i);

    const longHeavy = buildVideoIdeateEvidence({
      keywords: ["x"],
      videos: [
        { ...sampleVideo("l1", 100), duration: "PT10M" },
        { ...sampleVideo("l2", 120), duration: "PT8M" },
      ],
      now: new Date("2026-04-30T00:00:00Z"),
      windowDays: 30,
    });
    expect(longHeavy.opportunitySignals.join(" ")).toMatch(/long-form/i);
  });

  it("includes phrase signal and balanced-format signal when applicable", async () => {
    const { buildVideoIdeateEvidence } = await load();
    const evidence = buildVideoIdeateEvidence({
      keywords: ["graph"],
      videos: [
        { ...sampleVideo("a1", 200), title: "graph rag basics", duration: "PT20S" },
        { ...sampleVideo("a2", 250), title: "graph rag advanced", duration: "PT12M" },
      ],
      now: new Date("2026-04-30T00:00:00Z"),
      windowDays: 30,
    });
    expect(evidence.topPhrases[0]?.phrase).toContain("graph rag");
    expect(evidence.opportunitySignals.join(" ")).toMatch(/phrase "graph rag"/i);
    expect(evidence.opportunitySignals.join(" ")).toMatch(/balanced/i);
  });

  it("returns sparse-signal fallback for empty sample", async () => {
    const { buildVideoIdeateEvidence } = await load();
    const evidence = buildVideoIdeateEvidence({
      keywords: ["ai"],
      videos: [],
      now: new Date("2026-04-30T00:00:00Z"),
      windowDays: 30,
    });
    expect(evidence.sampleSize).toBe(0);
    expect(evidence.opportunitySignals[0]).toMatch(/sparse/i);
  });
});

describe("fetchVideosForIdeation", () => {
  it("returns [] when keyword list is empty", async () => {
    const { fetchVideosForIdeation } = await load();
    expect(await fetchVideosForIdeation({ apiKey: KEY, keywords: [] })).toEqual([]);
    expect(searchList).not.toHaveBeenCalled();
  });

  it("throws invalid key when api key is blank", async () => {
    const { fetchVideosForIdeation } = await load();
    const { YouTubeInvalidApiKeyError } = await import("@/lib/errors");
    await expect(fetchVideosForIdeation({ apiKey: " ", keywords: ["ai"] })).rejects.toBeInstanceOf(
      YouTubeInvalidApiKeyError
    );
  });

  it("fetches search + details and maps video payload", async () => {
    searchList.mockResolvedValueOnce({
      data: { items: [{ id: { videoId: "v1" } }, { id: { videoId: "v2" } }] },
    });
    videosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "v1",
            snippet: { title: "A", description: "d", publishedAt: "2026-04-20T00:00:00Z", channelTitle: "C" },
            statistics: { viewCount: "100", likeCount: "10", commentCount: "2" },
            contentDetails: { duration: "PT5M" },
          },
          {
            id: "v2",
            snippet: { title: "B", description: "d", publishedAt: "2026-04-21T00:00:00Z", channelTitle: "C" },
            statistics: { viewCount: "200", likeCount: "20", commentCount: "4" },
            contentDetails: { duration: "PT45S" },
          },
        ],
      },
    });
    const { fetchVideosForIdeation } = await load();
    const out = await fetchVideosForIdeation({
      apiKey: KEY,
      keywords: ["ai"],
      now: new Date("2026-04-30T00:00:00Z"),
      maxVideosPerKeyword: 2,
    });
    expect(searchList).toHaveBeenCalled();
    expect(videosList).toHaveBeenCalled();
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe("v1");
  });

  it("returns [] when search returns no ids", async () => {
    searchList.mockResolvedValueOnce({ data: { items: [] } });
    const { fetchVideosForIdeation } = await load();
    const out = await fetchVideosForIdeation({ apiKey: KEY, keywords: ["ai"] });
    expect(out).toEqual([]);
  });

  it("handles missing search and detail item arrays safely", async () => {
    searchList.mockResolvedValueOnce({ data: {} });
    const { fetchVideosForIdeation } = await load();
    const out = await fetchVideosForIdeation({ apiKey: KEY, keywords: ["ai"] });
    expect(out).toEqual([]);
  });

  it("skips detail entries that cannot be mapped", async () => {
    searchList.mockResolvedValueOnce({ data: { items: [{ id: { videoId: "v1" } }] } });
    videosList.mockResolvedValueOnce({ data: { items: [{ id: "" }, {}] } });
    const { fetchVideosForIdeation } = await load();
    const out = await fetchVideosForIdeation({ apiKey: KEY, keywords: ["ai"] });
    expect(out).toEqual([]);
  });

  it("maps partial detail payloads with safe defaults", async () => {
    searchList.mockResolvedValueOnce({
      data: { items: [{ id: { videoId: "v3" } }, { id: {} }] },
    });
    videosList.mockResolvedValueOnce({
      data: {
        items: [{ id: "v3", snippet: {}, statistics: {}, contentDetails: {} }],
      },
    });
    const { fetchVideosForIdeation } = await load();
    const out = await fetchVideosForIdeation({ apiKey: KEY, keywords: ["ai"] });
    expect(out).toEqual([
      {
        id: "v3",
        title: "",
        description: "",
        publishedAt: "",
        channelTitle: "",
        duration: "",
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
      },
    ]);
  });

  it("handles empty detail responses for matched ids", async () => {
    searchList.mockResolvedValueOnce({ data: { items: [{ id: { videoId: "v4" } }] } });
    videosList.mockResolvedValueOnce({ data: {} });
    const { fetchVideosForIdeation } = await load();
    const out = await fetchVideosForIdeation({ apiKey: KEY, keywords: ["ai"] });
    expect(out).toEqual([]);
  });

  it("translates quota errors", async () => {
    searchList.mockRejectedValueOnce({ code: 403, errors: [{ reason: "quotaExceeded" }] });
    const { fetchVideosForIdeation } = await load();
    const { YouTubeQuotaExceededError } = await import("@/lib/errors");
    await expect(fetchVideosForIdeation({ apiKey: KEY, keywords: ["ai"] })).rejects.toBeInstanceOf(
      YouTubeQuotaExceededError
    );
  });

  it("translates invalid api key errors", async () => {
    searchList.mockRejectedValueOnce({
      response: { status: 400, data: { error: { message: "API key not valid." } } },
    });
    const { fetchVideosForIdeation } = await load();
    const { YouTubeInvalidApiKeyError } = await import("@/lib/errors");
    await expect(fetchVideosForIdeation({ apiKey: KEY, keywords: ["ai"] })).rejects.toBeInstanceOf(
      YouTubeInvalidApiKeyError
    );
  });

  it("rethrows unknown youtube errors", async () => {
    searchList.mockRejectedValueOnce({ code: 500 });
    const { fetchVideosForIdeation } = await load();
    await expect(fetchVideosForIdeation({ apiKey: KEY, keywords: ["ai"] })).rejects.toEqual({
      code: 500,
    });
  });
});
