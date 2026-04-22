import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestCookie } from "../utils/cookies";
import { assertThumbnailAnalysis } from "../utils/schemas";

const { generateContentMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
}));

vi.mock("@/lib/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gemini")>(
    "@/lib/gemini"
  );
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

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const GEMINI = "AIzaGeminiFake0987654321";

function jpegResponse() {
  return new Response(new Uint8Array([0xff, 0xd8, 0xff]).buffer, {
    status: 200,
    headers: { "content-type": "image/jpeg" },
  });
}

async function POST(body: unknown) {
  const { POST } = await import("@/app/api/thumbnail/route");
  return POST(
    new Request("http://x/api/thumbnail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

function defaultBody() {
  return {
    videoId: "abc",
    thumbnailUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
    title: "A thumbnail",
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  generateContentMock.mockReset();
});

describe("POST /api/thumbnail", () => {
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
    const res = await POST({ videoId: "abc" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when thumbnailUrl is not http(s)", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    const res = await POST({ ...defaultBody(), thumbnailUrl: "ftp://x" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the image fetch fails", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404 }));
    const res = await POST(defaultBody());
    expect(res.status).toBe(400);
  });

  it("returns 400 for unsupported content-type", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]).buffer, {
        status: 200,
        headers: { "content-type": "image/gif" },
      })
    );
    const res = await POST(defaultBody());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/image\/gif/);
  });

  it("returns the parsed analysis when Gemini returns valid JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    fetchMock.mockResolvedValueOnce(jpegResponse());

    const analysis = {
      faceEmotionDetection: "No face visible",
      textReadabilityScore: 7,
      colorContrastAssessment: "High contrast, reads well.",
      titleCuriosityGapScore: 6,
      improvementSuggestions: ["A", "B", "C"],
    };
    generateContentMock.mockResolvedValueOnce({ text: JSON.stringify(analysis) });

    const res = await POST(defaultBody());
    expect(res.status).toBe(200);
    const body = await res.json();
    assertThumbnailAnalysis(body);
  });

  // Closes the `content-type ?? "image/jpeg"` fallback branch — some CDNs omit
  // the header entirely and we still want to treat the bytes as JPEG.
  it("defaults to image/jpeg when the thumbnail response omits content-type", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([0xff, 0xd8, 0xff]).buffer, { status: 200 })
    );
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        faceEmotionDetection: "n/a",
        textReadabilityScore: 5,
        colorContrastAssessment: "ok",
        titleCuriosityGapScore: 5,
        improvementSuggestions: ["x", "y", "z"],
      }),
    });

    const res = await POST(defaultBody());
    expect(res.status).toBe(200);
    const callArgs = generateContentMock.mock.calls[0][0];
    const imagePart = callArgs.contents[0].parts[0];
    expect(imagePart.inlineData.mimeType).toBe("image/jpeg");
  });

  it("returns 502 with debug info when Gemini yields an empty response", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    fetchMock.mockResolvedValueOnce(jpegResponse());
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
    fetchMock.mockResolvedValueOnce(jpegResponse());
    generateContentMock.mockResolvedValueOnce({ text: "{oops" });

    const res = await POST(defaultBody());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.raw).toBe("{oops");
  });
});
