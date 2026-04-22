import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestCookie } from "../utils/cookies";

const { getChannelVideosMock, generateContentMock } = vi.hoisted(() => ({
  getChannelVideosMock: vi.fn(),
  generateContentMock: vi.fn(),
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
      models: { generateContent: generateContentMock },
    })),
  };
});

const YT_KEY = "AIzaTitlesYT1234567890";
const GEMINI_KEY = "AIzaTitlesGemini1234567890";

async function POST(body: unknown) {
  const { POST } = await import("@/app/api/studio/titles/route");
  const init: RequestInit =
    body === undefined
      ? { method: "POST" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        };
  return POST(new Request("http://x/api/studio/titles", init));
}

beforeEach(() => {
  getChannelVideosMock.mockReset();
  generateContentMock.mockReset();
});

const SAMPLE_RESPONSE = {
  channelStyleSummary: "Educational, calm",
  candidates: [
    {
      title: "How I shipped a SaaS in a weekend",
      rationale: "Concrete payoff",
      curiosityGapScore: 8,
      keywordStrengthScore: 7,
      alignmentWithChannelScore: 9,
      characterCount: 36,
      warnings: [],
    },
  ],
};

describe("POST /api/studio/titles", () => {
  it("returns 401 when the YouTube key cookie is missing", async () => {
    const res = await POST({ channelId: "UC1", topic: "x" });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/YouTube/);
  });

  it("returns 401 when the Gemini key cookie is missing", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    const res = await POST({ channelId: "UC1", topic: "x" });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/Gemini/);
  });

  it("returns 400 on malformed JSON body", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST("{not json");
    expect(res.status).toBe(400);
  });

  it("returns 400 when channelId is empty", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({ channelId: "  ", topic: "x" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/channelId/);
  });

  it("returns 400 when topic is empty", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({ channelId: "UC1", topic: "  " });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/topic/);
  });

  it("returns 400 when topic exceeds the documented limit", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({ channelId: "UC1", topic: "a".repeat(1000) });
    expect(res.status).toBe(400);
  });

  it("propagates YouTubeQuotaExceededError as 429", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const { YouTubeQuotaExceededError } = await import("@/lib/errors");
    getChannelVideosMock.mockRejectedValueOnce(new YouTubeQuotaExceededError());
    const res = await POST({ channelId: "UC1", topic: "x" });
    expect(res.status).toBe(429);
  });

  it("propagates YouTubeInvalidApiKeyError as 400", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const { YouTubeInvalidApiKeyError } = await import("@/lib/errors");
    getChannelVideosMock.mockRejectedValueOnce(new YouTubeInvalidApiKeyError());
    const res = await POST({ channelId: "UC1", topic: "x" });
    expect(res.status).toBe(400);
  });

  it("returns 500 for any other YouTube error", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    getChannelVideosMock.mockRejectedValueOnce(new Error("boom"));
    const res = await POST({ channelId: "UC1", topic: "x" });
    expect(res.status).toBe(500);
  });

  it("returns the parsed JSON when Gemini responds cleanly", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    getChannelVideosMock.mockResolvedValueOnce([
      {
        id: "v1",
        title: "Past hit",
        description: "",
        publishedAt: "2025-01-01T00:00:00Z",
        duration: "PT5M",
        viewCount: 1000,
        likeCount: 0,
        commentCount: 0,
      },
    ]);
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(SAMPLE_RESPONSE),
      candidates: [{ content: { parts: [{ text: JSON.stringify(SAMPLE_RESPONSE) }] } }],
    });

    const res = await POST({
      channelId: "UC1",
      topic: "monetisation",
      audience: "indies",
      desiredTone: "punchy",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SAMPLE_RESPONSE);
  });

  it("returns 502 when Gemini responds with empty text", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    getChannelVideosMock.mockResolvedValueOnce([]);
    generateContentMock.mockResolvedValueOnce({
      text: "",
      candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }],
    });
    const res = await POST({ channelId: "UC1", topic: "x" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/empty/);
  });

  it("returns 502 when Gemini text isn't valid JSON", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    getChannelVideosMock.mockResolvedValueOnce([]);
    generateContentMock.mockResolvedValueOnce({
      text: "{not json",
      candidates: [{ content: { parts: [{ text: "{not json" }] } }],
    });
    const res = await POST({ channelId: "UC1", topic: "x" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/valid JSON/);
  });
});
