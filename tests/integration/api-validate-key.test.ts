import { beforeEach, describe, expect, it, vi } from "vitest";

const { i18nListMock, youtubeFactoryMock } = vi.hoisted(() => {
  const i18nListMock = vi.fn();
  const youtubeFactoryMock = vi.fn(() => ({
    i18nLanguages: { list: i18nListMock },
  }));
  return { i18nListMock, youtubeFactoryMock };
});

vi.mock("googleapis", () => ({
  google: { youtube: youtubeFactoryMock },
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

async function POST(body: unknown) {
  const { POST } = await import("@/app/api/validate-key/route");
  return POST(
    new Request("http://x/api/validate-key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  i18nListMock.mockReset();
  youtubeFactoryMock.mockClear();
  fetchMock.mockReset();
});

describe("POST /api/validate-key", () => {
  it("returns 400 for non-JSON body", async () => {
    const res = await POST("nope");
    expect(res.status).toBe(400);
  });

  it("returns 400 when no key is provided", async () => {
    const res = await POST({ id: "youtube" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown id", async () => {
    const res = await POST({ id: "other", key: "x" });
    expect(res.status).toBe(400);
  });

  it("returns ok:true when YouTube accepts the key", async () => {
    i18nListMock.mockResolvedValueOnce({ data: { items: [] } });
    const res = await POST({ id: "youtube", key: "AIzaGoodKey0123456789ABCDEF" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("returns ok:true with a warning for a quota-exceeded YouTube key", async () => {
    i18nListMock.mockRejectedValueOnce({
      code: 403,
      errors: [{ reason: "quotaExceeded" }],
    });
    const res = await POST({ id: "youtube", key: "AIzaQuotaKey0123456789ABCDEF" });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.warning).toMatch(/quota/i);
  });

  it("returns ok:false when YouTube rejects the key", async () => {
    i18nListMock.mockRejectedValueOnce(new Error("API key not valid"));
    const res = await POST({ id: "youtube", key: "AIzaBadKey0123456789ABCDEF" });
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/reject/i);
  });

  it("returns ok:true when Gemini models endpoint is reachable", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const res = await POST({ id: "gemini", key: "AIzaGeminiOk01234567890ABCDEF" });
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns ok:false for a 400/401/403 Gemini response", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 403 }));
    const res = await POST({ id: "gemini", key: "AIzaGeminiBad01234567890ABCDEF" });
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/rejected/i);
  });

  it("returns ok:false for a 500 Gemini response with the HTTP code", async () => {
    fetchMock.mockResolvedValueOnce(new Response("oops", { status: 500 }));
    const res = await POST({ id: "gemini", key: "AIzaGeminiErr01234567890ABCDEF" });
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/HTTP 500/);
  });

  it("returns ok:false when the network to Gemini fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network"));
    const res = await POST({ id: "gemini", key: "AIzaGeminiNet01234567890ABCDEF" });
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/could not reach/i);
  });
});
