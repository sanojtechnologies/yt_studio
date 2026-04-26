import { describe, expect, it } from "vitest";
import { buildTitleTrendsDecision } from "@/lib/titleTrendsDecision";
import { YouTubeVideo } from "@/types/youtube";

function vid(
  id: string,
  title: string,
  views: number,
  duration = "PT8M",
  publishedAt = "2026-04-20T10:00:00Z"
): YouTubeVideo {
  return {
    id,
    title,
    description: "",
    publishedAt,
    duration,
    viewCount: views,
    likeCount: 0,
    commentCount: 0,
  };
}

describe("buildTitleTrendsDecision", () => {
  it("computes positive lift and low reuse risk for a strong but not saturated winner", () => {
    const videos = [
      vid("1", "system design interview prep", 2000),
      vid("2", "system design interview breakdown", 1800),
      vid("3", "system design interview mistakes", 1700),
      vid("4", "distributed systems primer", 500),
      vid("5", "backend roadmap", 450),
      vid("6", "api basics", 400),
      vid("7", "networking intro", 350),
      vid("8", "databases for beginners", 300),
      vid("9", "queues and streams", 320),
      vid("10", "cloud fundamentals", 280),
      vid("11", "system design interview qna", 1600),
      vid("12", "leadership in engineering", 260),
    ];
    const decision = buildTitleTrendsDecision(videos);
    expect(decision.winner?.phrase).toMatch(/design|interview/);
    expect(decision.liftVsMedian).toBeGreaterThan(0);
    expect(decision.reuseRisk).toBe("Medium");
  });

  it("marks high reuse risk and uses challenger phrase in novelty suggestion", () => {
    const videos = [
      vid("1", "ai masterclass part 1", 1000),
      vid("2", "ai masterclass part 2", 1050),
      vid("3", "ai masterclass part 3", 1100),
      vid("4", "ai masterclass part 4", 1200),
      vid("5", "ai masterclass part 5", 1250),
      vid("6", "ai masterclass part 6", 1300),
      vid("7", "ai masterclass explained", 1150),
      vid("8", "ai masterclass interview prep", 1400),
      vid("9", "system design basics", 500),
      vid("10", "system design advanced", 550),
      vid("11", "system design qna", 520),
      vid("12", "system design mistakes", 540),
    ];
    const decision = buildTitleTrendsDecision(videos);
    expect(decision.reuseRisk).toBe("High");
    expect(decision.noveltySuggestion).toMatch(/rotate in/i);
  });

  it("builds format split winners for shorts and long-form", () => {
    const videos = [
      vid("s1", "quick api tips", 900, "PT35S"),
      vid("s2", "quick api mistakes", 850, "PT40S"),
      vid("s3", "quick api guide", 880, "PT38S"),
      vid("l1", "system design interview", 1500, "PT10M"),
      vid("l2", "system design interview prep", 1450, "PT12M"),
      vid("l3", "system design interview qna", 1400, "PT11M"),
      vid("l4", "system design interview myths", 1420, "PT9M"),
    ];
    const decision = buildTitleTrendsDecision(videos);
    expect(decision.formatWinners[0].format).toBe("short");
    expect(decision.formatWinners[0].phrase).toBe("quick api");
    expect(decision.formatWinners[1].format).toBe("long");
    expect(decision.formatWinners[1].phrase).toMatch(/design|interview/);
  });

  it("falls back safely when there is no repeat signal", () => {
    const videos = [vid("1", "alpha", 100), vid("2", "beta", 120), vid("3", "gamma", 90)];
    const decision = buildTitleTrendsDecision(videos);
    expect(decision.winner).toBeNull();
    expect(decision.winnerMedianViews).toBe(0);
    expect(decision.liftVsMedian).toBeLessThanOrEqual(0);
    expect(decision.noveltySuggestion).toMatch(/Low saturation risk/i);
  });

  it("handles zero channel median and high-risk without challenger fallback", () => {
    const videos = [
      vid("1", "core", 0),
      vid("2", "core", 0),
      vid("3", "core", 0),
      vid("4", "core", 0),
      vid("5", "core", 0),
      vid("6", "core", 0),
      vid("7", "core", 0),
      vid("8", "core", 0),
      vid("9", "core", 0),
      vid("10", "core", 0),
    ];
    const decision = buildTitleTrendsDecision(videos);
    expect(decision.liftVsMedian).toBe(0);
    expect(decision.reuseRisk).toBe("High");
    expect(decision.noveltySuggestion).toMatch(/vary the promised outcome/i);
  });
});
