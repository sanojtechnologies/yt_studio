import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestCookie } from "../utils/cookies";

const { generateContentMock } = vi.hoisted(() => ({ generateContentMock: vi.fn() }));

vi.mock("@/lib/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gemini")>();
  return {
    ...actual,
    getGeminiClient: vi.fn(() => ({ models: { generateContent: generateContentMock } })),
  };
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const GEMINI_KEY = "AIzaAbThumbFake1234567890";

function jpegResponse(size = 8) {
  return new Response(new Uint8Array(size).buffer, {
    status: 200,
    headers: { "content-type": "image/jpeg" },
  });
}

async function POST(init: RequestInit) {
  const { POST } = await import("@/app/api/studio/ab-thumbnail/route");
  return POST(new Request("http://x/api/studio/ab-thumbnail", init));
}

function jsonBody(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function multipartBody(fields: Record<string, File | string>): RequestInit {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    form.append(k, v);
  }
  return { method: "POST", body: form };
}

const SAMPLE = {
  winnerIndex: 1,
  verdict: "Thumbnail B has stronger contrast and clearer face focus.",
  axisScores: [
    { axis: "faceImpact", a: 6, b: 9 },
    { axis: "readability", a: 5, b: 8 },
    { axis: "contrast", a: 5, b: 9 },
    { axis: "curiosityGap", a: 7, b: 8 },
  ],
  improvements: ["Increase text contrast", "Add a visible face", "Zoom on subject"],
};

beforeEach(() => {
  fetchMock.mockReset();
  generateContentMock.mockReset();
});

describe("POST /api/studio/ab-thumbnail", () => {
  it("returns 401 when Gemini key is missing", async () => {
    const res = await POST(jsonBody({ imageUrlA: "https://e/a.jpg", imageUrlB: "https://e/b.jpg" }));
    expect(res.status).toBe(401);
  });

  it("rejects an unsupported content-type", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "nope",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a request with no content-type header", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const request = new Request("http://x/api/studio/ab-thumbnail", { method: "POST" });
    request.headers.delete("content-type");
    const { POST } = await import("@/app/api/studio/ab-thumbnail/route");
    const res = await POST(request);
    expect(res.status).toBe(400);
  });

  it("ignores whitespace-only title fields", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    fetchMock.mockImplementation(() => Promise.resolve(jpegResponse()));
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(SAMPLE),
      candidates: [{ content: { parts: [{ text: JSON.stringify(SAMPLE) }] } }],
    });
    const res = await POST(
      jsonBody({
        imageUrlA: "https://e/a.jpg",
        imageUrlB: "https://e/b.jpg",
        title: "   ",
      })
    );
    expect(res.status).toBe(200);
  });

  it("rejects malformed JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST(jsonBody("{"));
    expect(res.status).toBe(400);
  });

  it("rejects missing URLs", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST(jsonBody({ imageUrlA: "https://e/a.jpg" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid URLs", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST(
      jsonBody({ imageUrlA: "not-a-url", imageUrlB: "https://e/b.jpg" })
    );
    expect(res.status).toBe(400);
  });

  it("happy path via URL pair returns parsed JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    fetchMock.mockImplementation(() => Promise.resolve(jpegResponse()));
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(SAMPLE),
      candidates: [{ content: { parts: [{ text: JSON.stringify(SAMPLE) }] } }],
    });
    const res = await POST(
      jsonBody({
        imageUrlA: "https://e/a.jpg",
        imageUrlB: "https://e/b.jpg",
        title: "How to ship",
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SAMPLE);
  });

  it("happy path via multipart returns parsed JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(SAMPLE),
      candidates: [{ content: { parts: [{ text: JSON.stringify(SAMPLE) }] } }],
    });
    const fileA = new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" });
    const fileB = new File([new Uint8Array([4, 5, 6])], "b.jpg", { type: "image/jpeg" });
    const res = await POST(multipartBody({ imageA: fileA, imageB: fileB }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SAMPLE);
  });

  it("rejects multipart with missing file parts", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const fileA = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
    const res = await POST(multipartBody({ imageA: fileA, imageB: "not a file" }));
    expect(res.status).toBe(400);
  });

  it("rejects multipart with unsupported image type", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const fileA = new File([new Uint8Array([1])], "a.bmp", { type: "image/bmp" });
    const fileB = new File([new Uint8Array([1])], "b.jpg", { type: "image/jpeg" });
    const res = await POST(multipartBody({ imageA: fileA, imageB: fileB }));
    expect(res.status).toBe(400);
  });

  it("returns 502 when Gemini throws", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    fetchMock.mockImplementation(() => Promise.resolve(jpegResponse()));
    generateContentMock.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(
      jsonBody({ imageUrlA: "https://e/a.jpg", imageUrlB: "https://e/b.jpg" })
    );
    expect(res.status).toBe(502);
  });

  it("returns 502 on empty response", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    fetchMock.mockImplementation(() => Promise.resolve(jpegResponse()));
    generateContentMock.mockResolvedValueOnce({
      text: "",
      candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }],
    });
    const res = await POST(
      jsonBody({ imageUrlA: "https://e/a.jpg", imageUrlB: "https://e/b.jpg" })
    );
    expect(res.status).toBe(502);
  });

  it("returns 502 when JSON parsing fails", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    fetchMock.mockImplementation(() => Promise.resolve(jpegResponse()));
    generateContentMock.mockResolvedValueOnce({
      text: "{not json",
      candidates: [{ content: { parts: [{ text: "{not json" }] } }],
    });
    const res = await POST(
      jsonBody({ imageUrlA: "https://e/a.jpg", imageUrlB: "https://e/b.jpg" })
    );
    expect(res.status).toBe(502);
  });

  it("rejects URL fetch failures with 400", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(null, { status: 500 }))
    );
    const res = await POST(
      jsonBody({ imageUrlA: "https://e/a.jpg", imageUrlB: "https://e/b.jpg" })
    );
    expect(res.status).toBe(400);
  });
});
