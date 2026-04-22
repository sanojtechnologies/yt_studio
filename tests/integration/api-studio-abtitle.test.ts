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

const GEMINI_KEY = "AIzaAbTitleFake1234567890";

async function POST(body: unknown) {
  const { POST } = await import("@/app/api/studio/ab-title/route");
  const init: RequestInit =
    body === undefined
      ? { method: "POST" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        };
  return POST(new Request("http://x/api/studio/ab-title", init));
}

const SAMPLE = {
  winnerIndex: 0,
  axes: [
    { axis: "clarity", a: 8, b: 7 },
    { axis: "curiosity", a: 9, b: 6 },
    { axis: "seo", a: 7, b: 8 },
    { axis: "clickability", a: 8, b: 7 },
  ],
  reasons: ["Title A frames a stronger contrast."],
};

beforeEach(() => {
  generateContentMock.mockReset();
});

describe("POST /api/studio/ab-title", () => {
  it("returns 401 when Gemini key is missing", async () => {
    const res = await POST({ titleA: "x", titleB: "y" });
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST("{");
    expect(res.status).toBe(400);
  });

  it("rejects missing titleA", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({ titleB: "y" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/titleA/);
  });

  it("rejects missing titleB", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({ titleA: "x" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/titleB/);
  });

  it("rejects overlong titles", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const resA = await POST({ titleA: "a".repeat(500), titleB: "y" });
    expect(resA.status).toBe(400);
    const resB = await POST({ titleA: "x", titleB: "b".repeat(500) });
    expect(resB.status).toBe(400);
  });

  it("rejects identical titles", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({ titleA: "same", titleB: "same" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/differ/);
  });

  it("rejects overlong audience", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({ titleA: "x", titleB: "y", audience: "a".repeat(5000) });
    expect(res.status).toBe(400);
  });

  it("rejects overlong channelContext", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({ titleA: "x", titleB: "y", channelContext: "c".repeat(5000) });
    expect(res.status).toBe(400);
  });

  it("returns parsed JSON on happy path", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(SAMPLE),
      candidates: [{ content: { parts: [{ text: JSON.stringify(SAMPLE) }] } }],
    });
    const res = await POST({
      titleA: "A",
      titleB: "B",
      audience: "devs",
      channelContext: "calm",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SAMPLE);
  });

  it("returns 502 on empty response", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    generateContentMock.mockResolvedValueOnce({
      text: "",
      candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }],
    });
    const res = await POST({ titleA: "A", titleB: "B" });
    expect(res.status).toBe(502);
  });

  it("returns 502 when Gemini text isn't JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    generateContentMock.mockResolvedValueOnce({
      text: "{not json",
      candidates: [{ content: { parts: [{ text: "{not json" }] } }],
    });
    const res = await POST({ titleA: "A", titleB: "B" });
    expect(res.status).toBe(502);
  });
});
