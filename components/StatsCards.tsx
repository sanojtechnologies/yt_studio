"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateStats,
  DashboardStats,
  RECENT_CADENCE_WINDOW_DAYS,
} from "@/lib/stats";
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

  const cards = [
    { label: "Avg Views", value: compact(stats.avgViews), hint: undefined as string | undefined },
    {
      label: "Engagement Rate",
      value: `${stats.engagementRate.toFixed(2)}%`,
      hint: undefined as string | undefined,
    },
    {
      label: "Upload Frequency",
      value: `${stats.uploadFrequencyPerWeek.toFixed(1)} / week`,
      hint: `Recent cadence over the last ${RECENT_CADENCE_WINDOW_DAYS} days (falls back to the most recent 10 uploads if the channel has been quiet).`,
    },
    { label: "Best Day", value: bestDay, hint: undefined as string | undefined },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article
          key={card.label}
          title={card.hint}
          className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4"
        >
          <p className="text-sm text-zinc-400">{card.label}</p>
          <p className="mt-2 text-xl font-semibold text-zinc-100">{card.value}</p>
        </article>
      ))}
    </section>
  );
}
