import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestCookie } from "../utils/cookies";
import { assertMetadataAnalysis } from "../utils/schemas";
import { METADATA_LIMITS } from "@/lib/metadataPrompt";

const { generateContentMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
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

const GEMINI = "AIzaGeminiFakeVideoMeta123";

function defaultBody() {
  return {
    videoId: "vid_1",
    title: "How I grew to 1M subs",
    description: "Detailed story of what worked.",
    tags: ["youtube", "growth"],
  };
}

function defaultAnalysis() {
  return {
    overallScore: 7,
    titleFeedback: "Solid hook with room to sharpen.",
    titleSuggestions: ["A", "B", "C"],
    descriptionFeedback: "Good length; missing chapters.",
    descriptionSuggestions: ["Add hook", "Add chapters", "Add CTA"],
    tagsFeedback: "Reasonable coverage.",
    suggestedTags: ["youtube growth", "subs", "creators", "shorts", "algorithm"],
    topRecommendations: ["Sharpen title", "Add chapters", "Expand tags"],
  };
}

async function POST(body: unknown) {
  const { POST } = await import("@/app/api/video-metadata/route");
  return POST(
    new Request("http://x/api/video-metadata", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  generateContentMock.mockReset();
});

describe("POST /api/video-metadata", () => {
  it("returns 401 when the Gemini key is missing", async () => {
    const res = await POST(defaultBody());
    expect(res.status).toBe(401);
  });

  it("returns 400 for non-JSON body", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    const res = await POST("not-json");
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    expect((await POST({ videoId: "v" })).status).toBe(400);
    expect((await POST({ videoId: "v", title: "t" })).status).toBe(400);
    expect((await POST({ videoId: "v", description: "d" })).status).toBe(400);
  });

  it("returns 400 when title exceeds the maximum length", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    const res = await POST({
      ...defaultBody(),
      title: "x".repeat(METADATA_LIMITS.maxTitleLength + 1),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/title exceeds/i);
  });

  it("accepts an empty description (Shorts often have none)", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({ text: JSON.stringify(defaultAnalysis()) });
    const res = await POST({ ...defaultBody(), description: "" });
    expect(res.status).toBe(200);
  });

  it("returns the parsed analysis on success", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({ text: JSON.stringify(defaultAnalysis()) });
    const res = await POST(defaultBody());
    expect(res.status).toBe(200);
    assertMetadataAnalysis(await res.json());
  });

  it("truncates a description larger than the configured ceiling", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({ text: JSON.stringify(defaultAnalysis()) });
    const oversize = "y".repeat(METADATA_LIMITS.maxDescriptionLength + 100);
    await POST({ ...defaultBody(), description: oversize });

    const call = generateContentMock.mock.calls[0][0];
    const prompt: string = call.contents[0].parts[0].text;
    expect(prompt).toContain("y".repeat(METADATA_LIMITS.maxDescriptionLength).slice(0, 64));
    expect(prompt.length).toBeLessThan(METADATA_LIMITS.maxDescriptionLength + 2_000);
  });

  it("tolerates a missing tags field by defaulting to empty", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({ text: JSON.stringify(defaultAnalysis()) });
    const { tags: _tags, ...body } = defaultBody();
    void _tags;
    const res = await POST(body);
    expect(res.status).toBe(200);
    const prompt: string = generateContentMock.mock.calls[0][0].contents[0].parts[0].text;
    expect(prompt).toContain("(no tags set)");
  });

  it("returns 502 with debug info when Gemini yields an empty response", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({
      text: "",
      candidates: [{ finishReason: "MAX_TOKENS", safetyRatings: [] }],
    });
    const res = await POST(defaultBody());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/empty/i);
    expect(body.debug?.finishReason).toBe("MAX_TOKENS");
  });

  it("returns 502 with the raw text when Gemini returns malformed JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({ text: "{oops" });
    const res = await POST(defaultBody());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.raw).toBe("{oops");
  });
});
