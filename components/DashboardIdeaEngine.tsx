"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import InfoHint from "@/components/InfoHint";
import {
  computeDashboardIdeaOpportunity,
  DashboardIdeaOpportunity,
} from "@/lib/dashboardIdeaEngine";
import { DashboardStats } from "@/lib/stats";
import { formatTimeZoneLabel, getBrowserTimeZone } from "@/lib/timezone";
import { YouTubeVideo } from "@/types/youtube";

interface DashboardIdeaEngineProps {
  videos: YouTubeVideo[];
  stats: DashboardStats;
}

interface IdeateIdeaCard {
  title: string;
  hook: string;
  whyNow: string;
  format: "short" | "long" | "either";
  confidence: "high" | "medium" | "low";
}

function confidenceStyle(confidence: DashboardIdeaOpportunity["confidence"]): string {
  if (confidence === "High") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (confidence === "Medium") return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-zinc-700 bg-zinc-800/60 text-zinc-300";
}

export default function DashboardIdeaEngine({ videos, stats }: DashboardIdeaEngineProps) {
  const [timeZone, setTimeZone] = useState<string>("UTC");
  const [timeZoneLabel, setTimeZoneLabel] = useState<string>("UTC");
  const opportunity = useMemo(
    () => computeDashboardIdeaOpportunity(videos, stats, timeZone),
    [videos, stats, timeZone]
  );
  const [generatedIdeas, setGeneratedIdeas] = useState<IdeateIdeaCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const tz = getBrowserTimeZone();
    setTimeZone(tz);
    setTimeZoneLabel(formatTimeZoneLabel(new Date(), tz));
  }, []);

  async function generateIdeas() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/studio/ideate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywords: [opportunity.seedKeyword], ideaCount: 3 }),
      });
      const payload = (await response.json()) as { ideas?: IdeateIdeaCard[]; error?: string };
      if (!response.ok || !Array.isArray(payload.ideas)) {
        throw new Error(payload.error ?? "Failed to generate ideas. Try again.");
      }
      setGeneratedIdeas(payload.ideas.slice(0, 3));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate ideas. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-100">Idea Opportunity Engine</h2>
            <InfoHint label="Turns current channel signals into an immediate idea direction and one-click ideation." />
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            What you should make next, and why now.
          </p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${confidenceStyle(opportunity.confidence)}`}>
          {opportunity.confidence} Confidence
        </span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-4">
        <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 lg:col-span-2">
          <p className="text-xs text-zinc-500">Top Opportunity Angle</p>
          <p className="mt-1 text-sm text-zinc-200">{opportunity.topOpportunityAngle}</p>
        </article>
        <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-xs text-zinc-500">Best Format</p>
          <p className="mt-1 text-sm text-zinc-200 capitalize">{opportunity.bestFormat}</p>
        </article>
        <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-xs text-zinc-500">Best Publish Window</p>
          <p className="mt-1 text-sm text-zinc-200">
            {opportunity.bestPublishWindow} {opportunity.bestPublishWindow === "No reliable slot yet" ? "" : timeZoneLabel}
          </p>
        </article>
      </div>

      <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
        <p className="text-xs text-zinc-500">Why Now</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
          {opportunity.whyNow.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void generateIdeas()}
          disabled={loading}
          className="inline-flex items-center rounded-lg border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-200 hover:border-violet-400 hover:bg-violet-500/20 disabled:opacity-60"
        >
          {loading ? "Generating Ideas…" : "Generate 3 Data-Grounded Ideas"}
        </button>
        <Link
          href={`/studio/ideate?keywords=${encodeURIComponent(opportunity.seedKeyword)}`}
          className="inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:border-violet-400 hover:text-zinc-100"
        >
          Open Video Ideate
        </Link>
        {opportunity.sparseSignal ? (
          <span className="text-xs text-zinc-500">Signal is sparse; validate ideas with small tests.</span>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}

      {generatedIdeas.length > 0 ? (
        <ul className="mt-3 grid gap-3 lg:grid-cols-3">
          {generatedIdeas.map((idea) => (
            <li
              key={`${idea.title}-${idea.hook}`}
              className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-100">{idea.title}</p>
                <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">
                  {idea.format}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-300">{idea.hook}</p>
              <p className="mt-1 text-xs text-zinc-400">{idea.whyNow}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
