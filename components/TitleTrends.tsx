"use client";

import { useMemo } from "react";
import { extractNgrams, NgramEntry } from "@/lib/ngrams";
import { YouTubeVideo } from "@/types/youtube";

interface TitleTrendsProps {
  videos: YouTubeVideo[];
}

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

export default function TitleTrends({ videos }: TitleTrendsProps) {
  const unigrams: NgramEntry[] = useMemo(
    () => extractNgrams(videos, { n: 1, minCount: 2, limit: 12 }),
    [videos]
  );
  const bigrams: NgramEntry[] = useMemo(
    () => extractNgrams(videos, { n: 2, minCount: 2, limit: 12 }),
    [videos]
  );

  if (unigrams.length === 0 && bigrams.length === 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">Title trends</h2>
        <p className="text-xs text-zinc-500">
          Phrases ranked by the views their titles earned.
        </p>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <TrendColumn heading="Keywords" entries={unigrams} />
        <TrendColumn heading="Phrases" entries={bigrams} />
      </div>
    </section>
  );
}

function TrendColumn({ heading, entries }: { heading: string; entries: NgramEntry[] }) {
  if (entries.length === 0) {
    return (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{heading}</h3>
        <p className="mt-2 text-xs text-zinc-500">Not enough repetition yet.</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{heading}</h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {entries.map((entry) => (
          <li
            key={entry.phrase}
            className="flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs text-violet-200"
            title={`${entry.count} uses · ${compact(entry.weightedViews)} weighted views`}
          >
            <span>{entry.phrase}</span>
            <span className="text-[10px] text-violet-300/80">×{entry.count}</span>
            <span className="text-[10px] text-violet-300/60">{compact(entry.weightedViews)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
