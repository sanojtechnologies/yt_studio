import { classifyVideoFormat } from "@/lib/duration";
import { extractNgrams } from "@/lib/ngrams";
import { buildPublishHeatmap, DAY_NAMES_SHORT } from "@/lib/heatmap";
import { DashboardStats } from "@/lib/stats";
import { YouTubeVideo } from "@/types/youtube";

export type IdeaEngineConfidence = "High" | "Medium" | "Low";
export type IdeaEngineFormat = "short" | "long" | "either";

export interface DashboardIdeaOpportunity {
  seedKeyword: string;
  topOpportunityAngle: string;
  whyNow: string[];
  bestFormat: IdeaEngineFormat;
  bestPublishWindow: string;
  confidence: IdeaEngineConfidence;
  sparseSignal: boolean;
}

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

export function computeDashboardIdeaOpportunity(
  videos: YouTubeVideo[],
  stats: DashboardStats,
  timeZone: string = "UTC"
): DashboardIdeaOpportunity {
  const bigrams = extractNgrams(videos, { n: 2, minCount: 2, limit: 5 });
  const unigrams = extractNgrams(videos, { n: 1, minCount: 2, limit: 5 });
  const topPhrase = bigrams[0]?.phrase ?? "";
  const topKeyword = unigrams[0]?.phrase ?? "";
  const seedKeyword = topPhrase || topKeyword || "high-retention youtube content";

  const shorts = videos.filter((video) => classifyVideoFormat(video) === "short");
  const longForm = videos.filter((video) => classifyVideoFormat(video) === "long");
  const shortMedian =
    shorts.length > 0
      ? shorts.slice().sort((a, b) => a.viewCount - b.viewCount)[Math.floor(shorts.length / 2)]
          .viewCount
      : 0;
  const longMedian =
    longForm.length > 0
      ? longForm
          .slice()
          .sort((a, b) => a.viewCount - b.viewCount)[Math.floor(longForm.length / 2)].viewCount
      : 0;

  let bestFormat: IdeaEngineFormat = "either";
  if (shorts.length >= 3 && longForm.length >= 3) {
    bestFormat = shortMedian >= longMedian ? "short" : "long";
  } else if (shorts.length >= 3) {
    bestFormat = "short";
  } else if (longForm.length >= 3) {
    bestFormat = "long";
  }

  const heatmap = buildPublishHeatmap(videos, timeZone);
  const bestPublishWindow = heatmap.bestCell
    ? `${DAY_NAMES_SHORT[heatmap.bestCell.day]} ${String(heatmap.bestCell.hour).padStart(2, "0")}:00`
    : "No reliable slot yet";

  const sparseSignal = videos.length < 10 || (!topPhrase && !topKeyword);
  const confidence: IdeaEngineConfidence =
    videos.length >= 25 && heatmap.bestCell?.count && heatmap.bestCell.count >= 2
      ? "High"
      : videos.length >= 12
        ? "Medium"
        : "Low";

  const topOpportunityAngle = sparseSignal
    ? "Build a 3-video micro-series around one repeatable audience problem."
    : topPhrase
      ? `Scale "${topPhrase}" into a stronger outcome-driven angle.`
      : `Double down on "${topKeyword}" with sharper packaging and a concrete promise.`;

  const whyNow = [
    topPhrase
      ? `"${topPhrase}" is your strongest repeat phrase by weighted views (${compact(
          bigrams[0].weightedViews
        )}).`
      : topKeyword
        ? `"${topKeyword}" is your strongest recurring keyword signal.`
        : "Title repetition signal is weak, so confidence is conservative.",
    `Current cadence is ${stats.uploadFrequencyPerWeek.toFixed(1)} uploads/week with ${stats.engagementRate.toFixed(1)}% engagement.`,
    heatmap.bestCell
      ? `Best publish window is ${bestPublishWindow} from ${heatmap.bestCell.count} matching uploads.`
      : "No reliable publish-time cluster yet; run controlled timing tests.",
  ];

  return {
    seedKeyword,
    topOpportunityAngle,
    whyNow,
    bestFormat,
    bestPublishWindow,
    confidence,
    sparseSignal,
  };
}
