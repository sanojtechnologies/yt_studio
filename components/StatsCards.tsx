"use client";

import { useEffect, useMemo, useState } from "react";
import InfoHint from "@/components/InfoHint";
import {
  calculateStats,
  DashboardStats,
  RECENT_CADENCE_WINDOW_DAYS,
} from "@/lib/stats";
import { classifyVideoFormat } from "@/lib/duration";
import { getBrowserTimeZone } from "@/lib/timezone";
import { YouTubeVideo } from "@/types/youtube";

interface StatsCardsProps {
  /**
   * Server-computed stats (UTC). Rendered as-is on first paint to match
   * SSR output; only `bestDay` is swapped to the browser-local value
   * after hydration — everything else is timezone-independent.
   */
  stats: DashboardStats;
  /** Same videos the server used; required to recompute `bestDay` locally. */
  videos: YouTubeVideo[];
}

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

export default function StatsCards({ stats, videos }: StatsCardsProps) {
  const [timeZone, setTimeZone] = useState<string>("UTC");

  useEffect(() => {
    setTimeZone(getBrowserTimeZone());
  }, []);

  const bestDay = useMemo(() => {
    if (timeZone === "UTC") return stats.bestDay;
    return calculateStats(videos, timeZone).bestDay;
  }, [timeZone, stats.bestDay, videos]);

  const recentAverageViews = useMemo(() => {
    const recent = videos.slice(0, Math.min(5, videos.length));
    if (recent.length === 0) return 0;
    return recent.reduce((sum, video) => sum + video.viewCount, 0) / recent.length;
  }, [videos]);

  const shortsCount = useMemo(
    () => videos.filter((video) => classifyVideoFormat(video) === "short").length,
    [videos]
  );

  const cards = [
    {
      label: "Avg Views",
      value: compact(stats.avgViews),
      interpretation:
        recentAverageViews >= stats.avgViews
          ? "Recent videos are at or above this baseline."
          : "Recent videos are below this baseline.",
      hint: "Average views across the loaded video sample. Compare this with recent uploads for momentum.",
    },
    {
      label: "Engagement Rate",
      value: `${stats.engagementRate.toFixed(2)}%`,
      interpretation:
        stats.engagementRate >= 4
          ? "Viewer interaction is currently strong."
          : "Interaction is moderate; test stronger hooks and CTAs.",
      hint: "Likes and comments relative to views. This indicates how strongly viewers respond to content.",
    },
    {
      label: "Upload Frequency",
      value: `${stats.uploadFrequencyPerWeek.toFixed(1)} / week`,
      interpretation:
        stats.uploadFrequencyPerWeek >= 3
          ? "Cadence is consistent enough to support growth."
          : "Cadence is light; consistency may limit discoverability.",
      hint: `Recent cadence over the last ${RECENT_CADENCE_WINDOW_DAYS} days (falls back to the most recent 10 uploads if the channel has been quiet).`,
    },
    {
      label: "Best Day",
      value: bestDay,
      interpretation:
        shortsCount > videos.length / 2
          ? "Best day mostly reflects Shorts behavior in this sample."
          : "Best day mostly reflects long-form behavior in this sample.",
      hint: "Day-of-week with the highest average views in your loaded sample.",
    },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article key={card.label} className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
          <p className="flex items-center gap-1.5 text-sm text-zinc-400">
            <span>{card.label}</span>
            {card.hint ? <InfoHint label={card.hint} /> : null}
          </p>
          <p className="mt-2 text-xl font-semibold text-zinc-100">{card.value}</p>
          <p className="mt-2 text-xs text-zinc-400">{card.interpretation}</p>
        </article>
      ))}
    </section>
  );
}
