import { describe, expect, it } from "vitest";
import { computeDashboardIdeaOpportunity } from "@/lib/dashboardIdeaEngine";
import type { DashboardStats } from "@/lib/stats";
import type { YouTubeVideo } from "@/types/youtube";

function stats(overrides: Partial<DashboardStats> = {}): DashboardStats {
  return {
    avgViews: 1000,
    engagementRate: 6,
    uploadFrequencyPerWeek: 2.5,
    bestDay: "Friday",
    ...overrides,
  };
}

function video(
  id: string,
  title: string,
  viewCount: number,
  publishedAt = "2026-04-25T10:00:00Z",
  duration = "PT8M"
): YouTubeVideo {
  return {
    id,
    title,
    description: "desc",
    publishedAt,
    duration,
    viewCount,
    likeCount: Math.floor(viewCount * 0.06),
    commentCount: Math.floor(viewCount * 0.01),
  };
}

describe("computeDashboardIdeaOpportunity", () => {
  it("returns high-confidence opportunity with phrase-driven angle", () => {
    const videos: YouTubeVideo[] = Array.from({ length: 26 }, (_, index) =>
      video(
        `v${index}`,
        index % 2 === 0 ? "Graph RAG Tutorial Deep Dive" : "Graph RAG Tutorial Live Build",
        5000 - index * 30,
        `2026-04-${String((index % 28) + 1).padStart(2, "0")}T10:00:00Z`,
        index % 2 === 0 ? "PT9M" : "PT40S"
      )
    );
    const result = computeDashboardIdeaOpportunity(videos, stats());
    expect(result.seedKeyword).toBe("graph rag");
    expect(result.confidence).toBe("High");
    expect(result.sparseSignal).toBe(false);
    expect(result.whyNow.length).toBe(3);
  });

  it("falls back to sparse recommendation and low confidence", () => {
    const videos = [
      video("a", "One Off Video", 100, "2026-04-25T10:00:00Z"),
      video("b", "Second Upload", 120, "2026-04-24T10:00:00Z"),
      video("c", "Third Upload", 90, "2026-04-23T10:00:00Z"),
    ];
    const result = computeDashboardIdeaOpportunity(
      videos,
      stats({ uploadFrequencyPerWeek: 0.7, engagementRate: 2.2 })
    );
    expect(result.sparseSignal).toBe(true);
    expect(result.confidence).toBe("Low");
    expect(result.topOpportunityAngle).toMatch(/micro-series/i);
  });

  it("prefers short format when short median is stronger", () => {
    const videos = [
      video("s1", "AI workflow guide", 2000, "2026-04-20T10:00:00Z", "PT30S"),
      video("s2", "AI workflow setup", 2500, "2026-04-21T10:00:00Z", "PT45S"),
      video("s3", "AI workflow stack", 1800, "2026-04-22T10:00:00Z", "PT40S"),
      video("l1", "Long systems breakdown", 700, "2026-04-23T10:00:00Z", "PT15M"),
      video("l2", "Long systems part 2", 650, "2026-04-24T10:00:00Z", "PT12M"),
      video("l3", "Long systems part 3", 680, "2026-04-25T10:00:00Z", "PT10M"),
      video("x1", "AI workflow guide", 2200, "2026-04-26T10:00:00Z", "PT35S"),
      video("x2", "AI workflow guide", 2100, "2026-04-27T10:00:00Z", "PT42S"),
      video("x3", "AI workflow guide", 2300, "2026-04-28T10:00:00Z", "PT48S"),
      video("x4", "AI workflow guide", 2400, "2026-04-29T10:00:00Z", "PT50S"),
      video("x5", "AI workflow guide", 2350, "2026-04-30T10:00:00Z", "PT39S"),
      video("x6", "AI workflow guide", 2250, "2026-04-10T10:00:00Z", "PT41S"),
    ];
    const result = computeDashboardIdeaOpportunity(videos, stats());
    expect(result.bestFormat).toBe("short");
  });

  it("uses short format when only shorts have enough sample depth", () => {
    const videos = [
      video("s1", "Fast AI setup", 900, "2026-04-20T10:00:00Z", "PT30S"),
      video("s2", "Fast AI setup", 950, "2026-04-21T10:00:00Z", "PT35S"),
      video("s3", "Fast AI setup", 980, "2026-04-22T10:00:00Z", "PT32S"),
      video("s4", "Fast AI setup", 1020, "2026-04-23T10:00:00Z", "PT40S"),
      video("l1", "Long deep dive", 400, "2026-04-24T10:00:00Z", "PT20M"),
      video("l2", "Long deep dive", 420, "2026-04-25T10:00:00Z", "PT21M"),
      video("u1", "repeat repeat", 700, "2026-04-26T10:00:00Z", "PT38S"),
      video("u2", "repeat repeat", 710, "2026-04-27T10:00:00Z", "PT36S"),
      video("u3", "repeat repeat", 720, "2026-04-28T10:00:00Z", "PT39S"),
      video("u4", "repeat repeat", 730, "2026-04-29T10:00:00Z", "PT34S"),
      video("u5", "repeat repeat", 740, "2026-04-30T10:00:00Z", "PT37S"),
    ];
    const result = computeDashboardIdeaOpportunity(videos, stats());
    expect(result.bestFormat).toBe("short");
  });

  it("uses either format when no format has enough evidence", () => {
    const videos = [
      video("a1", "repeat alpha", 400, "2026-04-20T10:00:00Z", "PT30S"),
      video("a2", "repeat alpha", 380, "2026-04-21T10:00:00Z", "PT8M"),
    ];
    const result = computeDashboardIdeaOpportunity(videos, stats());
    expect(result.confidence).toBe("Low");
    expect(result.bestFormat).toBe("either");
  });

  it("sets medium confidence when enough videos but not high-signal depth", () => {
    const videos = Array.from({ length: 14 }, (_, index) =>
      video(
        `m${index}`,
        index % 2 ? "creator systems stack" : "creator systems walkthrough",
        1200 - index * 20,
        `2026-04-${String((index % 14) + 1).padStart(2, "0")}T1${index % 2}:00:00Z`
      )
    );
    const result = computeDashboardIdeaOpportunity(videos, stats());
    expect(result.confidence).toBe("Medium");
  });

  it("falls back to default seed and generic publish window when no title/timing signal exists", () => {
    const videos = [
      video("z1", "", 10, "bad-date", "PT8M"),
      video("z2", "", 20, "also-bad", "PT9M"),
    ];
    const result = computeDashboardIdeaOpportunity(videos, stats());
    expect(result.seedKeyword).toBe("high-retention youtube content");
    expect(result.bestPublishWindow).toBe("No reliable slot yet");
    expect(result.whyNow[2]).toMatch(/No reliable publish-time cluster/i);
  });

  it("uses keyword-only angle when unigrams exist but bigrams do not", () => {
    const videos = Array.from({ length: 12 }, (_, index) =>
      video(
        `k${index}`,
        `alpha ${index}`,
        800 - index * 10,
        `2026-04-${String(index + 1).padStart(2, "0")}T10:00:00Z`,
        "PT40S"
      )
    );
    const result = computeDashboardIdeaOpportunity(videos, stats());
    expect(result.seedKeyword).toBe("alpha");
    expect(result.sparseSignal).toBe(false);
    expect(result.topOpportunityAngle).toMatch(/Double down on "alpha"/);
  });

  it("marks sparse signal via missing repeated phrases even with larger sample", () => {
    const videos = Array.from({ length: 12 }, (_, index) =>
      video(
        `n${index}`,
        `token${index} unique${index}`,
        300 + index * 5,
        `2026-03-${String(index + 1).padStart(2, "0")}T10:00:00Z`,
        "PT7M"
      )
    );
    const result = computeDashboardIdeaOpportunity(videos, stats());
    expect(result.sparseSignal).toBe(true);
    expect(result.whyNow[0]).toMatch(/Title repetition signal is weak/i);
  });
});
