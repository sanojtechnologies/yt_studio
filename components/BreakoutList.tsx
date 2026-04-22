"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { BreakoutEntry, detectBreakouts } from "@/lib/breakout";
import { getDashboardHistory } from "@/lib/idb";
import { YouTubeVideo } from "@/types/youtube";

interface BreakoutListProps {
  channelId: string;
  currentVideos: YouTubeVideo[];
}

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

export default function BreakoutList({ channelId, currentVideos }: BreakoutListProps) {
  const [previous, setPrevious] = useState<YouTubeVideo[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      getDashboardHistory(channelId)
        .then((history) => {
          if (cancelled) return;
          // Need ≥2 entries: the newest is "current" (just appended by
          // SnapshotPersister); the one before is our baseline.
          if (!history || history.entries.length < 2) {
            setLoaded(true);
            return;
          }
          const baseline = history.entries[history.entries.length - 2];
          setPrevious(baseline.videos);
          setLoaded(true);
        })
        .catch(() => {
          if (cancelled) return;
          setLoaded(true);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [channelId]);

  const breakouts: BreakoutEntry[] = useMemo(
    () => (previous ? detectBreakouts(previous, currentVideos) : []),
    [previous, currentVideos]
  );

  if (!loaded || breakouts.length === 0) return null;

  return (
    <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">Breakouts since last visit</h2>
        <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-300">
          {breakouts.length}
        </span>
      </div>
      <ul className="mt-4 divide-y divide-emerald-500/10">
        {breakouts.map((b) => (
          <li key={b.id} className="flex items-center gap-3 py-2">
            {b.thumbnailUrl ? (
              <Image
                src={b.thumbnailUrl}
                alt={b.title}
                width={72}
                height={40}
                className="h-10 w-[72px] shrink-0 rounded object-cover"
                unoptimized
              />
            ) : (
              <div className="h-10 w-[72px] shrink-0 rounded bg-zinc-800" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-zinc-100" title={b.title}>
                {b.title}
              </p>
              <p className="text-[11px] text-zinc-500">
                {compact(b.previousViews)} → {compact(b.currentViews)} views
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
              +{b.deltaPct >= 1000 ? Math.round(b.deltaPct) : b.deltaPct.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
