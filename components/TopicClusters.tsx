"use client";

import { FormEvent, useState } from "react";
import type { AggregateClusterStats } from "@/lib/cluster";
import type { ClusterIdea, ClusterIdeasResponse } from "@/lib/clusterIdeasPrompt";

interface HistoryEntry {
  channelId: string;
  channelTitle?: string;
}

function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem("ytstudio:history");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatViews(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export default function TopicClusters() {
  const [channelId, setChannelId] = useState("");
  const [desired, setDesired] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clusters, setClusters] = useState<AggregateClusterStats[] | null>(null);

  const history = typeof window === "undefined" ? [] : readHistory();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setClusters(null);
    setLoading(true);
    try {
      const res = await fetch("/api/studio/clusters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: channelId.trim(), desiredClusters: desired }),
      });
      const payload = (await res.json()) as {
        clusters?: AggregateClusterStats[];
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        throw new Error(
          payload.detail ? `${payload.error ?? "Request failed"}: ${payload.detail}` : payload.error ?? `Request failed (${res.status}).`
        );
      }
      setClusters(payload.clusters ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cluster topics.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <label className="block text-sm">
          <span className="text-zinc-300">Channel</span>
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            required
          >
            <option value="">Pick a channel from history…</option>
            {history.map((entry) => (
              <option key={entry.channelId} value={entry.channelId}>
                {entry.channelTitle || entry.channelId}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm md:w-1/3">
          <span className="text-zinc-300">Clusters</span>
          <input
            type="number"
            min={2}
            max={8}
            value={desired}
            onChange={(e) => setDesired(Math.max(2, Math.min(8, Number(e.target.value) || 5)))}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !channelId}
          className="rounded-xl bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Clustering…" : "Cluster Topics"}
        </button>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      </form>

      {clusters ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {clusters.map((cluster) => (
            <ClusterCard key={cluster.clusterId} cluster={cluster} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ClusterCard({ cluster }: { cluster: AggregateClusterStats }) {
  const [ideas, setIdeas] = useState<ClusterIdea[] | null>(null);
  const [ideating, setIdeating] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);

  async function ideate() {
    setIdeasError(null);
    setIdeating(true);
    try {
      const res = await fetch("/api/studio/clusters/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: `Theme ${cluster.clusterId + 1}`,
          sampleTitles: cluster.representativeTitles,
          medianViews: cluster.medianViews,
        }),
      });
      const payload = (await res.json()) as ClusterIdeasResponse & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? `Request failed (${res.status}).`);
      setIdeas(payload.ideas ?? []);
    } catch (err) {
      setIdeasError(err instanceof Error ? err.message : "Could not ideate.");
    } finally {
      setIdeating(false);
    }
  }

  return (
    <li className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">
          Theme {cluster.clusterId + 1}
        </h3>
        <span className="text-xs text-zinc-500">{cluster.totalVideos} videos</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-300">
        <span className="rounded-full bg-violet-500/15 px-2 py-1">
          Median {formatViews(cluster.medianViews)}
        </span>
        <span className="rounded-full bg-blue-500/15 px-2 py-1">
          Avg {formatViews(Math.round(cluster.avgViews))}
        </span>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-zinc-200">
        {cluster.representativeTitles.map((title) => (
          <li key={title} className="truncate">• {title}</li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={ideate}
          disabled={ideating}
          className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 hover:border-violet-400 hover:text-white disabled:opacity-50"
        >
          {ideating ? "Ideating…" : "Ideate For This Cluster"}
        </button>
        {ideasError ? <p className="text-xs text-rose-400">{ideasError}</p> : null}
      </div>
      {ideas ? (
        <ul className="mt-3 space-y-2 text-sm text-zinc-200">
          {ideas.map((idea, i) => (
            <li key={i} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="font-semibold text-zinc-100">{idea.title}</p>
              <p className="mt-1 text-xs text-zinc-400">Hook: {idea.hook}</p>
              <p className="mt-1 text-xs text-zinc-500">Why: {idea.why}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
