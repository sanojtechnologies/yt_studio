import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestCookie } from "../utils/cookies";

const { generateContentMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
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

const KEY = "AIzaThumbsGen1234567890";

async function POST(body: unknown) {
  const { POST } = await import("@/app/api/studio/thumbnails/route");
  const init: RequestInit =
    body === undefined
      ? { method: "POST" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        };
  return POST(new Request("http://x/api/studio/thumbnails", init));
}

beforeEach(() => {
  generateContentMock.mockReset();
});

const inlineImage = (data: string) => ({
  candidates: [
    {
      content: {
        parts: [
          { inlineData: { data, mimeType: "image/png" } },
        ],
      },
    },
  ],
});

describe("POST /api/studio/thumbnails", () => {
  it("returns 401 when Gemini key cookie is missing", async () => {
    expect((await POST({ prompt: "x" })).status).toBe(401);
  });

  it("returns 400 on malformed JSON body", async () => {
    setTestCookie("gemini_api_key", KEY);
    expect((await POST("{nope")).status).toBe(400);
  });

  it("returns 400 when prompt is missing", async () => {
    setTestCookie("gemini_api_key", KEY);
    expect((await POST({ prompt: "  " })).status).toBe(400);
  });

  it("returns 400 when prompt is too long", async () => {
    setTestCookie("gemini_api_key", KEY);
    expect((await POST({ prompt: "a".repeat(1000) })).status).toBe(400);
  });

  it("returns variants as data URLs when the model returns inline images", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateContentMock
      .mockResolvedValueOnce(inlineImage("AAAA"))
      .mockResolvedValueOnce(inlineImage("BBBB"));

    const res = await POST({ prompt: "test", variantCount: 2 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.variants).toHaveLength(2);
    expect(body.variants[0].dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(body.promptUsed).toContain("test");
  });

  it("uses the default variant count when not supplied", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateContentMock.mockResolvedValue(inlineImage("DATA"));
    const res = await POST({ prompt: "test" });
    expect(res.status).toBe(200);
    expect(generateContentMock).toHaveBeenCalledTimes(3);
  });

  it("threads channelStyle and styleHint into the prompt body", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateContentMock.mockResolvedValue(inlineImage("DATA"));
    const res = await POST({
      prompt: "test",
      variantCount: 1,
      channelStyle: "Bold reds, big faces",
      styleHint: "high contrast",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.promptUsed).toContain("Bold reds");
    expect(body.promptUsed).toContain("high contrast");
  });

  it("returns 502 when image generation throws", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateContentMock.mockRejectedValueOnce(new Error("model down"));
    const res = await POST({ prompt: "test", variantCount: 1 });
    expect(res.status).toBe(502);
  });

  it("returns 502 when no inline images come back", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateContentMock.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: "no images for you" }] } }],
    });
    const res = await POST({ prompt: "test", variantCount: 1 });
    expect(res.status).toBe(502);
  });

  it("clamps variant count above the documented max", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateContentMock.mockResolvedValue(inlineImage("DATA"));
    const res = await POST({ prompt: "test", variantCount: 99 });
    expect(res.status).toBe(200);
    expect(generateContentMock).toHaveBeenCalledTimes(3);
  });

  it("treats a non-positive variantCount by clamping up to 1", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateContentMock.mockResolvedValue(inlineImage("DATA"));
    const res = await POST({ prompt: "test", variantCount: 0 });
    expect(res.status).toBe(200);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("treats a candidate-less response as no images (defensive ?? branch)", async () => {
    setTestCookie("gemini_api_key", KEY);
    // First call yields nothing (no candidates / no parts); second call yields
    // an actual image. Together they exercise both `?? []` fallbacks in
    // extractImages without failing the route.
    generateContentMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ candidates: [{}] })
      .mockResolvedValueOnce(inlineImage("OK"));
    const res = await POST({ prompt: "test", variantCount: 3 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.variants).toHaveLength(1);
  });
});
