import { describe, expect, it } from "vitest";
import {
  buildClusterIdeasPrompt,
  CLUSTER_IDEAS_LIMITS,
  CLUSTER_IDEAS_SCHEMA,
  clampIdeaCount,
  clusterIdeasInputFromStats,
} from "@/lib/clusterIdeasPrompt";

describe("clampIdeaCount", () => {
  it("defaults to 5 when missing or zero", () => {
    expect(clampIdeaCount(undefined)).toBe(5);
    expect(clampIdeaCount(0)).toBe(5);
  });

  it("clamps below min", () => {
    expect(clampIdeaCount(1)).toBe(CLUSTER_IDEAS_LIMITS.minIdeas);
  });

  it("clamps above max", () => {
    expect(clampIdeaCount(50)).toBe(CLUSTER_IDEAS_LIMITS.maxIdeas);
  });

  it("truncates fractions", () => {
    expect(clampIdeaCount(4.7)).toBe(4);
  });

  it("treats non-finite values as missing", () => {
    expect(clampIdeaCount(Number.NaN)).toBe(5);
  });
});

describe("clusterIdeasInputFromStats", () => {
  const stats = {
    clusterId: 2,
    totalVideos: 6,
    avgViews: 1000,
    medianViews: 800,
    representativeTitles: ["Alpha", "  ", "Bravo", "Charlie"],
  };

  it("falls back to Theme N+1 when no label is supplied", () => {
    expect(clusterIdeasInputFromStats(stats).label).toBe("Theme 3");
  });

  it("honors a provided label and trims whitespace", () => {
    expect(clusterIdeasInputFromStats(stats, { label: "  Pop tools  " }).label).toBe(
      "Pop tools"
    );
  });

  it("filters blank titles and caps to the title limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => `T${i}`);
    const out = clusterIdeasInputFromStats({ ...stats, representativeTitles: many });
    expect(out.sampleTitles).toHaveLength(CLUSTER_IDEAS_LIMITS.maxTitles);
  });

  it("passes through channel context and idea count", () => {
    const out = clusterIdeasInputFromStats(stats, {
      channelContext: " niche dev channel ",
      ideaCount: 7,
    });
    expect(out.channelContext).toBe("niche dev channel");
    expect(out.ideaCount).toBe(7);
  });

  it("drops whitespace-only channel context", () => {
    expect(
      clusterIdeasInputFromStats(stats, { channelContext: "   " }).channelContext
    ).toBeUndefined();
  });
});

describe("buildClusterIdeasPrompt", () => {
  it("includes label, titles, and idea count", () => {
    const prompt = buildClusterIdeasPrompt({
      label: "React tips",
      sampleTitles: ["Use useEffect", "useState basics"],
      medianViews: 1234,
      ideaCount: 6,
    });
    expect(prompt).toContain("React tips");
    expect(prompt).toContain("Use useEffect");
    expect(prompt).toContain("6 new video ideas");
    expect(prompt).toContain("1,234");
  });

  it("handles empty titles gracefully", () => {
    const prompt = buildClusterIdeasPrompt({
      label: "Empty",
      sampleTitles: [],
      medianViews: 0,
    });
    expect(prompt).toContain("(no titles available)");
  });

  it("appends channel context when supplied", () => {
    const prompt = buildClusterIdeasPrompt({
      label: "L",
      sampleTitles: ["X"],
      medianViews: 1,
      channelContext: "senior devs",
    });
    expect(prompt).toContain("Channel context: senior devs");
  });

  it("omits channel context when absent", () => {
    const prompt = buildClusterIdeasPrompt({
      label: "L",
      sampleTitles: ["X"],
      medianViews: 1,
    });
    expect(prompt).not.toContain("Channel context");
  });
});

describe("CLUSTER_IDEAS_SCHEMA", () => {
  it("requires an ideas array", () => {
    expect(CLUSTER_IDEAS_SCHEMA.required).toEqual(["ideas"]);
  });
});
