import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestCookie } from "../utils/cookies";

const { getChannelByIdMock, getChannelVideosMock } = vi.hoisted(() => ({
  getChannelByIdMock: vi.fn(),
  getChannelVideosMock: vi.fn(),
}));

vi.mock("@/lib/youtube", () => ({
  getChannelById: getChannelByIdMock,
  getChannelByHandle: vi.fn(),
  getChannelVideos: getChannelVideosMock,
  getVideoDetails: vi.fn(),
}));

const KEY = "AIzaIntegrationCompareKey1234567890";

async function GET(url: string) {
  const { GET } = await import("@/app/api/compare/route");
  return GET(new Request(url));
}

function channel(id: string) {
  return {
    id,
    title: id,
    description: "",
    subscriberCount: 0,
    viewCount: 0,
  };
}

function video(id: string, viewCount: number) {
  return {
    id,
    title: id,
    description: "",
    publishedAt: "2025-01-01T00:00:00Z",
    duration: "PT1M",
    viewCount,
    likeCount: 0,
    commentCount: 0,
  };
}

beforeEach(() => {
  getChannelByIdMock.mockReset();
  getChannelVideosMock.mockReset();
});

describe("GET /api/compare", () => {
  it("returns 401 when the YouTube key cookie is missing", async () => {
    const res = await GET("http://x/api/compare?ids=UC1,UC2");
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/YouTube Data API v3 key/);
  });

  it("returns 400 when fewer than 2 ids are provided", async () => {
    setTestCookie("yt_api_key", KEY);
    const res = await GET("http://x/api/compare?ids=UC1");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at least 2/);
  });

  it("returns 400 when the ids parameter is missing entirely", async () => {
    setTestCookie("yt_api_key", KEY);
    const res = await GET("http://x/api/compare");
    expect(res.status).toBe(400);
  });

  it("returns rows for each resolved channel sorted by request order", async () => {
    setTestCookie("yt_api_key", KEY);
    getChannelByIdMock.mockImplementation(async (_key, id: string) => channel(id));
    getChannelVideosMock.mockImplementation(async (_key, id: string) =>
      id === "UC1"
        ? [video("a", 100), video("b", 200), video("c", 50)]
        : [video("d", 1000), video("e", 500)]
    );

    const res = await GET("http://x/api/compare?ids=UC1,UC2");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].channel.id).toBe("UC1");
    expect(body.rows[0].videoCount).toBe(3);
    expect(body.rows[0].topVideos[0].id).toBe("b");
  });

  it("returns 404 when fewer than the minimum channels can be resolved", async () => {
    setTestCookie("yt_api_key", KEY);
    getChannelByIdMock.mockImplementation(async (_key, id: string) =>
      id === "UC1" ? channel("UC1") : null
    );
    getChannelVideosMock.mockResolvedValue([]);

    const res = await GET("http://x/api/compare?ids=UC1,UC2");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/resolve enough/);
  });

  it("propagates YouTubeQuotaExceededError as 429", async () => {
    setTestCookie("yt_api_key", KEY);
    const { YouTubeQuotaExceededError } = await import("@/lib/errors");
    getChannelByIdMock.mockRejectedValue(new YouTubeQuotaExceededError());
    getChannelVideosMock.mockResolvedValue([]);

    const res = await GET("http://x/api/compare?ids=UC1,UC2");
    expect(res.status).toBe(429);
  });

  it("propagates YouTubeInvalidApiKeyError as 400", async () => {
    setTestCookie("yt_api_key", KEY);
    const { YouTubeInvalidApiKeyError } = await import("@/lib/errors");
    getChannelByIdMock.mockRejectedValue(new YouTubeInvalidApiKeyError());
    getChannelVideosMock.mockResolvedValue([]);

    const res = await GET("http://x/api/compare?ids=UC1,UC2");
    expect(res.status).toBe(400);
  });

  it("returns 500 for any other thrown error", async () => {
    setTestCookie("yt_api_key", KEY);
    getChannelByIdMock.mockRejectedValue(new Error("boom"));
    getChannelVideosMock.mockResolvedValue([]);

    const res = await GET("http://x/api/compare?ids=UC1,UC2");
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Failed to load/);
  });
});
