import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestCookie } from "../utils/cookies";
import { assertThumbnailAnalysis } from "../utils/schemas";

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

const GEMINI = "AIzaGeminiFake0987654321";

async function POST(body: unknown) {
  const { POST } = await import("@/app/api/thumbnail/file/route");
  return POST(
    new Request("http://x/api/thumbnail/file", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

function validBody() {
  return {
    videoId: "draft-1",
    title: "Draft thumbnail",
    mimeType: "image/png",
    imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
  };
}

beforeEach(() => {
  generateContentMock.mockReset();
});

describe("POST /api/thumbnail/file", () => {
  it("returns 401 when Gemini key is missing", async () => {
    const res = await POST(validBody());
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    const res = await POST("not-json");
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    const res = await POST({ videoId: "x" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for unsupported mime type", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    const res = await POST({ ...validBody(), mimeType: "image/gif" });
    expect(res.status).toBe(400);
  });

  it("returns parsed analysis when model output is valid JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    const analysis = {
      faceEmotionDetection: "No face",
      textReadabilityScore: 8,
      colorContrastAssessment: "Good",
      titleCuriosityGapScore: 7,
      improvementSuggestions: ["A", "B", "C"],
    };
    generateContentMock.mockResolvedValueOnce({ text: JSON.stringify(analysis) });

    const res = await POST(validBody());
    expect(res.status).toBe(200);
    assertThumbnailAnalysis(await res.json());
  });

  it("returns 502 with debug info when model text is empty", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({
      text: "",
      candidates: [{ finishReason: "MAX_TOKENS", safetyRatings: [] }],
    });
    const res = await POST(validBody());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.debug?.finishReason).toBe("MAX_TOKENS");
  });

  it("returns 502 with raw payload on malformed JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({ text: "{bad" });
    const res = await POST(validBody());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.raw).toBe("{bad");
  });
});
