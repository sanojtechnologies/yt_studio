import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks so they're visible inside vi.mock factory.
const { channelsList, playlistItemsList, videosList, i18nList, youtubeFactory } =
  vi.hoisted(() => {
    const channelsList = vi.fn();
    const playlistItemsList = vi.fn();
    const videosList = vi.fn();
    const i18nList = vi.fn();
    const youtubeFactory = vi.fn(() => ({
      channels: { list: channelsList },
      playlistItems: { list: playlistItemsList },
      videos: { list: videosList },
      i18nLanguages: { list: i18nList },
    }));
    return { channelsList, playlistItemsList, videosList, i18nList, youtubeFactory };
  });

vi.mock("googleapis", () => ({
  google: { youtube: youtubeFactory },
}));

const KEY = "AIzaFakeKey1234567890ABCDEF";

beforeEach(async () => {
  channelsList.mockReset();
  playlistItemsList.mockReset();
  videosList.mockReset();
  i18nList.mockReset();
  youtubeFactory.mockClear();

  // Reset the module between tests to clear the in-module cache.
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

async function loadYoutubeLib() {
  return await import("@/lib/youtube");
}

describe("getChannelById", () => {
  it("returns null for empty id without calling the API", async () => {
    const { getChannelById } = await loadYoutubeLib();
    expect(await getChannelById(KEY, "   ")).toBeNull();
    expect(channelsList).not.toHaveBeenCalled();
  });

  it("returns a normalized channel from API data", async () => {
    channelsList.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "UCabc",
            snippet: {
              title: "Sample Channel",
              description: "desc",
              thumbnails: { high: { url: "https://img/hi.jpg" } },
            },
            statistics: { subscriberCount: "1000", viewCount: "500000" },
          },
        ],
      },
    });

    const { getChannelById } = await loadYoutubeLib();
    const channel = await getChannelById(KEY, "UCabc");
    expect(channel).toEqual({
      id: "UCabc",
      title: "Sample Channel",
      description: "desc",
      thumbnailUrl: "https://img/hi.jpg",
      subscriberCount: 1000,
      viewCount: 500000,
    });
  });

  it("returns null when API returns no items", async () => {
    channelsList.mockResolvedValueOnce({ data: { items: [] } });
    const { getChannelById } = await loadYoutubeLib();
    expect(await getChannelById(KEY, "UCmissing")).toBeNull();
  });

  it("caches results for subsequent calls within TTL", async () => {
    channelsList.mockResolvedValueOnce({
      data: { items: [{ id: "UCabc", snippet: {}, statistics: {} }] },
    });

    const { getChannelById } = await loadYoutubeLib();
    const first = await getChannelById(KEY, "UCabc");
    const second = await getChannelById(KEY, "UCabc");

    expect(first).toEqual(second);
    expect(channelsList).toHaveBeenCalledTimes(1);
  });

  // Exercises the TTL-expiry branch in lib/youtube.ts getCached() — the cached
  // entry must be deleted and the underlying API hit a second time.
  it("re-fetches once the cache entry is older than the TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    channelsList.mockResolvedValue({
      data: { items: [{ id: "UCabc", snippet: {}, statistics: {} }] },
    });

    const { getChannelById } = await loadYoutubeLib();
    await getChannelById(KEY, "UCabc");
    expect(channelsList).toHaveBeenCalledTimes(1);

    // 24h TTL + 1s to guarantee strictly past the expiry boundary.
    vi.setSystemTime(new Date("2026-01-02T00:00:01Z"));
    await getChannelById(KEY, "UCabc");
    expect(channelsList).toHaveBeenCalledTimes(2);
  });

  it("translates quota 403 errors into YouTubeQuotaExceededError", async () => {
    channelsList.mockRejectedValueOnce({
      code: 403,
      errors: [{ reason: "quotaExceeded" }],
    });
    const { getChannelById } = await loadYoutubeLib();
    const { YouTubeQuotaExceededError } = await import("@/lib/errors");
    await expect(getChannelById(KEY, "UCabc")).rejects.toBeInstanceOf(
      YouTubeQuotaExceededError
    );
  });

  it("translates invalid-key errors into YouTubeInvalidApiKeyError", async () => {
    channelsList.mockRejectedValueOnce({
      response: { status: 400, data: { error: { message: "API key not valid." } } },
    });
    const { getChannelById } = await loadYoutubeLib();
    const { YouTubeInvalidApiKeyError } = await import("@/lib/errors");
    await expect(getChannelById(KEY, "UCabc")).rejects.toBeInstanceOf(
      YouTubeInvalidApiKeyError
    );
  });

  it("throws YouTubeInvalidApiKeyError for an empty key", async () => {
    const { getChannelById } = await loadYoutubeLib();
    const { YouTubeInvalidApiKeyError } = await import("@/lib/errors");
    await expect(getChannelById("", "UCabc")).rejects.toBeInstanceOf(
      YouTubeInvalidApiKeyError
    );
  });

  it("rethrows a generic error unchanged", async () => {
    const original = new Error("unexpected");
    channelsList.mockRejectedValueOnce(original);
    const { getChannelById } = await loadYoutubeLib();
    await expect(getChannelById(KEY, "UCabc")).rejects.toBe(original);
  });
});

describe("toChannel / toVideo fallbacks", () => {
  // Closes the `item.id ?? ""` branch in both toChannel and toVideo.
  it("uses '' as id when the API omits the id field", async () => {
    channelsList.mockResolvedValueOnce({
      data: { items: [{ snippet: {}, statistics: {} }] },
    });
    videosList.mockResolvedValueOnce({
      data: { items: [{ snippet: {}, statistics: {}, contentDetails: {} }] },
    });

    const { getChannelById, getVideoDetails } = await loadYoutubeLib();
    const channel = await getChannelById(KEY, "UCabc");
    expect(channel?.id).toBe("");

    // getVideoDetails additionally filters out items with no id; the mapping
    // path itself must still execute the `?? ""` branch before that filter.
    const videos = await getVideoDetails(KEY, ["v1"]);
    expect(videos).toEqual([]);
  });
});

describe("cache-hit branches", () => {
  // One test per public function so the `if (cached !== null) return cached;`
  // branch is exercised in getChannelByHandle / getChannelVideos /
  // getVideoDetails / getChannelUploadsPlaylistId (the latter via
  // getChannelVideos's second call).
  it("returns the cached channel from getChannelByHandle on the second call", async () => {
    channelsList.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "UCabc",
            snippet: { title: "X" },
            statistics: { subscriberCount: "1", viewCount: "1" },
          },
        ],
      },
    });
    const { getChannelByHandle } = await loadYoutubeLib();
    const first = await getChannelByHandle(KEY, "@LearnwithManoj");
    const second = await getChannelByHandle(KEY, "@LearnwithManoj");
    expect(first).toEqual(second);
    expect(channelsList).toHaveBeenCalledTimes(1);
  });

  it("returns the cached video list from getChannelVideos on the second call", async () => {
    channelsList.mockResolvedValueOnce({
      data: {
        items: [{ contentDetails: { relatedPlaylists: { uploads: "UUabc" } } }],
      },
    });
    playlistItemsList.mockResolvedValueOnce({
      data: { items: [{ contentDetails: { videoId: "v1" } }], nextPageToken: undefined },
    });
    videosList.mockResolvedValueOnce({
      data: {
        items: [
          { id: "v1", snippet: {}, contentDetails: {}, statistics: {} },
        ],
      },
    });

    const { getChannelVideos } = await loadYoutubeLib();
    const first = await getChannelVideos(KEY, "UCabc", 1);
    const second = await getChannelVideos(KEY, "UCabc", 1);
    expect(first).toEqual(second);
    expect(channelsList).toHaveBeenCalledTimes(1);
    expect(playlistItemsList).toHaveBeenCalledTimes(1);
    expect(videosList).toHaveBeenCalledTimes(1);
  });

  // Uses two getChannelVideos calls with *different* maxResults so the outer
  // videos cache key differs but the inner uploads-playlist cache key is the
  // same — the only way to exercise the cache-hit branch in
  // getChannelUploadsPlaylistId.
  it("re-uses the cached uploads playlist id across distinct getChannelVideos calls", async () => {
    channelsList.mockResolvedValueOnce({
      data: { items: [{ contentDetails: { relatedPlaylists: { uploads: "UUabc" } } }] },
    });
    playlistItemsList
      .mockResolvedValueOnce({
        data: { items: [{ contentDetails: { videoId: "v1" } }], nextPageToken: undefined },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            { contentDetails: { videoId: "v1" } },
            { contentDetails: { videoId: "v2" } },
          ],
          nextPageToken: undefined,
        },
      });
    videosList
      .mockResolvedValueOnce({
        data: { items: [{ id: "v1", snippet: {}, contentDetails: {}, statistics: {} }] },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            { id: "v1", snippet: {}, contentDetails: {}, statistics: {} },
            { id: "v2", snippet: {}, contentDetails: {}, statistics: {} },
          ],
        },
      });

    const { getChannelVideos } = await loadYoutubeLib();
    await getChannelVideos(KEY, "UCabc", 1);
    await getChannelVideos(KEY, "UCabc", 2);

    expect(channelsList).toHaveBeenCalledTimes(1);
    expect(playlistItemsList).toHaveBeenCalledTimes(2);
    expect(videosList).toHaveBeenCalledTimes(2);
  });

  it("returns the cached detail list from getVideoDetails on the second call", async () => {
    videosList.mockResolvedValueOnce({
      data: { items: [{ id: "v1", snippet: {}, contentDetails: {}, statistics: {} }] },
    });
    const { getVideoDetails } = await loadYoutubeLib();
    const first = await getVideoDetails(KEY, ["v1"]);
    const second = await getVideoDetails(KEY, ["v1"]);
    expect(first).toEqual(second);
    expect(videosList).toHaveBeenCalledTimes(1);
  });

  it("bypasses channel cache when explicitly requested", async () => {
    channelsList.mockResolvedValue({
      data: { items: [{ id: "UCabc", snippet: {}, statistics: {} }] },
    });
    const { getChannelById } = await loadYoutubeLib();
    await getChannelById(KEY, "UCabc");
    await getChannelById(KEY, "UCabc", { bypassCache: true });
    expect(channelsList).toHaveBeenCalledTimes(2);
  });

  it("bypasses handle cache when explicitly requested", async () => {
    channelsList.mockResolvedValue({
      data: { items: [{ id: "UCabc", snippet: {}, statistics: {} }] },
    });
    const { getChannelByHandle } = await loadYoutubeLib();
    await getChannelByHandle(KEY, "@LearnwithManoj");
    await getChannelByHandle(KEY, "@LearnwithManoj", { bypassCache: true });
    expect(channelsList).toHaveBeenCalledTimes(2);
  });

  it("bypasses videos cache when explicitly requested", async () => {
    channelsList.mockResolvedValue({
      data: { items: [{ contentDetails: { relatedPlaylists: { uploads: "UUabc" } } }] },
    });
    playlistItemsList.mockResolvedValue({
      data: { items: [{ contentDetails: { videoId: "v1" } }], nextPageToken: undefined },
    });
    videosList.mockResolvedValue({
      data: { items: [{ id: "v1", snippet: {}, contentDetails: {}, statistics: {} }] },
    });
    const { getChannelVideos } = await loadYoutubeLib();
    await getChannelVideos(KEY, "UCabc", 1);
    await getChannelVideos(KEY, "UCabc", 1, { bypassCache: true });
    expect(channelsList).toHaveBeenCalledTimes(2);
    expect(playlistItemsList).toHaveBeenCalledTimes(2);
    expect(videosList).toHaveBeenCalledTimes(2);
  });
});

describe("empty-result fallbacks", () => {
  // Closes the `item ? toChannel(item) : null` null branch in getChannelByHandle.
  // NOTE: `getCached` uses `null` as the cache-miss sentinel, so a stored `null`
  // value isn't actually re-served on subsequent calls — that's a known
  // limitation tracked in PRD § 9.5; the test only validates the immediate
  // return shape, not negative-cache memoization.
  it("returns null when the handle resolves to no items", async () => {
    channelsList.mockResolvedValueOnce({ data: { items: [] } });
    const { getChannelByHandle } = await loadYoutubeLib();
    expect(await getChannelByHandle(KEY, "@ghost")).toBeNull();
  });

  // Closes the `?.filter(...) ?? []` branch in getChannelVideos when the
  // playlistItems response has no `items` array at all.
  it("treats a playlistItems response with no `items` field as an empty page", async () => {
    channelsList.mockResolvedValueOnce({
      data: { items: [{ contentDetails: { relatedPlaylists: { uploads: "UUabc" } } }] },
    });
    playlistItemsList.mockResolvedValueOnce({
      data: { nextPageToken: undefined },
    });
    videosList.mockResolvedValueOnce({ data: { items: [] } });

    const { getChannelVideos } = await loadYoutubeLib();
    expect(await getChannelVideos(KEY, "UCabc", 5)).toEqual([]);
  });

  // Exercises the second clause of `if (!pageToken || idsFromPage.length === 0)`:
  // a page that *does* return a nextPageToken but yields no resolvable IDs
  // (every item lacks contentDetails.videoId) must still terminate the loop.
  it("breaks the pagination loop when a page yields no IDs even with a next token", async () => {
    channelsList.mockResolvedValueOnce({
      data: { items: [{ contentDetails: { relatedPlaylists: { uploads: "UUabc" } } }] },
    });
    playlistItemsList.mockResolvedValueOnce({
      data: { items: [{ contentDetails: {} }], nextPageToken: "carry-on" },
    });
    videosList.mockResolvedValueOnce({ data: { items: [] } });

    const { getChannelVideos } = await loadYoutubeLib();
    expect(await getChannelVideos(KEY, "UCabc", 5)).toEqual([]);
    expect(playlistItemsList).toHaveBeenCalledTimes(1);
  });

  // Closes the `?.filter(...) ?? []` branch in getVideoDetails.
  it("returns [] when the videos.list response has no `items` field", async () => {
    videosList.mockResolvedValueOnce({ data: {} });
    const { getVideoDetails } = await loadYoutubeLib();
    expect(await getVideoDetails(KEY, ["v1"])).toEqual([]);
  });
});

describe("rethrow paths on other endpoints", () => {
  it("getChannelByHandle rethrows non-quota, non-invalid errors", async () => {
    channelsList.mockRejectedValueOnce(new Error("transient"));
    const { getChannelByHandle } = await loadYoutubeLib();
    await expect(getChannelByHandle(KEY, "x")).rejects.toThrow("transient");
  });

  it("getVideoDetails propagates quota errors as YouTubeQuotaExceededError", async () => {
    videosList.mockRejectedValueOnce({
      code: 403,
      errors: [{ reason: "quotaExceeded" }],
    });
    const { getVideoDetails } = await loadYoutubeLib();
    const { YouTubeQuotaExceededError } = await import("@/lib/errors");
    await expect(getVideoDetails(KEY, ["v1"])).rejects.toBeInstanceOf(
      YouTubeQuotaExceededError
    );
  });

  it("getChannelVideos rethrows unrecognized errors", async () => {
    channelsList.mockRejectedValueOnce(new Error("kaboom"));
    const { getChannelVideos } = await loadYoutubeLib();
    await expect(getChannelVideos(KEY, "UCabc", 1)).rejects.toThrow("kaboom");
  });
});

describe("getChannelByHandle", () => {
  it("normalizes @handle input and returns mapped channel", async () => {
    channelsList.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "UCabc",
            snippet: { title: "Handle Ch" },
            statistics: { subscriberCount: "10", viewCount: "100" },
          },
        ],
      },
    });
    const { getChannelByHandle } = await loadYoutubeLib();
    const channel = await getChannelByHandle(KEY, "@LearnwithManoj");
    expect(channel?.id).toBe("UCabc");
    expect(channelsList).toHaveBeenCalledWith(
      expect.objectContaining({ forHandle: "LearnwithManoj" })
    );
  });

  it("returns null when handle is empty after normalization", async () => {
    const { getChannelByHandle } = await loadYoutubeLib();
    expect(await getChannelByHandle(KEY, "@")).toBeNull();
    expect(channelsList).not.toHaveBeenCalled();
  });
});

describe("getChannelVideos", () => {
  it("returns [] when channelId is empty", async () => {
    const { getChannelVideos } = await loadYoutubeLib();
    expect(await getChannelVideos(KEY, "  ")).toEqual([]);
  });

  it("returns [] when the channel has no uploads playlist", async () => {
    channelsList.mockResolvedValueOnce({
      data: { items: [{ contentDetails: {} }] },
    });
    const { getChannelVideos } = await loadYoutubeLib();
    expect(await getChannelVideos(KEY, "UCabc")).toEqual([]);
  });

  it("returns [] without caching when uploads playlist is missing and bypass is enabled", async () => {
    channelsList.mockResolvedValueOnce({
      data: { items: [{ contentDetails: {} }] },
    });
    const { getChannelVideos } = await loadYoutubeLib();
    expect(await getChannelVideos(KEY, "UCabc", 50, { bypassCache: true })).toEqual([]);
  });

  it("fetches uploads, paginates, and returns normalized videos", async () => {
    channelsList.mockResolvedValueOnce({
      data: {
        items: [
          { contentDetails: { relatedPlaylists: { uploads: "UUabc" } } },
        ],
      },
    });
    playlistItemsList.mockResolvedValueOnce({
      data: {
        items: [
          { contentDetails: { videoId: "v1" } },
          { contentDetails: { videoId: "v2" } },
          { contentDetails: {} },
        ],
        nextPageToken: undefined,
      },
    });
    videosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "v1",
            snippet: {
              title: "V1",
              description: "",
              publishedAt: "2025-01-06T00:00:00Z",
              thumbnails: { default: { url: "https://t/default.jpg" } },
            },
            contentDetails: { duration: "PT5M" },
            statistics: { viewCount: "10", likeCount: "2", commentCount: "1" },
          },
          {
            id: "v2",
            snippet: {
              title: "V2",
              description: "",
              publishedAt: "2025-01-07T00:00:00Z",
            },
            contentDetails: { duration: "PT6M" },
            statistics: { viewCount: "20", likeCount: "4", commentCount: "3" },
          },
        ],
      },
    });

    const { getChannelVideos } = await loadYoutubeLib();
    const videos = await getChannelVideos(KEY, "UCabc", 2);
    expect(videos).toHaveLength(2);
    expect(videos[0]).toMatchObject({
      id: "v1",
      title: "V1",
      viewCount: 10,
      likeCount: 2,
      commentCount: 1,
      duration: "PT5M",
      thumbnailUrl: "https://t/default.jpg",
    });
    expect(videos[1].id).toBe("v2");
    expect(playlistItemsList).toHaveBeenCalledTimes(1);
  });

  it("paginates through multiple playlist pages until the cap is reached", async () => {
    channelsList.mockResolvedValueOnce({
      data: { items: [{ contentDetails: { relatedPlaylists: { uploads: "UUabc" } } }] },
    });
    playlistItemsList
      .mockResolvedValueOnce({
        data: {
          items: [{ contentDetails: { videoId: "v1" } }],
          nextPageToken: "page-2",
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [{ contentDetails: { videoId: "v2" } }],
          nextPageToken: undefined,
        },
      });
    videosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "v1",
            snippet: { title: "V1", description: "", publishedAt: "2025-01-01T00:00:00Z" },
            contentDetails: { duration: "PT5M" },
            statistics: { viewCount: "1", likeCount: "0", commentCount: "0" },
          },
          {
            id: "v2",
            snippet: { title: "V2", description: "", publishedAt: "2025-01-02T00:00:00Z" },
            contentDetails: { duration: "PT5M" },
            statistics: { viewCount: "1", likeCount: "0", commentCount: "0" },
          },
        ],
      },
    });

    const { getChannelVideos } = await loadYoutubeLib();
    const videos = await getChannelVideos(KEY, "UCabc", 2);
    expect(videos).toHaveLength(2);
    expect(playlistItemsList).toHaveBeenCalledTimes(2);
  });

  it("clamps maxResults to the 1..50 range", async () => {
    channelsList.mockResolvedValueOnce({
      data: { items: [{ contentDetails: { relatedPlaylists: { uploads: "UUabc" } } }] },
    });
    playlistItemsList.mockResolvedValueOnce({
      data: { items: [{ contentDetails: { videoId: "v1" } }], nextPageToken: undefined },
    });
    videosList.mockResolvedValueOnce({
      data: { items: [{ id: "v1", snippet: {}, contentDetails: {}, statistics: {} }] },
    });

    const { getChannelVideos } = await loadYoutubeLib();
    await getChannelVideos(KEY, "UCabc", 9999);
    const callArgs = playlistItemsList.mock.calls[0][0];
    expect(callArgs.maxResults).toBe(50);
  });
});

describe("getDashboardRefreshState", () => {
  it("forces refresh when key or channel id is empty", async () => {
    const { getDashboardRefreshState } = await loadYoutubeLib();
    expect(getDashboardRefreshState(" ", "UCabc", 50)).toEqual({
      lastRefreshedAt: null,
      shouldForceRefresh: true,
    });
    expect(getDashboardRefreshState(KEY, "   ", 50)).toEqual({
      lastRefreshedAt: null,
      shouldForceRefresh: true,
    });
  });

  it("returns stale/force-refresh when dashboard cache is missing", async () => {
    const { getDashboardRefreshState } = await loadYoutubeLib();
    expect(getDashboardRefreshState(KEY, "UCabc", 50)).toEqual({
      lastRefreshedAt: null,
      shouldForceRefresh: true,
    });
  });

  it("returns cached refresh timestamp while data is younger than 24h", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    channelsList.mockResolvedValue({
      data: {
        items: [
          {
            id: "UCabc",
            snippet: {},
            statistics: {},
            contentDetails: { relatedPlaylists: { uploads: "UUabc" } },
          },
        ],
      },
    });
    playlistItemsList.mockResolvedValueOnce({
      data: { items: [{ contentDetails: { videoId: "v1" } }], nextPageToken: undefined },
    });
    videosList.mockResolvedValueOnce({
      data: { items: [{ id: "v1", snippet: {}, contentDetails: {}, statistics: {} }] },
    });
    const { getChannelById, getChannelVideos, getDashboardRefreshState } = await loadYoutubeLib();

    await getChannelById(KEY, "UCabc");
    await getChannelVideos(KEY, "UCabc", 1);
    vi.setSystemTime(new Date("2026-01-01T03:00:00Z"));

    const result = getDashboardRefreshState(KEY, "UCabc", 1);
    expect(result.shouldForceRefresh).toBe(false);
    expect(result.lastRefreshedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("forces refresh when cached dashboard data exceeds 24h", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    channelsList.mockResolvedValue({
      data: {
        items: [
          {
            id: "UCabc",
            snippet: {},
            statistics: {},
            contentDetails: { relatedPlaylists: { uploads: "UUabc" } },
          },
        ],
      },
    });
    playlistItemsList.mockResolvedValueOnce({
      data: { items: [{ contentDetails: { videoId: "v1" } }], nextPageToken: undefined },
    });
    videosList.mockResolvedValueOnce({
      data: { items: [{ id: "v1", snippet: {}, contentDetails: {}, statistics: {} }] },
    });
    const { getChannelById, getChannelVideos, getDashboardRefreshState } = await loadYoutubeLib();

    await getChannelById(KEY, "UCabc");
    await getChannelVideos(KEY, "UCabc", 1);
    vi.setSystemTime(new Date("2026-01-02T00:00:01Z"));

    expect(getDashboardRefreshState(KEY, "UCabc", 1)).toEqual({
      lastRefreshedAt: null,
      shouldForceRefresh: true,
    });
  });
});

describe("getVideoDetails", () => {
  it("returns [] when given no ids", async () => {
    const { getVideoDetails } = await loadYoutubeLib();
    expect(await getVideoDetails(KEY, [])).toEqual([]);
    expect(await getVideoDetails(KEY, ["  ", ""])).toEqual([]);
  });

  it("dedupes ids and filters items with no id", async () => {
    videosList.mockResolvedValueOnce({
      data: {
        items: [
          { id: "v1", snippet: {}, contentDetails: {}, statistics: {} },
          { id: "", snippet: {}, contentDetails: {}, statistics: {} },
        ],
      },
    });
    const { getVideoDetails } = await loadYoutubeLib();
    const result = await getVideoDetails(KEY, ["v1", "v1", " v2 "]);
    expect(result).toHaveLength(1);
    expect(videosList.mock.calls[0][0].id).toEqual(["v1", "v2"]);
  });

  // Covers the snippet.tags mapping in toVideo: non-string entries are
  // filtered out, while a fully-valid list flows through unchanged.
  it("maps snippet.tags into YouTubeVideo.tags, dropping non-string entries", async () => {
    videosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "v1",
            // googleapis typings declare tags as string[]; we deliberately
            // cast a mixed array to simulate a malformed upstream payload.
            snippet: { tags: ["react", 42, "hooks", null, "next"] as unknown as string[] },
            contentDetails: {},
            statistics: {},
          },
        ],
      },
    });
    const { getVideoDetails } = await loadYoutubeLib();
    const [video] = await getVideoDetails(KEY, ["v1"]);
    expect(video.tags).toEqual(["react", "hooks", "next"]);
  });
});
