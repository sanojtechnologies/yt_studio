import { classifyVideoFormat } from "@/lib/duration";
import { extractNgrams, NgramEntry } from "@/lib/ngrams";
import { YouTubeVideo } from "@/types/youtube";

export type ReuseRisk = "Low" | "Medium" | "High";

export interface FormatWinner {
  format: "short" | "long";
  phrase: string | null;
  weightedViews: number;
  sampleSize: number;
}

export interface TitleTrendsDecision {
  channelMedianViews: number;
  winner: NgramEntry | null;
  winnerMedianViews: number;
  liftVsMedian: number;
  reuseRisk: ReuseRisk;
  noveltySuggestion: string;
  formatWinners: FormatWinner[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function includesPhrase(video: YouTubeVideo, phrase: string): boolean {
  return video.title.toLowerCase().includes(phrase.toLowerCase());
}

export function buildTitleTrendsDecision(videos: YouTubeVideo[]): TitleTrendsDecision {
  const phrases = extractNgrams(videos, { n: 2, minCount: 2, limit: 12 });
  const keywords = extractNgrams(videos, { n: 1, minCount: 2, limit: 12 });
  const winner = phrases[0] ?? keywords[0] ?? null;

  const channelMedianViews = median(videos.map((video) => video.viewCount));
  const winnerVideos =
    winner === null ? [] : videos.filter((video) => includesPhrase(video, winner.phrase));
  const winnerMedianViews = median(winnerVideos.map((video) => video.viewCount));
  const liftVsMedian =
    channelMedianViews > 0 ? (winnerMedianViews - channelMedianViews) / channelMedianViews : 0;

  const winnerShare = winner ? winner.count / Math.max(videos.length, 1) : 0;
  const reuseRisk: ReuseRisk =
    winnerShare >= 0.45 ? "High" : winnerShare >= 0.25 ? "Medium" : "Low";

  const challenger = phrases[1] ?? keywords[1] ?? null;
  const noveltySuggestion =
    reuseRisk === "High"
      ? challenger
        ? `Reuse winner pattern but rotate in "${challenger.phrase}" to avoid title fatigue.`
        : "Reuse winner pattern carefully; vary the promised outcome each upload."
      : reuseRisk === "Medium"
        ? "Keep the core phrase, but alternate one high-intent qualifier every 2-3 uploads."
        : "Low saturation risk: keep the winning phrase while tightening specificity.";

  const shorts = videos.filter((video) => classifyVideoFormat(video) === "short");
  const longForm = videos.filter((video) => classifyVideoFormat(video) === "long");
  const shortWinner = extractNgrams(shorts, { n: 2, minCount: 2, limit: 1 })[0] ?? null;
  const longWinner = extractNgrams(longForm, { n: 2, minCount: 2, limit: 1 })[0] ?? null;

  const formatWinners: FormatWinner[] = [
    {
      format: "short",
      phrase: shortWinner?.phrase ?? null,
      weightedViews: shortWinner?.weightedViews ?? 0,
      sampleSize: shorts.length,
    },
    {
      format: "long",
      phrase: longWinner?.phrase ?? null,
      weightedViews: longWinner?.weightedViews ?? 0,
      sampleSize: longForm.length,
    },
  ];

  return {
    channelMedianViews,
    winner,
    winnerMedianViews,
    liftVsMedian,
    reuseRisk,
    noveltySuggestion,
    formatWinners,
  };
}
