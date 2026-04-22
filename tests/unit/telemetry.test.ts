import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportError, scrubContext, serializeError } from "@/lib/telemetry";

const ORIGINAL_ENDPOINT = process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT;

describe("scrubContext", () => {
  it("returns undefined when no context is supplied", () => {
    expect(scrubContext(undefined)).toBeUndefined();
  });

  it("redacts secret-shaped keys regardless of casing", () => {
    const out = scrubContext({
      youtubeKey: "AIzaSY...",
      AUTH_TOKEN: "abc",
      sessionCookie: "x",
      Authorization: "Bearer y",
      route: "/api/analyze",
    });
    expect(out).toEqual({
      youtubeKey: "[redacted]",
      AUTH_TOKEN: "[redacted]",
      sessionCookie: "[redacted]",
      Authorization: "[redacted]",
      route: "/api/analyze",
    });
  });
});

describe("serializeError", () => {
  it("captures name, message, and stack from an Error", () => {
    const err = new Error("boom");
    const serialized = serializeError(err, { route: "/x" });
    expect(serialized.name).toBe("Error");
    expect(serialized.message).toBe("boom");
    expect(serialized.stack).toBeDefined();
    expect(serialized.context).toEqual({ route: "/x" });
    expect(serialized.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("normalizes non-Error values via String() with name 'NonError'", () => {
    const serialized = serializeError("oops");
    expect(serialized.name).toBe("NonError");
    expect(serialized.message).toBe("oops");
    expect(serialized.stack).toBeUndefined();
    expect(serialized.context).toBeUndefined();
  });
});

describe("reportError", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT;
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    if (ORIGINAL_ENDPOINT === undefined) {
      delete process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT;
    } else {
      process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT = ORIGINAL_ENDPOINT;
    }
    vi.unstubAllGlobals();
  });

  it("returns false (and never calls fetch) when the endpoint env var is absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await reportError(new Error("x"))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats an empty/whitespace endpoint as unconfigured", async () => {
    process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT = "   ";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await reportError(new Error("x"))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs a serialized payload and returns true on a 2xx response", async () => {
    process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT = "https://telemetry.test/ingest";
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await reportError(new Error("x"), { route: "/" })).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://telemetry.test/ingest");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(body.message).toBe("x");
    expect(body.context).toEqual({ route: "/" });
  });

  it("returns false on a non-2xx response without throwing", async () => {
    process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT = "https://telemetry.test/ingest";
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await reportError(new Error("x"))).toBe(false);
  });

  it("swallows fetch rejections (telemetry must never become a new failure source)", async () => {
    process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT = "https://telemetry.test/ingest";
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await reportError(new Error("x"))).toBe(false);
  });
});
