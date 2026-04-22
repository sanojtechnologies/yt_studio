import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;

async function load() {
  vi.resetModules();
  return import("@/lib/siteUrl");
}

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
  }
});

describe("getSiteUrl", () => {
  it("falls back to localhost-like default when env is missing", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const { getSiteUrl } = await load();
    expect(getSiteUrl()).toBe("https://ytstudio.local");
  });

  it("returns normalized origin when env is valid", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com/some/path?x=1#abc";
    const { getSiteUrl, getSiteUrlObject } = await load();
    expect(getSiteUrl()).toBe("https://example.com");
    expect(getSiteUrlObject().toString()).toBe("https://example.com/");
  });

  it("accepts http origins in development", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    const { getSiteUrl } = await load();
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  it.each(["", "  ", "ftp://example.com", "not a url"])(
    "falls back for invalid env value %s",
    async (value) => {
      process.env.NEXT_PUBLIC_SITE_URL = value;
      const { getSiteUrl } = await load();
      expect(getSiteUrl()).toBe("https://ytstudio.local");
    }
  );
});
