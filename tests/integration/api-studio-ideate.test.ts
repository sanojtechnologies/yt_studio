import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestCookie } from "../utils/cookies";

const { fetchVideosForIdeationMock, buildVideoIdeateEvidenceMock, generateContentMock } = vi.hoisted(
  () => ({
    fetchVideosForIdeationMock: vi.fn(),
    buildVideoIdeateEvidenceMock: vi.fn(),
    generateContentMock: vi.fn(),
  })
);

vi.mock("@/lib/videoIdeate", () => ({
  fetchVideosForIdeation: fetchVideosForIdeationMock,
  buildVideoIdeateEvidence: buildVideoIdeateEvidenceMock,
}));

vi.mock("@/lib/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gemini")>("@/lib/gemini");
  return {
    ...actual,
    getGeminiClient: () => ({
      models: {
        generateContent: generateContentMock,
        generateContentStream: vi.fn(),
      },
    }),
  };
});

const YT = "AIzaYoutubeFake123456789";
const GEM = "AIzaGeminiFake123456789";

async function POST(body: unknown) {
  const { POST } = await import("@/app/api/studio/ideate/route");
  return POST(
    new Request("http://x/api/studio/ideate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  fetchVideosForIdeationMock.mockReset();
  buildVideoIdeateEvidenceMock.mockReset();
  generateContentMock.mockReset();
});

describe("POST /api/studio/ideate", () => {
  it("returns 401 when YouTube key missing", async () => {
    const res = await POST({ keywords: ["ai"] });
    expect(res.status).toBe(401);
  });

  it("returns 401 when Gemini key missing", async () => {
    setTestCookie("yt_api_key", YT);
    const res = await POST({ keywords: ["ai"] });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid json", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEM);
    const res = await POST("not-json");
    expect(res.status).toBe(400);
  });

  it("returns 400 when no valid keywords", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEM);
    const res = await POST({ keywords: [] });
    expect(res.status).toBe(400);
  });

  it("returns 502 when youtube fetch fails", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEM);
    fetchVideosForIdeationMock.mockRejectedValueOnce(new Error("yt fail"));
    const res = await POST({ keywords: ["ai"] });
    expect(res.status).toBe(502);
  });

  it("returns generic youtube fetch failure for non-Error throws", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEM);
    fetchVideosForIdeationMock.mockRejectedValueOnce("oops");
    const res = await POST({ keywords: ["ai"] });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("YouTube fetch failed");
  });

  it("returns 502 when gemini call fails", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEM);
    fetchVideosForIdeationMock.mockResolvedValueOnce([]);
    buildVideoIdeateEvidenceMock.mockReturnValueOnce({
      sampleSize: 0,
      windowDays: 30,
      topPhrases: [],
      keywordPerformance: [],
      topVideos: [],
      opportunitySignals: [],
      formatMix: { short: 0, long: 0 },
    });
    generateContentMock.mockRejectedValueOnce(new Error("gem fail"));
    const res = await POST({ keywords: ["ai"] });
    expect(res.status).toBe(502);
  });

  it("returns 502 when gemini text is empty", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEM);
    fetchVideosForIdeationMock.mockResolvedValueOnce([]);
    buildVideoIdeateEvidenceMock.mockReturnValueOnce({
      sampleSize: 0,
      windowDays: 30,
      topPhrases: [],
      keywordPerformance: [],
      topVideos: [],
      opportunitySignals: [],
      formatMix: { short: 0, long: 0 },
    });
    generateContentMock.mockResolvedValueOnce({ text: "" });
    const res = await POST({ keywords: ["ai"] });
    expect(res.status).toBe(502);
  });

  it("returns 502 for malformed json", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEM);
    fetchVideosForIdeationMock.mockResolvedValueOnce([]);
    buildVideoIdeateEvidenceMock.mockReturnValueOnce({
      sampleSize: 0,
      windowDays: 30,
      topPhrases: [],
      keywordPerformance: [],
      topVideos: [],
      opportunitySignals: [],
      formatMix: { short: 0, long: 0 },
    });
    generateContentMock.mockResolvedValueOnce({ text: "{bad" });
    const res = await POST({ keywords: ["ai"] });
    expect(res.status).toBe(502);
  });

  it("returns ideas and evidence on success", async () => {
    setTestCookie("yt_api_key", YT);
    setTestCookie("gemini_api_key", GEM);
    fetchVideosForIdeationMock.mockResolvedValueOnce([{ id: "v1" }]);
    buildVideoIdeateEvidenceMock.mockReturnValueOnce({
      sampleSize: 1,
      windowDays: 30,
      topPhrases: [],
      keywordPerformance: [],
      topVideos: [],
      opportunitySignals: ["signal"],
      formatMix: { short: 0, long: 1 },
    });
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: "Good",
        ideas: [
          {
            title: "Idea 1",
            hook: "Hook",
            whyNow: "why",
            keywordAngle: "angle",
            format: "long",
            confidence: "medium",
            supportingSignals: ["signal"],
          },
        ],
      }),
    });
    const res = await POST({ keywords: ["ai"], ideaCount: 4 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBe("Good");
    expect(body.evidence.sampleSize).toBe(1);
  });
});
