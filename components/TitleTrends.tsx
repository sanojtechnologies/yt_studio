"use client";

import { useMemo } from "react";
import Link from "next/link";
import InfoHint from "@/components/InfoHint";
import { extractNgrams, NgramEntry } from "@/lib/ngrams";
import { buildTitleTrendsDecision } from "@/lib/titleTrendsDecision";
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
  const topKeyword = unigrams[0];
  const topPhrase = bigrams[0];
  const decision = useMemo(() => buildTitleTrendsDecision(videos), [videos]);
  const titleTemplate = topPhrase
    ? `Use "${toTitleCase(topPhrase.phrase)}" as your opening phrase and append the specific outcome.`
    : topKeyword
      ? `Front-load "${toTitleCase(topKeyword.phrase)}" in your next title and keep the promise concrete.`
      : "No repeatable title signal yet. Build a 5-video micro-series around one topic cluster.";
  const confidence: "High" | "Medium" | "Low" =
    videos.length >= 20 ? "High" : videos.length >= 10 ? "Medium" : "Low";
  const confidenceStyle =
    confidence === "High"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : confidence === "Medium"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
        : "border-zinc-700 bg-zinc-800/60 text-zinc-300";

  if (unigrams.length === 0 && bigrams.length === 0) return null;
  const seedPhrase = encodeURIComponent(topPhrase?.phrase ?? topKeyword?.phrase ?? "");

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-zinc-100">Title trends</h2>
          <InfoHint label="This section identifies repeat title language that actually attracted views, then suggests what to reuse next." />
        </div>
        <p className="text-xs text-zinc-500">
          Phrases ranked by the views their titles earned.
        </p>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-xs text-zinc-500">Winning Pattern</p>
          <p className="mt-1 text-sm text-zinc-200">
            {topPhrase
              ? `"${toTitleCase(topPhrase.phrase)}" is your strongest repeated phrase by weighted views.`
              : topKeyword
                ? `"${toTitleCase(topKeyword.phrase)}" is your strongest recurring keyword.`
                : "No clear winner yet."}
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            Lift vs channel median:{" "}
            <span className="text-zinc-200">
              {decision.liftVsMedian >= 0 ? "+" : ""}
              {(decision.liftVsMedian * 100).toFixed(0)}%
            </span>
          </p>
        </article>
        <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">Signal Confidence</p>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${confidenceStyle}`}>
              {confidence}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-300">
            Based on {videos.length} recent titles and phrase repetition density.
          </p>
        </article>
        <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-xs text-zinc-500">Next Action</p>
          <p className="mt-1 text-sm text-zinc-200">{titleTemplate}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              href={`/studio/titles?seed=${seedPhrase}`}
              className="inline-flex items-center rounded-lg border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-200 hover:border-violet-400 hover:bg-violet-500/20"
              title="Open Title Lab and apply this pattern in your next title batch."
            >
              Apply This Title Pattern
            </Link>
          </div>
        </article>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-xs text-zinc-500">Novelty Guard</p>
          <p className="mt-1 text-sm text-zinc-200">
            Reuse risk: <span className="text-zinc-100">{decision.reuseRisk}</span>
          </p>
          <p className="mt-1 text-xs text-zinc-400">{decision.noveltySuggestion}</p>
        </article>
        <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-xs text-zinc-500">Format Split Winners</p>
          <p className="mt-1 text-xs text-zinc-300">
            Shorts:{" "}
            <span className="text-zinc-100">
              {decision.formatWinners[0]?.phrase ?? "Not enough signal"}
            </span>{" "}
            · {compact(decision.formatWinners[0]?.weightedViews ?? 0)} weighted views
          </p>
          <p className="mt-1 text-xs text-zinc-300">
            Long-form:{" "}
            <span className="text-zinc-100">
              {decision.formatWinners[1]?.phrase ?? "Not enough signal"}
            </span>{" "}
            · {compact(decision.formatWinners[1]?.weightedViews ?? 0)} weighted views
          </p>
        </article>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <TrendColumn heading="Keywords" entries={unigrams} />
        <TrendColumn heading="Phrases" entries={bigrams} />
      </div>
    </section>
  );
}

function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
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
