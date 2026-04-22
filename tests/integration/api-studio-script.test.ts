import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestCookie } from "../utils/cookies";

const { generateContentStreamMock } = vi.hoisted(() => ({
  generateContentStreamMock: vi.fn(),
}));

vi.mock("@/lib/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gemini")>(
    "@/lib/gemini"
  );
  return {
    ...actual,
    getGeminiClient: () => ({
      models: {
        generateContentStream: generateContentStreamMock,
        generateContent: vi.fn(),
      },
    }),
  };
});

const GEMINI_KEY = "AIzaScriptFake1234567890";

async function POST(body: unknown) {
  const { POST } = await import("@/app/api/studio/script/route");
  const init: RequestInit =
    body === undefined
      ? { method: "POST" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        };
  return POST(new Request("http://x/api/studio/script", init));
}

async function drainNdjson(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function* streamChunks(chunks: string[]) {
  for (const text of chunks) {
    yield { text };
  }
}

beforeEach(() => {
  generateContentStreamMock.mockReset();
});

describe("POST /api/studio/script", () => {
  it("returns 401 when the Gemini key cookie is missing", async () => {
    const res = await POST({ title: "x", targetMinutes: 5 });
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST("{not json");
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is empty", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({ title: "  ", targetMinutes: 5 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/title/);
  });

  it("returns 400 when title is too long", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({ title: "a".repeat(500), targetMinutes: 5 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when targetMinutes is missing", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({ title: "x" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/targetMinutes/);
  });

  it("returns 400 when targetMinutes is not an integer", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({ title: "x", targetMinutes: 5.5 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when targetMinutes is out of range (low)", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({ title: "x", targetMinutes: 0 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when targetMinutes is out of range (high)", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({ title: "x", targetMinutes: 999 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when audience is too long", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({
      title: "x",
      targetMinutes: 5,
      audience: "a".repeat(5000),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when channelContext is too long", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const res = await POST({
      title: "x",
      targetMinutes: 5,
      channelContext: "c".repeat(5000),
    });
    expect(res.status).toBe(400);
  });

  it("streams NDJSON and emits a final event with parsed JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    const payload = {
      coldOpen: "open",
      hook: "hook",
      beats: [{ heading: "intro", bullets: ["a"] }],
      callToAction: "subscribe",
      outro: "bye",
    };
    generateContentStreamMock.mockReturnValueOnce(
      streamChunks([JSON.stringify(payload)])
    );
    const res = await POST({
      title: "How to ship",
      targetMinutes: 5,
      audience: "indies",
      channelContext: "hands-on",
    });
    expect(res.status).toBe(200);
    const events = await drainNdjson(res);
    expect(events[0]).toMatchObject({ type: "meta", title: "How to ship", targetMinutes: 5 });
    expect(events.at(-1)).toEqual({ type: "final", data: payload });
  });

  it("emits `final` with raw fallback when Gemini text isn't JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    generateContentStreamMock.mockReturnValueOnce(streamChunks(["{not json"]));
    const res = await POST({ title: "x", targetMinutes: 5 });
    const events = await drainNdjson(res);
    expect(events.at(-1)).toEqual({ type: "final", data: { raw: "{not json" } });
  });

  it("skips empty chunks and still finalises", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    generateContentStreamMock.mockReturnValueOnce(streamChunks(["", "{}"]));
    const res = await POST({ title: "x", targetMinutes: 5 });
    const events = await drainNdjson(res);
    const chunks = events.filter((e) => e.type === "chunk");
    expect(chunks).toHaveLength(1); // empty chunk skipped
    expect(events.at(-1)).toEqual({ type: "final", data: {} });
  });

  it("emits an error event when the stream throws mid-way", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    async function* brokenStream() {
      yield { text: "{" };
      throw new Error("boom");
    }
    generateContentStreamMock.mockReturnValueOnce(brokenStream());
    const res = await POST({ title: "x", targetMinutes: 5 });
    const events = await drainNdjson(res);
    const err = events.find((e) => e.type === "error");
    expect(err).toBeDefined();
    expect(err?.error).toBe("boom");
  });

  it("falls back to a generic error message when the thrown value is not an Error", async () => {
    setTestCookie("gemini_api_key", GEMINI_KEY);
    async function* brokenStream() {
      yield { text: "{" };
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw "weird";
    }
    generateContentStreamMock.mockReturnValueOnce(brokenStream());
    const res = await POST({ title: "x", targetMinutes: 5 });
    const events = await drainNdjson(res);
    const err = events.find((e) => e.type === "error");
    expect(err?.error).toBe("Script generation failed");
  });
});
