import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestCookie } from "../utils/cookies";

const { getChannelVideosMock, embedContentMock } = vi.hoisted(() => ({
  getChannelVideosMock: vi.fn(),
  embedContentMock: vi.fn(),
}));

vi.mock("@/lib/youtube", () => ({
  getChannelById: vi.fn(),
  getChannelByHandle: vi.fn(),
  getChannelVideos: getChannelVideosMock,
  getVideoDetails: vi.fn(),
}));

vi.mock("@/lib/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gemini")>();
  return {
    ...actual,
    getGeminiClient: vi.fn(() => ({
      models: { embedContent: embedContentMock },
    })),
  };
});

const YT_KEY = "AIzaClustersYT1234567890";
const GEMINI_KEY = "AIzaClustersGemini1234567890";

async function POST(body: unknown) {
  const { POST } = await import("@/app/api/studio/clusters/route");
  const init: RequestInit =
    body === undefined
      ? { method: "POST" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        };
  return POST(new Request("http://x/api/studio/clusters", init));
}

function video(id: string, title: string) {
  return {
    id,
    title,
    description: "",
    publishedAt: "2025-01-01T00:00:00Z",
    duration: "PT5M",
    viewCount: 100,
    likeCount: 0,
    commentCount: 0,
  };
}

beforeEach(() => {
  getChannelVideosMock.mockReset();
  embedContentMock.mockReset();
});

describe("POST /api/studio/clusters", () => {
  it("returns 401 when YouTube key cookie is missing", async () => {
    expect((await POST({ channelId: "UC1" })).status).toBe(401);
  });

  it("returns 401 when Gemini key cookie is missing", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    expect((await POST({ channelId: "UC1" })).status).toBe(401);
  });

  it("returns 400 on malformed JSON body", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    expect((await POST("{nope")).status).toBe(400);
  });

  it("returns 400 when channelId is missing", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    expect((await POST({ channelId: "  " })).status).toBe(400);
  });

  it("propagates YouTubeQuotaExceededError as 429", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const { YouTubeQuotaExceededError } = await import("@/lib/errors");
    getChannelVideosMock.mockRejectedValueOnce(new YouTubeQuotaExceededError());
    expect((await POST({ channelId: "UC1" })).status).toBe(429);
  });

  it("propagates YouTubeInvalidApiKeyError as 400", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const { YouTubeInvalidApiKeyError } = await import("@/lib/errors");
    getChannelVideosMock.mockRejectedValueOnce(new YouTubeInvalidApiKeyError());
    expect((await POST({ channelId: "UC1" })).status).toBe(400);
  });

  it("returns 500 for any other YouTube error", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    getChannelVideosMock.mockRejectedValueOnce(new Error("boom"));
    expect((await POST({ channelId: "UC1" })).status).toBe(500);
  });

  it("returns 422 when fewer than 2 videos have titles", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    getChannelVideosMock.mockResolvedValueOnce([video("a", "")]);
    const res = await POST({ channelId: "UC1" });
    expect(res.status).toBe(422);
  });

  it("returns 502 when the embedding service rejects", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    getChannelVideosMock.mockResolvedValueOnce([video("a", "x"), video("b", "y")]);
    embedContentMock.mockRejectedValueOnce(new Error("embed boom"));
    const res = await POST({ channelId: "UC1" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/embed/i);
  });

  it("returns 502 when the embedding service yields no usable vectors", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    getChannelVideosMock.mockResolvedValueOnce([video("a", "x"), video("b", "y")]);
    embedContentMock.mockResolvedValueOnce({ embeddings: [{ values: [] }, { values: [] }] });
    const res = await POST({ channelId: "UC1" });
    expect(res.status).toBe(502);
  });

  it("returns clusters when embeddings come back cleanly", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    getChannelVideosMock.mockResolvedValueOnce([
      video("a", "Build SaaS"),
      video("b", "Ship SaaS"),
      video("c", "Cook ramen"),
      video("d", "Cook curry"),
    ]);
    embedContentMock.mockResolvedValueOnce({
      embeddings: [
        { values: [1, 0, 0] },
        { values: [0.99, 0.01, 0] },
        { values: [0, 1, 0] },
        { values: [0, 0.99, 0.01] },
      ],
    });

    const res = await POST({ channelId: "UC1", desiredClusters: 2 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clusters).toHaveLength(2);
    const totals = body.clusters.reduce(
      (acc: number, c: { totalVideos: number }) => acc + c.totalVideos,
      0
    );
    expect(totals).toBe(4);
  });

  it("falls back to an empty embedding when the response is short of titles", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    getChannelVideosMock.mockResolvedValueOnce([
      video("a", "x"),
      video("b", "y"),
      video("c", "z"),
    ]);
    embedContentMock.mockResolvedValueOnce({
      // Only two embeddings for three titles — third item should default to []
      // and be filtered out, exercising the `embeddings[idx] ?? []` branch.
      embeddings: [{ values: [1, 0] }, { values: [0, 1] }],
    });
    const res = await POST({ channelId: "UC1", desiredClusters: 2 });
    expect(res.status).toBe(200);
  });

  it("uses the default cluster count when none is supplied", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    getChannelVideosMock.mockResolvedValueOnce([
      video("a", "x"),
      video("b", "y"),
      video("c", "z"),
    ]);
    embedContentMock.mockResolvedValueOnce({
      embeddings: [
        { values: [1, 0] },
        { values: [0, 1] },
        { values: [1, 1] },
      ],
    });
    const res = await POST({ channelId: "UC1" });
    expect(res.status).toBe(200);
  });
});
