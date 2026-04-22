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

const GEMINI_KEY = "AIzaHookGemini1234567890";

async function POST(body: unknown) {
  const { POST } = await import("@/app/api/studio/hook/route");
  const init: RequestInit =
    body === undefined
      ? { method: "POST" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        };
  return POST(new Request("http://x/api/studio/hook", init));
}

beforeEach(() => {
  generateContentMock.mockReset();
});

const SAMPLE = {
  hooks: [
    { label: "Curiosity", hook: "Wait until you see this.", reasoning: "open loop", approxSeconds: 8 },
  ],
  description: "A 200-word description here.",
  tags: ["saas", "indie hacker"],
  chapters: [{ timestamp: "00:00", title: "Intro" }],
};

describe("POST /api/studio/hook", () => {
  it("returns 401 when the Gemini key cookie is missing", async () => {
    const res = await POST({ title: "x", outline: "y" });
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed JSON body", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST("{nope");
    expect(res.status).toBe(400);
  });

  it("returns 400 when title or outline is missing", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    expect((await POST({ title: "", outline: "x" })).status).toBe(400);
    expect((await POST({ title: "x", outline: "  " })).status).toBe(400);
  });

  it("returns 400 when title exceeds the limit", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({ title: "a".repeat(1000), outline: "ok" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when outline exceeds the limit", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({ title: "ok", outline: "a".repeat(10000) });
    expect(res.status).toBe(400);
  });

  it("returns parsed JSON for a clean Gemini response", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(SAMPLE),
      candidates: [{ content: { parts: [{ text: JSON.stringify(SAMPLE) }] } }],
    });
    const res = await POST({
      title: "How I shipped a SaaS",
      outline: "Step 1\nStep 2",
      targetLengthMinutes: 10,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SAMPLE);
  });

  it("clamps targetLengthMinutes to a sane upper bound silently", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(SAMPLE),
      candidates: [{ content: { parts: [{ text: JSON.stringify(SAMPLE) }] } }],
    });
    const res = await POST({
      title: "x",
      outline: "y",
      targetLengthMinutes: 9999,
    });
    expect(res.status).toBe(200);
  });

  it("ignores non-positive targetLengthMinutes", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(SAMPLE),
      candidates: [{ content: { parts: [{ text: JSON.stringify(SAMPLE) }] } }],
    });
    const res = await POST({ title: "x", outline: "y", targetLengthMinutes: 0 });
    expect(res.status).toBe(200);
  });

  it("returns 502 on empty Gemini text", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    generateContentMock.mockResolvedValueOnce({
      text: "",
      candidates: [{ content: { parts: [] } }],
    });
    const res = await POST({ title: "x", outline: "y" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/empty/);
  });

  it("returns 502 on unparseable Gemini text", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    generateContentMock.mockResolvedValueOnce({
      text: "<<<not json>>>",
      candidates: [{ content: { parts: [{ text: "<<<not json>>>" }] } }],
    });
    const res = await POST({ title: "x", outline: "y" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/valid JSON/);
  });
});
