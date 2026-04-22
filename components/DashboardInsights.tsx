"use client";

import InfoHint from "@/components/InfoHint";
import { classifyVideoFormat } from "@/lib/duration";
import { DashboardStats } from "@/lib/stats";
import { YouTubeVideo } from "@/types/youtube";

interface DashboardInsightsProps {
  stats: DashboardStats;
  videos: YouTubeVideo[];
}

type Confidence = "High" | "Medium" | "Low";

interface InsightItem {
  title: string;
  summary: string;
  confidence: Confidence;
  why: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2;
  return sorted[middle];
}

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

function confidenceBadge(confidence: Confidence): string {
  if (confidence === "High") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (confidence === "Medium") return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-zinc-700 bg-zinc-800/60 text-zinc-300";
}

export default function DashboardInsights({ stats, videos }: DashboardInsightsProps) {
  const shorts = videos.filter((v) => classifyVideoFormat(v) === "short");
  const longForm = videos.filter((v) => classifyVideoFormat(v) === "long");
  const shortMedian = median(shorts.map((v) => v.viewCount));
  const longMedian = median(longForm.map((v) => v.viewCount));

  const recentSlice = videos.slice(0, Math.min(5, videos.length));
  const baselineSlice = videos.slice(Math.min(5, videos.length));
  const recentAvg = median(recentSlice.map((v) => v.viewCount));
  const baselineAvg = median(baselineSlice.map((v) => v.viewCount));
  const momentumRatio = baselineAvg > 0 ? recentAvg / baselineAvg : 1;

  const cadenceConfidence: Confidence = videos.length >= 20 ? "High" : videos.length >= 10 ? "Medium" : "Low";
  const formatConfidence: Confidence =
    shorts.length >= 5 && longForm.length >= 5 ? "High" : shorts.length >= 3 && longForm.length >= 3 ? "Medium" : "Low";
  const momentumConfidence: Confidence =
    recentSlice.length >= 5 && baselineSlice.length >= 10 ? "High" : baselineSlice.length >= 5 ? "Medium" : "Low";

  const insights: InsightItem[] = [
    {
      title: "Cadence Signal",
      summary:
        stats.uploadFrequencyPerWeek >= 4
          ? "You are publishing at a high clip; consistency is a current strength."
          : stats.uploadFrequencyPerWeek >= 2
            ? "Publishing rhythm is healthy, but there is room to tighten consistency."
            : "Publishing cadence is low; consistency likely limits reach compounding.",
      confidence: cadenceConfidence,
      why: "Based on the recent upload-frequency window; confidence increases with sample size.",
    },
    {
      title: "Format Signal",
      summary:
        shorts.length === 0 || longForm.length === 0
          ? "Only one format dominates this sample, so format comparisons are limited."
          : shortMedian >= longMedian
            ? `Shorts median (${compact(shortMedian)}) is ahead of long-form (${compact(longMedian)}).`
            : `Long-form median (${compact(longMedian)}) is ahead of Shorts (${compact(shortMedian)}).`,
      confidence: formatConfidence,
      why: "Compares median views by format to reduce outlier distortion.",
    },
    {
      title: "Recent Momentum",
      summary:
        momentumRatio >= 1.2
          ? "Recent videos are outperforming the prior baseline — momentum is positive."
          : momentumRatio <= 0.85
            ? "Recent videos are below baseline — review packaging and slot timing."
            : "Recent performance is near baseline — stable but not accelerating.",
      confidence: momentumConfidence,
      why: "Compares recent sample median against an older baseline window.",
    },
  ];

  const engagementFactor = Math.min(stats.engagementRate / 6, 1);
  const cadenceFactor = Math.min(stats.uploadFrequencyPerWeek / 5, 1);
  const momentumFactor = Math.max(0, Math.min((momentumRatio - 0.7) / 0.7, 1));
  const healthScore = Math.round(engagementFactor * 40 + cadenceFactor * 30 + momentumFactor * 30);
  const healthLabel = healthScore >= 75 ? "Strong" : healthScore >= 50 ? "Healthy" : "Watch";

  const actions = [
    "Double down on the current best-performing format for your next 2 uploads.",
    "Publish in the strongest heatmap slot to improve baseline consistency.",
    "Run metadata + thumbnail generation for underperforming recent videos.",
  ];

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-100">Key Insights</h2>
            <InfoHint label="Interpretive layer over raw metrics: highlights what changed, why it matters, and how confident we are." />
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            How To Read This: Insights are channel-relative, not universal benchmarks.
          </p>
        </div>
        <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-right">
          <p className="text-xs text-violet-200">Channel Health</p>
          <p className="text-base font-semibold text-white">
            {healthLabel} ({healthScore}/100)
          </p>
          <p className="text-[11px] text-zinc-300">Composite: engagement, cadence, momentum</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {insights.map((item) => (
          <article key={item.title} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-100">{item.title}</h3>
              <span
                title={item.why}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${confidenceBadge(item.confidence)}`}
              >
                {item.confidence} Confidence
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-300">{item.summary}</p>
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-100">Recommended Next Actions</h3>
          <InfoHint label="Action cards convert insights into immediate execution steps." />
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
          {actions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
