import { describe, expect, it } from "vitest";
import {
  buildIdeatePdfDocument,
  safeIdeateFilename,
  type IdeateResponseExport,
} from "@/lib/videoIdeateExport";

function sampleResult(overrides: Partial<IdeateResponseExport> = {}): IdeateResponseExport {
  return {
    summary: "Recent demand is rising for graph-rag workflows.",
    evidence: {
      sampleSize: 24,
      windowDays: 30,
      opportunitySignals: ["Graph RAG phrase is accelerating in weighted views."],
    },
    ideas: [
      {
        title: "Graph RAG In 20 Minutes",
        hook: "Build a full graph-rag flow from scratch.",
        whyNow: "Keyword momentum rose in the last 30 days.",
        keywordAngle: "graph rag tutorial",
        format: "long",
        confidence: "high",
        supportingSignals: ["24 videos sampled", "High engagement in tutorial cluster"],
      },
    ],
    ...overrides,
  };
}

describe("safeIdeateFilename", () => {
  it("generates stable sanitized filename", () => {
    const out = safeIdeateFilename("Graph RAG, AI Systems", new Date("2026-04-26T00:00:00.000Z"));
    expect(out).toBe("video-ideate-graph-rag-ai-systems-2026-04-26.pdf");
  });

  it("falls back to niche for empty keywords", () => {
    const out = safeIdeateFilename("  ", new Date("2026-04-26T00:00:00.000Z"));
    expect(out).toBe("video-ideate-niche-2026-04-26.pdf");
  });
});

describe("buildIdeatePdfDocument", () => {
  it("builds a pdf document with at least one page", () => {
    const doc = buildIdeatePdfDocument(
      sampleResult(),
      "graph rag",
      new Date("2026-04-26T00:00:00.000Z")
    );
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it("handles empty opportunity signals and supporting signals", () => {
    const doc = buildIdeatePdfDocument(
      sampleResult({
        evidence: { sampleSize: 3, windowDays: 30, opportunitySignals: [] },
        ideas: [
          {
            title: "Lean Idea",
            hook: "Short hook",
            whyNow: "Sparse but emerging signal",
            keywordAngle: "ai",
            format: "either",
            confidence: "low",
            supportingSignals: [],
          },
        ],
      }),
      "ai"
    );
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it("handles blank seed keywords in document header", () => {
    const doc = buildIdeatePdfDocument(sampleResult(), "   ");
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it("creates additional pages for long content", () => {
    const longSignal = "signal ".repeat(200);
    const manyIdeas = Array.from({ length: 25 }, (_, i) => ({
      title: `Idea ${i + 1}`,
      hook: "hook ".repeat(40),
      whyNow: "why ".repeat(60),
      keywordAngle: `angle ${i + 1}`,
      format: "long" as const,
      confidence: "medium" as const,
      supportingSignals: [longSignal],
    }));
    const doc = buildIdeatePdfDocument(
      sampleResult({
        evidence: { sampleSize: 100, windowDays: 30, opportunitySignals: [longSignal] },
        ideas: manyIdeas,
      }),
      "keyword"
    );
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });
});
