import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DONATE_URL, resolveDonateUrl } from "@/lib/donate";

describe("resolveDonateUrl", () => {
  it("falls back to the default when no override is provided", () => {
    expect(resolveDonateUrl(undefined)).toBe(DEFAULT_DONATE_URL);
    expect(resolveDonateUrl("")).toBe(DEFAULT_DONATE_URL);
    expect(resolveDonateUrl("   ")).toBe(DEFAULT_DONATE_URL);
  });

  it("accepts an https override and returns its canonical form", () => {
    expect(resolveDonateUrl("https://paypal.me/example")).toBe(
      "https://paypal.me/example"
    );
    expect(resolveDonateUrl("  https://ko-fi.com/example  ")).toBe(
      "https://ko-fi.com/example"
    );
  });

  it("rejects non-https protocols", () => {
    expect(resolveDonateUrl("http://paypal.me/example")).toBe(DEFAULT_DONATE_URL);
    expect(resolveDonateUrl("javascript:alert(1)")).toBe(DEFAULT_DONATE_URL);
    expect(resolveDonateUrl("data:text/html,xss")).toBe(DEFAULT_DONATE_URL);
    expect(resolveDonateUrl("ftp://example.com")).toBe(DEFAULT_DONATE_URL);
  });

  it("rejects malformed URLs", () => {
    expect(resolveDonateUrl("not a url")).toBe(DEFAULT_DONATE_URL);
    expect(resolveDonateUrl("paypal.me/example")).toBe(DEFAULT_DONATE_URL); // no protocol
  });

  it("default URL is the project maintainer's PayPal", () => {
    expect(DEFAULT_DONATE_URL).toBe("https://paypal.me/sanojtechnologies");
  });

  it("exports a DONATE_URL bound to the current env override", async () => {
    vi.resetModules();
    const prev = process.env.NEXT_PUBLIC_DONATE_URL;
    process.env.NEXT_PUBLIC_DONATE_URL = "https://example.test/tips";
    try {
      const mod = await import("@/lib/donate");
      expect(mod.DONATE_URL).toBe("https://example.test/tips");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_DONATE_URL;
      else process.env.NEXT_PUBLIC_DONATE_URL = prev;
      vi.resetModules();
    }
  });
});

afterEach(() => {
  vi.resetModules();
});
