import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestCookie } from "../utils/cookies";

const { getChannelByIdMock, getChannelVideosMock, generateContentMock } = vi.hoisted(() => ({
  getChannelByIdMock: vi.fn(),
  getChannelVideosMock: vi.fn(),
  generateContentMock: vi.fn(),
}));

vi.mock("@/lib/youtube", () => ({
  getChannelById: getChannelByIdMock,
  getChannelByHandle: vi.fn(),
  getChannelVideos: getChannelVideosMock,
  getVideoDetails: vi.fn(),
}));

vi.mock("@/lib/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gemini")>();
  return {
    ...actual,
    getGeminiClient: vi.fn(() => ({ models: { generateContent: generateContentMock } })),
  };
});

const YT_KEY = "AIzaCompareGapYouTube1234567890";
const GEMINI_KEY = "AIzaCompareGapGemini1234567890";

async function GET(url: string) {
  const { GET } = await import("@/app/api/compare/gap/route");
  return GET(new Request(url));
}

function channel(id: string) {
  return {
    id,
    title: `Channel ${id}`,
    description: "",
    subscriberCount: 0,
    viewCount: 0,
  };
}

function video(id: string, views: number) {
  return {
    id,
    title: `Title ${id}`,
    description: "",
    publishedAt: "2025-01-01T00:00:00Z",
    duration: "PT5M",
    viewCount: views,
    likeCount: 0,
    commentCount: 0,
  };
}

const SAMPLE = {
  sharedTopics: ["React", "State management"],
  perChannelGaps: [
    { channelId: "UC1", missingTopics: ["Server components"], notes: "Go deeper on RSC." },
    { channelId: "UC2", missingTopics: ["Testing"], notes: "Almost no testing content." },
  ],
};

function primeHappyYouTube() {
  getChannelByIdMock.mockImplementation(async (_k, id: string) => channel(id));
  getChannelVideosMock.mockImplementation(async (_k, id: string) =>
    id === "UC1"
      ? [video("a", 1000), video("b", 500), video("c", 200)]
      : [video("d", 800), video("e", 400)]
  );
}

beforeEach(() => {
  getChannelByIdMock.mockReset();
  getChannelVideosMock.mockReset();
  generateContentMock.mockReset();
});

describe("GET /api/compare/gap", () => {
  it("returns 401 when YouTube key is missing", async () => {
    const res = await GET("http://x/api/compare/gap?ids=UC1,UC2");
    expect(res.status).toBe(401);
  });

  it("returns 401 when Gemini key is missing", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    const res = await GET("http://x/api/compare/gap?ids=UC1,UC2");
    expect(res.status).toBe(401);
  });

  it("returns 400 when fewer than 2 ids are provided", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await GET("http://x/api/compare/gap?ids=UC1");
    expect(res.status).toBe(400);
  });

  it("returns 400 when focus is too long", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const focus = "x".repeat(301);
    const res = await GET(
      `http://x/api/compare/gap?ids=UC1,UC2&focus=${encodeURIComponent(focus)}`
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when not enough channels resolve", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    getChannelByIdMock.mockImplementation(async (_k, id: string) =>
      id === "UC1" ? channel("UC1") : null
    );
    getChannelVideosMock.mockResolvedValue([]);
    const res = await GET("http://x/api/compare/gap?ids=UC1,UC2");
    expect(res.status).toBe(404);
  });

  it("propagates YouTubeQuotaExceededError as 429", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const { YouTubeQuotaExceededError } = await import("@/lib/errors");
    getChannelByIdMock.mockRejectedValue(new YouTubeQuotaExceededError());
    getChannelVideosMock.mockResolvedValue([]);
    const res = await GET("http://x/api/compare/gap?ids=UC1,UC2");
    expect(res.status).toBe(429);
  });

  it("propagates YouTubeInvalidApiKeyError as 400", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const { YouTubeInvalidApiKeyError } = await import("@/lib/errors");
    getChannelByIdMock.mockRejectedValue(new YouTubeInvalidApiKeyError());
    getChannelVideosMock.mockResolvedValue([]);
    const res = await GET("http://x/api/compare/gap?ids=UC1,UC2");
    expect(res.status).toBe(400);
  });

  it("returns 500 for generic YouTube failures", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    getChannelByIdMock.mockRejectedValue(new Error("boom"));
    getChannelVideosMock.mockResolvedValue([]);
    const res = await GET("http://x/api/compare/gap?ids=UC1,UC2");
    expect(res.status).toBe(500);
  });

  it("happy path returns parsed JSON and includes focus when provided", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    primeHappyYouTube();
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(SAMPLE),
      candidates: [{ content: { parts: [{ text: JSON.stringify(SAMPLE) }] } }],
    });
    const res = await GET("http://x/api/compare/gap?ids=UC1,UC2&focus=tutorials");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SAMPLE);
    const [{ contents }] = generateContentMock.mock.calls[0];
    expect(String(contents)).toContain("tutorials");
  });

  it("returns 502 when Gemini call throws", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    primeHappyYouTube();
    generateContentMock.mockRejectedValueOnce(new Error("bad gem"));
    const res = await GET("http://x/api/compare/gap?ids=UC1,UC2");
    expect(res.status).toBe(502);
  });

  it("returns 502 on empty response", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    primeHappyYouTube();
    generateContentMock.mockResolvedValueOnce({
      text: "",
      candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }],
    });
    const res = await GET("http://x/api/compare/gap?ids=UC1,UC2");
    expect(res.status).toBe(502);
  });

  it("returns 502 when Gemini returns invalid JSON", async () => {
    setTestCookie("yt_api_key", YT_KEY);
    setTestCookie("gemini_api_key", GEMINI_KEY);
    primeHappyYouTube();
    generateContentMock.mockResolvedValueOnce({
      text: "not json",
      candidates: [{ content: { parts: [{ text: "not json" }] } }],
    });
    const res = await GET("http://x/api/compare/gap?ids=UC1,UC2");
    expect(res.status).toBe(502);
  });
});
