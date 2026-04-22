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

const GEMINI_KEY = "AIzaClusterIdeas1234567890";

async function POST(body: unknown) {
  const { POST } = await import("@/app/api/studio/clusters/ideas/route");
  return POST(
    new Request("http://x/api/studio/clusters/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

const VALID = {
  label: "React tips",
  sampleTitles: ["useState basics", "useEffect deep dive"],
  medianViews: 1200,
};

const SAMPLE: { ideas: Array<{ title: string; hook: string; why: string }> } = {
  ideas: [
    { title: "Ship in 24h", hook: "You never shipped?", why: "Fills beginner angle." },
    { title: "Avoid useEffect", hook: "Stop this pattern.", why: "Counter-intuitive take." },
    { title: "State libs in 2025", hook: "Redux is back?", why: "Evergreen topic." },
    { title: "Perf audit", hook: "Measure first.", why: "Missing in current set." },
    { title: "Type tricks", hook: "TS like a pro.", why: "Adjacent skill." },
  ],
};

beforeEach(() => {
  generateContentMock.mockReset();
});

describe("POST /api/studio/clusters/ideas", () => {
  it("returns 401 when the Gemini key is missing", async () => {
    const res = await POST(VALID);
    expect(res.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST("{");
    expect(res.status).toBe(400);
  });

  it.each([
    ["missing label", { ...VALID, label: "" }],
    ["overlong label", { ...VALID, label: "x".repeat(121) }],
    ["sampleTitles missing", { label: VALID.label, medianViews: 10, sampleTitles: undefined }],
    ["sampleTitles empty", { ...VALID, sampleTitles: [] }],
    ["sampleTitles non-string", { ...VALID, sampleTitles: [1, 2] }],
    ["negative medianViews", { ...VALID, medianViews: -1 }],
    ["missing medianViews", { ...VALID, medianViews: undefined }],
    ["overlong channelContext", { ...VALID, channelContext: "x".repeat(501) }],
  ])("returns 400 when %s", async (_desc, body) => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST(body);
    expect(res.status).toBe(400);
  });

  it("happy path returns parsed JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(SAMPLE),
      candidates: [{ content: { parts: [{ text: JSON.stringify(SAMPLE) }] } }],
    });
    const res = await POST({
      ...VALID,
      sampleTitles: ["Real title", "  ", "Another"],
      channelContext: "senior devs",
      ideaCount: 5,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SAMPLE);
    const [{ contents }] = generateContentMock.mock.calls[0];
    const prompt = String(contents);
    expect(prompt).toContain("Real title");
    expect(prompt).not.toMatch(/^\s{2}$/m);
    expect(prompt).toContain("senior devs");
  });

  it("returns 502 when Gemini throws", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    generateContentMock.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(VALID);
    expect(res.status).toBe(502);
  });

  it("returns 502 on empty response", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    generateContentMock.mockResolvedValueOnce({
      text: "",
      candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }],
    });
    const res = await POST(VALID);
    expect(res.status).toBe(502);
  });

  it("returns 502 when Gemini returns invalid JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    generateContentMock.mockResolvedValueOnce({
      text: "not json",
      candidates: [{ content: { parts: [{ text: "not json" }] } }],
    });
    const res = await POST(VALID);
    expect(res.status).toBe(502);
  });
});
