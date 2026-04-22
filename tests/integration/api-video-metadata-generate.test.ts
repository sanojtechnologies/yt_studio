import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestCookie } from "../utils/cookies";

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
      },
    }),
  };
});

const GEMINI = "AIzaGeminiGeneratePack123";

function validBody() {
  return {
    videoId: "vid_1",
    currentTitle: "Old title",
    currentDescription: "Old description",
    currentTags: ["a", "b"],
    recommendedTitle: "New better title",
    topRecommendations: ["Improve hook", "Strengthen CTA", "Use better keywords"],
    descriptionSuggestions: ["Hook line", "Body line", "CTA line"],
    suggestedTags: ["graphrag", "ai tutorial"],
  };
}

async function POST(body: unknown) {
  const { POST } = await import("@/app/api/video-metadata/generate/route");
  return POST(
    new Request("http://x/api/video-metadata/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  generateContentMock.mockReset();
});

describe("POST /api/video-metadata/generate", () => {
  it("returns 401 when Gemini key is missing", async () => {
    const res = await POST(validBody());
    expect(res.status).toBe(401);
  });

  it("returns 400 for malformed JSON body", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    const res = await POST("{oops");
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    const res = await POST({ videoId: "v1" });
    expect(res.status).toBe(400);
  });

  it("returns 502 when Gemini response is empty", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({ text: "" });
    const res = await POST(validBody());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/empty/i);
  });

  it("returns 502 when Gemini returns malformed JSON", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({ text: "{oops" });
    const res = await POST(validBody());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/valid json/i);
  });

  it("returns 502 when Gemini returns wrong shape", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({ text: JSON.stringify({ title: "x" }) });
    const res = await POST(validBody());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/invalid metadata pack shape/i);
  });

  it("returns 502 when Gemini returns a non-object payload", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({ text: "null" });
    const res = await POST(validBody());
    expect(res.status).toBe(502);
  });

  it("returns 502 when Gemini returns an array payload", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({ text: "[]" });
    const res = await POST(validBody());
    expect(res.status).toBe(502);
  });

  it("returns generated pack on success", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        overallScore: 8,
        title: "  New better title  ",
        description: "  Coherent publish-ready description.  ",
        tags: ["graphrag", " ai ", "", "long tail tag"],
      }),
    });
    const res = await POST(validBody());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overallScore).toBe(8);
    expect(body.title).toBe("New better title");
    expect(body.description).toBe("Coherent publish-ready description.");
    expect(body.tags).toEqual(["graphrag", "ai", "long tail tag"]);
  });

  it("falls back to recommended title when generated title is blank", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        overallScore: 7,
        title: "   ",
        description: "Description",
        tags: ["one", "two"],
      }),
    });
    const res = await POST(validBody());
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("New better title");
  });

  it("builds prompt with '(none)' blocks when optional guidance is absent", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        overallScore: 7,
        title: "New better title",
        description: "Description",
        tags: ["one", "two"],
      }),
    });
    const body = validBody();
    const res = await POST({
      videoId: body.videoId,
      currentTitle: body.currentTitle,
      currentDescription: "",
      recommendedTitle: body.recommendedTitle,
      // omit optional guidance arrays intentionally
    });
    expect(res.status).toBe(200);
    const prompt: string = generateContentMock.mock.calls[0][0].contents[0].parts[0].text;
    expect(prompt).toContain("Current description:\n(no description)");
    expect(prompt).toContain("Top recommendations:\n- (none)");
    expect(prompt).toContain("Description suggestions:\n- (none)");
    expect(prompt).toContain("Current tags:\n- (none)");
    expect(prompt).toContain("Suggested tags:\n- (none)");
  });

  it("sanitizes non-string recommendation entries before prompt composition", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        overallScore: 7,
        title: "New better title",
        description: "Description",
        tags: ["one", "two"],
      }),
    });
    const body = validBody() as Record<string, unknown>;
    body.topRecommendations = ["Keep this", 123, "And this"];
    const res = await POST(body);
    expect(res.status).toBe(200);
    const prompt: string = generateContentMock.mock.calls[0][0].contents[0].parts[0].text;
    expect(prompt).toContain("- Keep this");
    expect(prompt).toContain("- And this");
    expect(prompt).not.toContain("123");
  });

  it("returns 502 when overallScore is missing or invalid", async () => {
    setTestCookie("gemini_api_key", GEMINI);
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        title: "New better title",
        description: "Description",
        tags: ["one", "two"],
      }),
    });
    const res = await POST(validBody());
    expect(res.status).toBe(502);
  });
});
