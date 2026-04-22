import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;

async function loadRobots() {
  vi.resetModules();
  const module = await import("@/app/robots");
  return module.default;
}

async function loadSitemap() {
  vi.resetModules();
  const module = await import("@/app/sitemap");
  return module.default;
}

async function loadManifest() {
  vi.resetModules();
  const module = await import("@/app/manifest");
  return module.default;
}

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
  }
});

describe("robots route", () => {
  it("publishes sitemap on configured site URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://ytstudio.example";
    const robots = await loadRobots();
    const result = robots();
    expect(result.sitemap).toBe("https://ytstudio.example/sitemap.xml");
  });

  it("disallows private and API routes", async () => {
    const robots = await loadRobots();
    const rules = robots().rules;
    expect(Array.isArray(rules)).toBe(true);
    const globalRule = Array.isArray(rules) ? rules[0] : rules;
    expect(globalRule.disallow).toEqual(
      expect.arrayContaining(["/api/", "/dashboard/", "/keys", "/keys/", "/history"])
    );
  });
});

describe("sitemap route", () => {
  it("emits only public discoverable pages", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://ytstudio.example";
    const sitemap = await loadSitemap();
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain("https://ytstudio.example/");
    expect(urls).toContain("https://ytstudio.example/studio");
    expect(urls).not.toContain("https://ytstudio.example/keys");
    expect(urls).not.toContain("https://ytstudio.example/history");
    expect(urls).not.toContain("https://ytstudio.example/dashboard/abc");
  });
});

describe("manifest route", () => {
  it("describes app branding and icons", async () => {
    const manifest = await loadManifest();
    const result = manifest();
    expect(result.name).toBe("YT Studio Analyzer");
    expect(result.icons?.some((icon) => icon.src === "/favicon.ico")).toBe(true);
  });
});
