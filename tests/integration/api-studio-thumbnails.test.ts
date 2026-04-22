import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestCookie } from "../utils/cookies";

const { generateImagesMock, generateContentMock } = vi.hoisted(() => ({
  generateImagesMock: vi.fn(),
  generateContentMock: vi.fn(),
}));

vi.mock("@/lib/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gemini")>();
  return {
    ...actual,
    getGeminiClient: vi.fn(() => ({
      models: {
        generateImages: generateImagesMock,
        generateContent: generateContentMock,
      },
    })),
  };
});

const KEY = "AIzaThumbsGen1234567890";
const MODEL = "imagen-4.0-generate-001";
const ORIGINAL_MODEL = process.env.THUMBNAIL_IMAGE_MODEL;

async function POST(body: unknown) {
  vi.resetModules();
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
  generateImagesMock.mockReset();
  generateContentMock.mockReset();
  process.env.THUMBNAIL_IMAGE_MODEL = MODEL;
});

afterEach(() => {
  if (ORIGINAL_MODEL === undefined) {
    delete process.env.THUMBNAIL_IMAGE_MODEL;
  } else {
    process.env.THUMBNAIL_IMAGE_MODEL = ORIGINAL_MODEL;
  }
});

const inlineImage = (data: string) => ({
  generatedImages: [
    {
      image: { imageBytes: data, mimeType: "image/png" },
    },
  ],
});

describe("POST /api/studio/thumbnails", () => {
  it("returns 401 when Gemini key cookie is missing", async () => {
    expect((await POST({ prompt: "x" })).status).toBe(401);
  });

  it("uses default model when THUMBNAIL_IMAGE_MODEL is missing", async () => {
    setTestCookie("gemini_api_key", KEY);
    delete process.env.THUMBNAIL_IMAGE_MODEL;
    generateContentMock.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: "DATA", mimeType: "image/png" } }],
          },
        },
      ],
    });
    const res = await POST({ prompt: "x", variantCount: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.modelUsed).toBe("gemini-3.1-flash-image-preview");
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
    generateImagesMock
      .mockResolvedValueOnce(inlineImage("AAAA"))
      .mockResolvedValueOnce(inlineImage("BBBB"));

    const res = await POST({ prompt: "test", variantCount: 2 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.variants).toHaveLength(2);
    expect(body.variants[0].dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(body.promptUsed).toContain("test");
    expect(body.modelUsed).toBeTruthy();
  });

  it("defaults generated image mimeType to image/png when omitted", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateImagesMock.mockResolvedValueOnce({
      generatedImages: [{ image: { imageBytes: "AAAA" } }],
    });
    const res = await POST({ prompt: "test", variantCount: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.variants[0].mimeType).toBe("image/png");
    expect(body.variants[0].dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("uses generateContent for gemini image-preview models", async () => {
    setTestCookie("gemini_api_key", KEY);
    process.env.THUMBNAIL_IMAGE_MODEL = "gemini-3.1-flash-image-preview";
    generateContentMock.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: "AAAA", mimeType: "image/png" } }],
          },
        },
      ],
    });
    const res = await POST({ prompt: "test", variantCount: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.modelUsed).toBe("gemini-3.1-flash-image-preview");
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(generateImagesMock).not.toHaveBeenCalled();
  });

  it("uses the default variant count when not supplied", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateImagesMock.mockResolvedValue(inlineImage("DATA"));
    const res = await POST({ prompt: "test" });
    expect(res.status).toBe(200);
    expect(generateImagesMock).toHaveBeenCalledTimes(3);
  });

  it("threads channelStyle and styleHint into the prompt body", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateImagesMock.mockResolvedValue(inlineImage("DATA"));
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
    generateImagesMock.mockRejectedValueOnce(new Error("model down"));
    const res = await POST({ prompt: "test", variantCount: 1 });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Image generation failed");
    expect(body.detail).toContain("model down");
  });

  it("extracts message from non-Error provider payloads", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateImagesMock.mockRejectedValueOnce({
      error: { code: 404, message: "model slug unavailable", status: "NOT_FOUND" },
    });
    const res = await POST({ prompt: "test", variantCount: 1 });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Image generation failed");
    expect(body.detail).toContain("model slug unavailable");
  });

  it("returns detail when provider throws a string payload", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateImagesMock.mockRejectedValueOnce("upstream unavailable");
    const res = await POST({ prompt: "test", variantCount: 1 });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.detail).toContain("upstream unavailable");
  });

  it("falls back to Unknown error detail for unserializable provider payloads", async () => {
    setTestCookie("gemini_api_key", KEY);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    generateImagesMock.mockRejectedValueOnce(circular);
    const res = await POST({ prompt: "test", variantCount: 1 });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.detail).toBe("Unknown error");
  });

  it("falls back to Unknown error detail for primitive non-string payloads", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateImagesMock.mockRejectedValueOnce(12345);
    const res = await POST({ prompt: "test", variantCount: 1 });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.detail).toBe("Unknown error");
  });

  it("returns 502 when configured model slug is not found", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateImagesMock
      .mockRejectedValueOnce(new Error("models/gemini-3-pro-image-preview is not found"));

    const res = await POST({ prompt: "test", variantCount: 1 });
    expect(res.status).toBe(502);
    expect(generateImagesMock).toHaveBeenCalledTimes(1);
  });

  it("returns 502 when no inline images come back", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateImagesMock.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: "no images for you" }] } }],
    });
    const res = await POST({ prompt: "test", variantCount: 1 });
    expect(res.status).toBe(502);
  });

  it("clamps variant count above the documented max", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateImagesMock.mockResolvedValue(inlineImage("DATA"));
    const res = await POST({ prompt: "test", variantCount: 99 });
    expect(res.status).toBe(200);
    expect(generateImagesMock).toHaveBeenCalledTimes(3);
  });

  it("treats a non-positive variantCount by clamping up to 1", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateImagesMock.mockResolvedValue(inlineImage("DATA"));
    const res = await POST({ prompt: "test", variantCount: 0 });
    expect(res.status).toBe(200);
    expect(generateImagesMock).toHaveBeenCalledTimes(1);
  });

  it("treats a candidate-less response as no images (defensive ?? branch)", async () => {
    setTestCookie("gemini_api_key", KEY);
    // First call yields nothing (no candidates / no parts); second call yields
    // an actual image. Together they exercise both `?? []` fallbacks in
    // extractImages without failing the route.
    generateImagesMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ candidates: [{}] })
      .mockResolvedValueOnce(inlineImage("OK"));
    const res = await POST({ prompt: "test", variantCount: 3 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.variants).toHaveLength(1);
  });

  it("ignores generated images without imageBytes and keeps valid inline parts", async () => {
    setTestCookie("gemini_api_key", KEY);
    generateImagesMock.mockResolvedValueOnce({
      generatedImages: [{ image: {} }],
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: "OK", mimeType: "image/png" } }],
          },
        },
      ],
    });
    const res = await POST({ prompt: "test", variantCount: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.variants).toHaveLength(1);
  });
});
