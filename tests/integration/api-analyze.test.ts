import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestCookie } from "../utils/cookies";
import { assertAnalyzeResponse } from "../utils/schemas";

const { getChannelVideosMock, generateContentStreamMock } = vi.hoisted(() => ({
  getChannelVideosMock: vi.fn(),
  generateContentStreamMock: vi.fn(),
}));

vi.mock("@/lib/youtube", () => ({
  getChannelVideos: getChannelVideosMock,
  getChannelById: vi.fn(),
  getChannelByHandle: vi.fn(),
  getVideoDetails: vi.fn(),
}));

vi.mock("@/lib/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gemini")>(
    "@/lib/gemini"
  );
  return {
    ...actual,
    getGeminiClient: () => ({
      models: {
        generateContentStream: generateContentStreamMock,
        generateContent: vi.fn(),
      },
    }),
  };
});

const YT = "AIzaYouTubeFake12345";
const GEMINI = "AIzaGeminiFake67890";

async function POST(body: unknown) {
  const { POST } = await import("@/app/api/analyze/route");
  return POST(
    new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

function makeVideo(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    title: "Video",
    description: "",
    publishedAt: "2025-01-06T00:00:00Z",
    duration: "PT10M",
    viewCount: 100,
    likeCount: 10,
    commentCount: 5,
    ...overrides,
  };
}

async function drainNdjson(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function* streamChunks(chunks: string[]) {
  for (const text of chunks) {
    yield { text };
  }
}

beforeEach(() => {
  getChannelVideosMock.mockReset();
  generateContentStreamMock.mockReset();
});

describe("POST /api/analyze", () => {
  it("returns 401 when the YouTube key is missing", async () => {
    const res = await POST({ channelId: "UCabc" });
    expect(res.status).toBe(401);
  });

  it("returns 401 when the Gemini key is missing", async () => {
    setTestCookie("yt_api_key", YT);
    const res = await POST({ channelId: "UCabc" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when the body is not valid JSON", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEMINI);
    const res = await POST("not-json");
    expect(res.status).toBe(400);
  });

  it("returns 400 when channelId is missing", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEMINI);
    const res = await POST({});
    expect(res.status).toBe(400);
  });

  it("returns 429 when the video fetch hits quota", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEMINI);
    const { YouTubeQuotaExceededError } = await import("@/lib/errors");
    getChannelVideosMock.mockRejectedValueOnce(new YouTubeQuotaExceededError());
    const res = await POST({ channelId: "UCabc" });
    expect(res.status).toBe(429);
  });

  it("returns 400 when the video fetch hits an invalid-key error", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEMINI);
    const { YouTubeInvalidApiKeyError } = await import("@/lib/errors");
    getChannelVideosMock.mockRejectedValueOnce(new YouTubeInvalidApiKeyError());
    const res = await POST({ channelId: "UCabc" });
    expect(res.status).toBe(400);
  });

  it("returns 500 for any other video fetch error", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEMINI);
    getChannelVideosMock.mockRejectedValueOnce(new Error("network"));
    const res = await POST({ channelId: "UCabc" });
    expect(res.status).toBe(500);
  });

  it("streams meta + chunks + final JSON when Gemini yields a schema-conforming payload", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEMINI);
    getChannelVideosMock.mockResolvedValueOnce([makeVideo(), makeVideo({ id: "v2" })]);

    const payload = {
      topPatternsThatWork: ["a", "b", "c"],
      topUnderperformingPatterns: ["d", "e", "f"],
      contentGapSuggestions: ["g", "h", "i", "j", "k"],
      optimalPostingSchedule: {
        bestDays: ["Monday"],
        bestTimeWindows: ["18:00-20:00"],
        recommendedFrequency: "1/week",
        rationale: "because",
      },
    };
    const serialized = JSON.stringify(payload);
    generateContentStreamMock.mockResolvedValueOnce(
      streamChunks([serialized.slice(0, 20), serialized.slice(20)])
    );

    const res = await POST({ channelId: "UCabc" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/x-ndjson/);

    const lines = await drainNdjson(res);
    expect(lines[0]).toEqual({ type: "meta", channelId: "UCabc" });
    const chunkLines = lines.filter((line) => line.type === "chunk");
    expect(chunkLines.length).toBeGreaterThan(0);

    const finalLine = lines.find((line) => line.type === "final");
    expect(finalLine).toBeTruthy();
    assertAnalyzeResponse((finalLine as { data: unknown }).data);
  });

  it("yields a final line with raw text when Gemini emits non-JSON", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEMINI);
    getChannelVideosMock.mockResolvedValueOnce([makeVideo()]);
    generateContentStreamMock.mockResolvedValueOnce(streamChunks(["not-json"]));

    const res = await POST({ channelId: "UCabc" });
    const lines = await drainNdjson(res);
    const finalLine = lines.find((line) => line.type === "final") as {
      data: { raw?: string };
    };
    expect(finalLine?.data?.raw).toBe("not-json");
  });

  it("reports a streaming error line when the Gemini iterator throws", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEMINI);
    getChannelVideosMock.mockResolvedValueOnce([makeVideo()]);

    async function* failing() {
      yield { text: "{" };
      throw new Error("boom");
    }
    generateContentStreamMock.mockResolvedValueOnce(failing());

    const res = await POST({ channelId: "UCabc" });
    const lines = await drainNdjson(res);
    const errorLine = lines.find((line) => line.type === "error");
    expect(errorLine).toMatchObject({ type: "error", error: "boom" });
  });

  // Closes the `if (!text) continue` branch — empty/undefined text chunks must
  // not appear as `{ type: "chunk" }` lines.
  it("skips empty-text chunks without emitting a chunk line", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEMINI);
    getChannelVideosMock.mockResolvedValueOnce([makeVideo()]);

    async function* emptyThenReal() {
      yield { text: "" };
      yield { text: undefined };
      yield { text: '{"topPatternsThatWork":[]}' };
    }
    generateContentStreamMock.mockResolvedValueOnce(emptyThenReal());

    const res = await POST({ channelId: "UCabc" });
    const lines = await drainNdjson(res);
    const chunkLines = lines.filter((line) => line.type === "chunk");
    expect(chunkLines).toHaveLength(1);
    expect((chunkLines[0] as { text: string }).text).toBe('{"topPatternsThatWork":[]}');
  });

  // Closes the `error instanceof Error ? ... : "Analysis failed"` false branch
  // — thrown values that aren't Error instances still produce a safe message.
  it("falls back to 'Analysis failed' when a non-Error is thrown from the iterator", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEMINI);
    getChannelVideosMock.mockResolvedValueOnce([makeVideo()]);

    async function* throwsString() {
      yield { text: "x" };
      throw "not-an-error-instance";
    }
    generateContentStreamMock.mockResolvedValueOnce(throwsString());

    const res = await POST({ channelId: "UCabc" });
    const lines = await drainNdjson(res);
    const errorLine = lines.find((line) => line.type === "error");
    expect(errorLine).toMatchObject({ type: "error", error: "Analysis failed" });
  });
});
