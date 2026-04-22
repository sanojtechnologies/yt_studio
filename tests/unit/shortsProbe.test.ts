import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetShortsProbeCacheForTests,
  classifyProbeResponse,
  enrichVideosWithShortsProbe,
  probeShort,
} from "@/lib/shortsProbe";
import { YouTubeVideo } from "@/types/youtube";

function video(overrides: Partial<YouTubeVideo> = {}): YouTubeVideo {
  return {
    id: "v",
    title: "t",
    description: "",
    publishedAt: "2025-01-01T00:00:00Z",
    duration: "PT30S",
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    ...overrides,
  };
}

function mockFetchWith(fn: (...args: unknown[]) => Promise<Response>) {
  const spy = vi.fn(fn);
  vi.stubGlobal("fetch", spy);
  return spy;
}

function res(status: number): Response {
  // Redirect statuses can't be constructed via the Response() ctor (spec
  // forbids 3xx), so we stub enough of the shape for our code paths:
  // .status + a cancel()-able body.
  return {
    status,
    body: {
      cancel: vi.fn(() => Promise.resolve()),
    } as unknown as ReadableStream<Uint8Array>,
  } as unknown as Response;
}

beforeEach(() => {
  __resetShortsProbeCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("classifyProbeResponse", () => {
  it("maps 200 → true, 3xx → false, anything else → undefined", () => {
    expect(classifyProbeResponse(200)).toBe(true);
    expect(classifyProbeResponse(301)).toBe(false);
    expect(classifyProbeResponse(302)).toBe(false);
    expect(classifyProbeResponse(303)).toBe(false);
    expect(classifyProbeResponse(307)).toBe(false);
    expect(classifyProbeResponse(404)).toBeUndefined();
    expect(classifyProbeResponse(500)).toBeUndefined();
    expect(classifyProbeResponse(0)).toBeUndefined();
  });
});

describe("probeShort", () => {
  it("returns undefined for empty or whitespace-only ids without fetching", async () => {
    const spy = mockFetchWith(async () => res(200));
    expect(await probeShort("")).toBeUndefined();
    expect(await probeShort("   ")).toBeUndefined();
    // Exercises the `typeof videoId !== "string"` guard — external data
    // can still arrive as `null`/`undefined`/numbers at runtime.
    expect(await probeShort(null as unknown as string)).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns true when YouTube serves the Shorts player (HTTP 200)", async () => {
    mockFetchWith(async () => res(200));
    expect(await probeShort("abc123")).toBe(true);
  });

  it("returns false when YouTube redirects to /watch (HTTP 303)", async () => {
    mockFetchWith(async () => res(303));
    expect(await probeShort("abc123")).toBe(false);
  });

  it("returns undefined for unexpected statuses", async () => {
    mockFetchWith(async () => res(404));
    expect(await probeShort("abc123")).toBeUndefined();
  });

  it("returns undefined when the fetch rejects (network error / timeout / abort)", async () => {
    mockFetchWith(async () => {
      throw new Error("ECONNRESET");
    });
    expect(await probeShort("abc123")).toBeUndefined();
  });

  it("uses GET with redirect:manual and encodes the id into the URL", async () => {
    const spy = mockFetchWith(async () => res(200));
    await probeShort("a b/c");
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://www.youtube.com/shorts/a%20b%2Fc");
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // Identify ourselves so YouTube can rate-limit / contact us.
    const headers = init.headers as Record<string, string> | undefined;
    expect(headers?.["user-agent"]).toMatch(/YtStudioShortsProbe/);
  });

  it("caches a successful probe for 24h (second call skips fetch)", async () => {
    const spy = mockFetchWith(async () => res(200));
    expect(await probeShort("abc123")).toBe(true);
    expect(await probeShort("abc123")).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does NOT cache inconclusive probes (transient failures can retry)", async () => {
    // First call errors → undefined, no cache entry. Second call succeeds.
    let count = 0;
    mockFetchWith(async () => {
      count += 1;
      if (count === 1) throw new Error("timeout");
      return res(303);
    });
    expect(await probeShort("abc123")).toBeUndefined();
    expect(await probeShort("abc123")).toBe(false);
  });

  it("cancels the response body to avoid leaking an open stream", async () => {
    const cancel = vi.fn(() => Promise.resolve());
    mockFetchWith(
      async () =>
        ({
          status: 200,
          body: { cancel } as unknown as ReadableStream<Uint8Array>,
        } as unknown as Response)
    );
    await probeShort("abc123");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("tolerates responses with no body (body.cancel absent)", async () => {
    mockFetchWith(
      async () => ({ status: 303, body: null } as unknown as Response)
    );
    expect(await probeShort("abc123")).toBe(false);
  });

  it("swallows a body.cancel() rejection so the outer probe still resolves", async () => {
    mockFetchWith(
      async () =>
        ({
          status: 200,
          body: {
            cancel: () => Promise.reject(new Error("already locked")),
          } as unknown as ReadableStream<Uint8Array>,
        } as unknown as Response)
    );
    expect(await probeShort("abc123")).toBe(true);
  });

  it("aborts the fetch and returns undefined when the probe exceeds its timeout", async () => {
    vi.useFakeTimers();
    mockFetchWith(
      (_url, init) =>
        // Never resolve on our own; wait for the AbortController to fire
        // then surface an AbortError, exactly as undici does at runtime.
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit).signal as AbortSignal;
          signal.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }) as unknown as Promise<Response>
    );
    const pending = probeShort("abc123");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toBeUndefined();
    vi.useRealTimers();
  });
});

describe("enrichVideosWithShortsProbe", () => {
  it("returns the original array untouched when no videos are in the short-eligible range", async () => {
    const spy = mockFetchWith(async () => res(200));
    // Everything > 180s → nothing to probe → no network calls, and we
    // want referential equality preserved to signal no work was done.
    const videos = [video({ id: "v1", duration: "PT10M" }), video({ id: "v2", duration: "PT4M" })];
    const out = await enrichVideosWithShortsProbe(videos);
    expect(out).toBe(videos);
    expect(spy).not.toHaveBeenCalled();
  });

  it("only probes videos whose duration falls in (0, 180s]", async () => {
    const spy = mockFetchWith(async () => res(200));
    const videos = [
      video({ id: "short1", duration: "PT45S" }),
      video({ id: "short2", duration: "PT2M30S" }),
      video({ id: "long1", duration: "PT4M" }),
      video({ id: "zero", duration: "PT0S" }),
      video({ id: "bad", duration: "garbage" }),
    ];
    await enrichVideosWithShortsProbe(videos);
    const probedIds = spy.mock.calls.map((call) => String(call[0]));
    expect(probedIds).toContain("https://www.youtube.com/shorts/short1");
    expect(probedIds).toContain("https://www.youtube.com/shorts/short2");
    expect(probedIds).not.toContain(
      expect.stringContaining("/long1")
    );
    expect(probedIds.length).toBe(2);
  });

  it("attaches isShort=true when YouTube returns 200 and =false on 3xx", async () => {
    mockFetchWith(async (url) => {
      const str = String(url);
      if (str.endsWith("/short1")) return res(200);
      if (str.endsWith("/trailer1")) return res(303);
      return res(404);
    });
    const videos = [
      video({ id: "short1", duration: "PT45S" }),
      video({ id: "trailer1", duration: "PT90S" }),
      video({ id: "long1", duration: "PT10M" }),
    ];
    const out = await enrichVideosWithShortsProbe(videos);
    const byId = new Map(out.map((v) => [v.id, v]));
    expect(byId.get("short1")?.isShort).toBe(true);
    expect(byId.get("trailer1")?.isShort).toBe(false);
    // Long-form video was never probed → isShort stays undefined.
    expect(byId.get("long1")?.isShort).toBeUndefined();
  });

  it("leaves isShort undefined when every probe is inconclusive, returning the original array", async () => {
    mockFetchWith(async () => res(404));
    const videos = [video({ id: "v1", duration: "PT30S" }), video({ id: "v2", duration: "PT60S" })];
    const out = await enrichVideosWithShortsProbe(videos);
    // No successful probes → we short-circuit and return the original
    // reference so downstream work can detect a no-op cheaply.
    expect(out).toBe(videos);
  });

  it("respects the concurrency bound when probing many videos", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    mockFetchWith(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return res(200);
    });
    const videos = Array.from({ length: 20 }, (_, i) =>
      video({ id: `v${i}`, duration: "PT45S" })
    );
    await enrichVideosWithShortsProbe(videos, { concurrency: 3 });
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("clamps non-positive concurrency to 1 (guards against misuse)", async () => {
    mockFetchWith(async () => res(200));
    const videos = [video({ id: "v1", duration: "PT30S" })];
    const out = await enrichVideosWithShortsProbe(videos, { concurrency: 0 });
    expect(out[0].isShort).toBe(true);
  });
});
