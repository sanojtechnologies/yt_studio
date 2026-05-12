import { describe, expect, it } from "vitest";

import {
  LANDING_BODY_PARAGRAPHS,
  LANDING_H1,
  LANDING_HERO_TAGLINE,
  LANDING_INTERNAL_LINKS,
  LANDING_META_DESCRIPTION,
  LANDING_PAGE_TITLE,
  LANDING_SHARE_LINKS,
  LANDING_SHARE_TEXT,
  buildShareUrl,
} from "@/lib/landingCopy";

// Helpers — kept tiny so the SEO contract stays readable.
function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function countSentences(text: string): number {
  return text.split(/[.!?]+\s+|[.!?]+$/).filter((segment) => segment.trim().length > 0).length;
}

describe("LANDING_H1 (SEO § 4.1)", () => {
  it("is at least 20 characters long so Seobility's 'H1 too short' warning clears", () => {
    expect(LANDING_H1.length).toBeGreaterThanOrEqual(20);
  });

  it("uses the brand keywords so H1 ↔ page title ↔ body stay aligned", () => {
    for (const keyword of ["YT", "Studio", "Analyzer"]) {
      expect(LANDING_H1).toContain(keyword);
    }
  });
});

describe("LANDING_PAGE_TITLE", () => {
  it("shares brand keywords with the H1 so the 'title doesn't match content' warning clears", () => {
    for (const keyword of ["YT", "Studio", "Analyzer"]) {
      expect(LANDING_PAGE_TITLE).toContain(keyword);
    }
  });

  it("has a non-empty meta description", () => {
    expect(LANDING_META_DESCRIPTION.length).toBeGreaterThan(40);
  });
});

describe("LANDING body content", () => {
  const allBody = [LANDING_HERO_TAGLINE, ...LANDING_BODY_PARAGRAPHS].join(" ");

  it("renders at least 3 distinct paragraphs", () => {
    expect(LANDING_BODY_PARAGRAPHS.length).toBeGreaterThanOrEqual(3);
  });

  it("totals at least 250 words so the 'too thin' content error clears", () => {
    expect(countWords(allBody)).toBeGreaterThanOrEqual(250);
  });

  it("averages more than 12 words per sentence so the 'sentences too short' warning clears", () => {
    const sentences = countSentences(allBody);
    expect(sentences).toBeGreaterThan(0);
    expect(countWords(allBody) / sentences).toBeGreaterThan(12);
  });

  it("repeats every H1 keyword inside body copy", () => {
    for (const keyword of ["YT Studio Analyzer", "YouTube", "channel"]) {
      expect(allBody.toLowerCase()).toContain(keyword.toLowerCase());
    }
  });
});

describe("LANDING_INTERNAL_LINKS", () => {
  it("lists at least 10 public internal destinations to clear the 'too few internal links' warning", () => {
    expect(LANDING_INTERNAL_LINKS.length).toBeGreaterThanOrEqual(10);
  });

  it("only contains relative app routes (no external URLs)", () => {
    for (const link of LANDING_INTERNAL_LINKS) {
      expect(link.href.startsWith("/")).toBe(true);
      expect(link.label.length).toBeGreaterThan(0);
    }
  });

  it("each href + label pair is unique", () => {
    const hrefs = new Set(LANDING_INTERNAL_LINKS.map((l) => l.href));
    const labels = new Set(LANDING_INTERNAL_LINKS.map((l) => l.label));
    expect(hrefs.size).toBe(LANDING_INTERNAL_LINKS.length);
    expect(labels.size).toBe(LANDING_INTERNAL_LINKS.length);
  });
});

describe("LANDING_SHARE_LINKS", () => {
  it("exposes at least three social share intents", () => {
    expect(LANDING_SHARE_LINKS.length).toBeGreaterThanOrEqual(3);
  });

  it("has a non-empty share text payload", () => {
    expect(LANDING_SHARE_TEXT.length).toBeGreaterThan(0);
  });
});

describe("buildShareUrl", () => {
  const params = {
    url: "https://example.com/path?a=1",
    text: "hello world & friends",
  };

  it("encodes the URL + text for the twitter intent", () => {
    const out = buildShareUrl("twitter", params);
    expect(out).toContain(`url=${encodeURIComponent(params.url)}`);
    expect(out).toContain(`text=${encodeURIComponent(params.text)}`);
    expect(out.startsWith("https://twitter.com/")).toBe(true);
  });

  it("uses share-offsite for linkedin and only encodes the URL", () => {
    const out = buildShareUrl("linkedin", params);
    expect(out).toContain("linkedin.com/sharing/share-offsite/");
    expect(out).toContain(`url=${encodeURIComponent(params.url)}`);
  });

  it("uses facebook sharer", () => {
    const out = buildShareUrl("facebook", params);
    expect(out).toContain("facebook.com/sharer/sharer.php");
    expect(out).toContain(`u=${encodeURIComponent(params.url)}`);
  });

  it("uses reddit submit with title", () => {
    const out = buildShareUrl("reddit", params);
    expect(out).toContain("reddit.com/submit");
    expect(out).toContain(`url=${encodeURIComponent(params.url)}`);
    expect(out).toContain(`title=${encodeURIComponent(params.text)}`);
  });
});
