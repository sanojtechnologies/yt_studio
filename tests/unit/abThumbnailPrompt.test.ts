import { describe, expect, it, vi } from "vitest";
import {
  AB_THUMBNAIL_LIMITS,
  AB_THUMBNAIL_SCHEMA,
  buildAbThumbnailPrompt,
  decodeUploadedImage,
  fetchImageFromUrl,
} from "@/lib/abThumbnailPrompt";

describe("buildAbThumbnailPrompt", () => {
  it("omits the title line when no title is supplied", () => {
    expect(buildAbThumbnailPrompt()).not.toContain("Video title");
  });

  it("appends the title line when provided", () => {
    const prompt = buildAbThumbnailPrompt("How to ship");
    expect(prompt).toContain("Video title (context): How to ship");
  });
});

describe("AB_THUMBNAIL_SCHEMA", () => {
  it("requires winner, verdict, axis scores, and improvements", () => {
    expect(AB_THUMBNAIL_SCHEMA.required).toEqual([
      "winnerIndex",
      "verdict",
      "axisScores",
      "improvements",
    ]);
  });
});

function jpegResponse(size = 8) {
  const buffer = new Uint8Array(size);
  return new Response(buffer.buffer, {
    status: 200,
    headers: { "content-type": "image/jpeg" },
  });
}

describe("fetchImageFromUrl", () => {
  it("rejects non-http URLs", async () => {
    await expect(fetchImageFromUrl("ftp://example.com/x.jpg")).rejects.toThrow(/Invalid image URL/);
  });

  it("rejects non-ok responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(
      fetchImageFromUrl("https://e/x.jpg", fetchImpl as unknown as typeof fetch)
    ).rejects.toThrow(/Failed to fetch image/);
  });

  it("rejects unsupported image types", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]).buffer, {
        status: 200,
        headers: { "content-type": "image/bmp" },
      })
    );
    await expect(
      fetchImageFromUrl("https://e/x.bmp", fetchImpl as unknown as typeof fetch)
    ).rejects.toThrow(/Unsupported image type/);
  });

  it("rejects oversize images", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jpegResponse(AB_THUMBNAIL_LIMITS.maxBytes + 1));
    await expect(
      fetchImageFromUrl("https://e/big.jpg", fetchImpl as unknown as typeof fetch)
    ).rejects.toThrow(/size limit/);
  });

  it("returns base64 + mimeType on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jpegResponse(8));
    const result = await fetchImageFromUrl(
      "https://e/x.jpg",
      fetchImpl as unknown as typeof fetch
    );
    expect(result.mimeType).toBe("image/jpeg");
    expect(typeof result.base64).toBe("string");
    expect(result.base64.length).toBeGreaterThan(0);
  });

  it("falls back to image/jpeg when content-type header is missing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2]).buffer, { status: 200 })
    );
    const result = await fetchImageFromUrl(
      "https://e/x.jpg",
      fetchImpl as unknown as typeof fetch
    );
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("uses global fetch when no impl passed", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(jpegResponse(4)) as unknown as typeof fetch;
    try {
      const result = await fetchImageFromUrl("https://e/x.jpg");
      expect(result.mimeType).toBe("image/jpeg");
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("decodeUploadedImage", () => {
  it("rejects unsupported mime types", async () => {
    const file = new File([new Uint8Array([0])], "x.bmp", { type: "image/bmp" });
    await expect(decodeUploadedImage(file)).rejects.toThrow(/Unsupported/);
  });

  it("rejects oversize files", async () => {
    const big = new Uint8Array(AB_THUMBNAIL_LIMITS.maxBytes + 1);
    const file = new File([big], "x.jpg", { type: "image/jpeg" });
    await expect(decodeUploadedImage(file)).rejects.toThrow(/size limit/);
  });

  it("returns base64 + mimeType when valid", async () => {
    const small = new Uint8Array([1, 2, 3, 4]);
    const file = new File([small], "x.jpg", { type: "image/jpeg" });
    const decoded = await decodeUploadedImage(file);
    expect(decoded.mimeType).toBe("image/jpeg");
    expect(decoded.base64).toBe(Buffer.from(small).toString("base64"));
  });

  it("defaults mime to image/jpeg when File.type is empty", async () => {
    const small = new Uint8Array([1, 2]);
    const file = new File([small], "x", { type: "" });
    const decoded = await decodeUploadedImage(file);
    expect(decoded.mimeType).toBe("image/jpeg");
  });
});
