"use client";

import { useEffect, useState } from "react";
import GrowthChart from "@/components/GrowthChart";
import GrowthDeltaCard from "@/components/GrowthDeltaCard";
import { DashboardHistory } from "@/lib/dashboardSnapshot";
import { getDashboardHistory } from "@/lib/idb";
import { summarizeHistory } from "@/lib/timeSeries";

interface GrowthSectionProps {
  channelId: string;
}

/**
 * Loads the channel's IndexedDB history on mount and renders growth
 * visualisations if there are ≥2 data points. On a fresh install this
 * quietly waits for the second visit so we don't show a misleading "0%"
 * delta card on day zero.
 */
export default function GrowthSection({ channelId }: GrowthSectionProps) {
  const [history, setHistory] = useState<DashboardHistory | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Small rAF defer so we read *after* SnapshotPersister has had a chance
    // to append the freshly-loaded entry on this visit.
    const handle = window.setTimeout(() => {
      getDashboardHistory(channelId)
        .then((h) => {
          if (cancelled) return;
          setHistory(h);
          setLoaded(true);
        })
        .catch(() => {
          if (cancelled) return;
          setLoaded(true);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [channelId]);

  if (!loaded) return null;

  const summary = history ? summarizeHistory(history) : { points: [], latestDelta: null };

  if (summary.points.length < 2 || !summary.latestDelta) {
    return (
      <section className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400 md:p-6">
        Come back tomorrow to track this channel&apos;s growth over time — subs, total views,
        average views, and upload cadence trends build up as you revisit.
      </section>
    );
  }

  const previous = summary.points[summary.points.length - 2];
  const current = summary.points[summary.points.length - 1];

  return (
    <div className="flex flex-col gap-6">
      <GrowthChart points={summary.points} />
      <GrowthDeltaCard previous={previous} current={current} delta={summary.latestDelta} />
    </div>
  );
}
