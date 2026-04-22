import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestCookie } from "../utils/cookies";

const {
  getChannelByIdMock,
  getChannelByHandleMock,
} = vi.hoisted(() => ({
  getChannelByIdMock: vi.fn(),
  getChannelByHandleMock: vi.fn(),
}));

vi.mock("@/lib/youtube", () => ({
  getChannelById: getChannelByIdMock,
  getChannelByHandle: getChannelByHandleMock,
  getChannelVideos: vi.fn(),
  getVideoDetails: vi.fn(),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const KEY = "AIzaIntegrationTestKey1234567890";

async function GET(url: string) {
  const { GET } = await import("@/app/api/channel/route");
  return GET(new Request(url));
}

beforeEach(() => {
  getChannelByIdMock.mockReset();
  getChannelByHandleMock.mockReset();
  fetchMock.mockReset();
});

describe("GET /api/channel", () => {
  it("returns 401 when the YouTube key cookie is not set", async () => {
    const res = await GET("http://x/api/channel?q=UCabc");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/YouTube Data API v3 key/);
  });

  it("returns 400 for an unparseable input", async () => {
    setTestCookie("yt_api_key", KEY);
    const res = await GET("http://x/api/channel?q=hello%20world");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid channel input");
  });

  // Closes the `searchParams.get("q") ?? ""` branch — URL with no `q` at all.
  it("returns 400 when the request URL has no `q` parameter", async () => {
    setTestCookie("yt_api_key", KEY);
    const res = await GET("http://x/api/channel");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid channel input");
  });

  it("resolves a channel by id", async () => {
    setTestCookie("yt_api_key", KEY);
    getChannelByIdMock.mockResolvedValueOnce({
      id: "UCabcdefghijklmnopqrstuv",
      title: "A",
      description: "",
      subscriberCount: 1,
      viewCount: 1,
    });

    const res = await GET(
      "http://x/api/channel?q=UCabcdefghijklmnopqrstuv"
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.channelId).toBe("UCabcdefghijklmnopqrstuv");
    expect(getChannelByIdMock).toHaveBeenCalledWith(
      KEY,
      "UCabcdefghijklmnopqrstuv"
    );
  });

  it("resolves a handle via the HTML page first, then getChannelById", async () => {
    setTestCookie("yt_api_key", KEY);
    fetchMock.mockResolvedValueOnce(
      new Response(
        'html{"channelId":"UCresolvedfromhtml12345"}end',
        { status: 200 }
      )
    );
    getChannelByIdMock.mockResolvedValueOnce({
      id: "UCresolvedfromhtml12345",
      title: "B",
      description: "",
      subscriberCount: 0,
      viewCount: 0,
    });

    const res = await GET("http://x/api/channel?q=%40LearnwithManoj");
    expect(res.status).toBe(200);
    expect((await res.json()).channelId).toBe("UCresolvedfromhtml12345");
    expect(getChannelByIdMock).toHaveBeenCalledWith(KEY, "UCresolvedfromhtml12345");
    expect(getChannelByHandleMock).not.toHaveBeenCalled();
  });

  it("falls back to getChannelByHandle when HTML resolution fails", async () => {
    setTestCookie("yt_api_key", KEY);
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    getChannelByHandleMock.mockResolvedValueOnce({
      id: "UCviaHandleApi1234567890",
      title: "C",
      description: "",
      subscriberCount: 0,
      viewCount: 0,
    });

    const res = await GET("http://x/api/channel?q=%40someone");
    expect(res.status).toBe(200);
    expect((await res.json()).channelId).toBe("UCviaHandleApi1234567890");
    expect(getChannelByHandleMock).toHaveBeenCalledWith(KEY, "someone");
  });

  it("falls back to getChannelByHandle when HTML response is non-OK", async () => {
    setTestCookie("yt_api_key", KEY);
    fetchMock.mockResolvedValueOnce(new Response("blocked", { status: 429 }));
    getChannelByHandleMock.mockResolvedValueOnce({
      id: "UCviaHandleApiA7890",
      title: "D",
      description: "",
      subscriberCount: 0,
      viewCount: 0,
    });

    const res = await GET("http://x/api/channel?q=%40blocked");
    expect(res.status).toBe(200);
    expect(getChannelByHandleMock).toHaveBeenCalledWith(KEY, "blocked");
  });

  it("falls back to getChannelByHandle when the HTML body has no channel id", async () => {
    setTestCookie("yt_api_key", KEY);
    fetchMock.mockResolvedValueOnce(new Response("no match in here", { status: 200 }));
    getChannelByHandleMock.mockResolvedValueOnce({
      id: "UCviaHandleApiB7890",
      title: "E",
      description: "",
      subscriberCount: 0,
      viewCount: 0,
    });

    const res = await GET("http://x/api/channel?q=%40nomatch");
    expect(res.status).toBe(200);
    expect(getChannelByHandleMock).toHaveBeenCalledWith(KEY, "nomatch");
  });

  it("returns 404 when channel cannot be found", async () => {
    setTestCookie("yt_api_key", KEY);
    getChannelByIdMock.mockResolvedValueOnce(null);
    const res = await GET(
      "http://x/api/channel?q=UCnotfoundxxxxxxxxxxxxxxxx"
    );
    expect(res.status).toBe(404);
  });

  it("returns 429 when lib throws a quota error", async () => {
    setTestCookie("yt_api_key", KEY);
    const { YouTubeQuotaExceededError } = await import("@/lib/errors");
    getChannelByIdMock.mockRejectedValueOnce(new YouTubeQuotaExceededError());
    const res = await GET(
      "http://x/api/channel?q=UCquotaxxxxxxxxxxxxxxxxxxxx"
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 when lib throws an invalid-key error", async () => {
    setTestCookie("yt_api_key", KEY);
    const { YouTubeInvalidApiKeyError } = await import("@/lib/errors");
    getChannelByIdMock.mockRejectedValueOnce(new YouTubeInvalidApiKeyError());
    const res = await GET(
      "http://x/api/channel?q=UCinvalidkeyxxxxxxxxxxxxxxx"
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 for any other lib error", async () => {
    setTestCookie("yt_api_key", KEY);
    getChannelByIdMock.mockRejectedValueOnce(new Error("boom"));
    const res = await GET(
      "http://x/api/channel?q=UCotherxxxxxxxxxxxxxxxxxxxx"
    );
    expect(res.status).toBe(500);
  });
});
