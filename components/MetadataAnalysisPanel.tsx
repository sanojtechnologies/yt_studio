"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatRelativeTime, resolveBrowserStorage } from "@/components/analysisPanelShared";
import {
  MetadataCacheEntry,
  readCachedMetadata,
  writeCachedMetadata,
} from "@/lib/metadataCache";
import { MetadataAnalysis } from "@/lib/metadataPrompt";
import { YouTubeVideo } from "@/types/youtube";

interface MetadataAnalysisPanelProps {
  video: YouTubeVideo;
  isActive: boolean;
}

type Status = "idle" | "loading" | "ready" | "error";

function scoreBadgeClass(score: number): string {
  if (score >= 8) return "bg-emerald-500/20 text-emerald-200";
  if (score >= 5) return "bg-amber-500/20 text-amber-200";
  return "bg-rose-500/20 text-rose-200";
}

export default function MetadataAnalysisPanel({ video, isActive }: MetadataAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<MetadataAnalysis | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const storage = useMemo(resolveBrowserStorage, []);

  useEffect(() => {
    if (!isActive) return;
    setError("");
    const entry = readCachedMetadata(storage, video.id);
    if (entry) {
      setAnalysis(entry.analysis);
      setCachedAt(entry.savedAt);
      setStatus("ready");
    } else {
      setAnalysis(null);
      setCachedAt(null);
      setStatus("idle");
    }
  }, [isActive, video, storage]);

  const runAnalysis = useCallback(async () => {
    setStatus("loading");
    setError("");

    try {
      const response = await fetch("/api/video-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: video.id,
          title: video.title,
          description: video.description,
          tags: video.tags ?? [],
        }),
      });

      const payload = (await response.json()) as MetadataAnalysis & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to analyze metadata.");
      }

      const entry: MetadataCacheEntry | null = writeCachedMetadata(storage, video.id, payload);
      setAnalysis(payload);
      setCachedAt(entry?.savedAt ?? new Date().toISOString());
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to analyze metadata.");
    }
  }, [video, storage]);

  const isLoading = status === "loading";
  const cachedLabel = cachedAt ? formatRelativeTime(cachedAt, new Date()) : null;
  const tagCount = video.tags?.length ?? 0;

  return (
    <div>
      <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-400">
        <p>
          <span className="text-zinc-300">Title</span> ({video.title.length} chars):{" "}
          <span className="text-zinc-100">{video.title || "—"}</span>
        </p>
        <p className="mt-2">
          <span className="text-zinc-300">Description</span> ({video.description.length} chars):
        </p>
        <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-zinc-100">
          {video.description.trim() || "(no description)"}
        </p>
        <p className="mt-2">
          <span className="text-zinc-300">Tags</span> ({tagCount}):{" "}
          <span className="text-zinc-100">
            {tagCount === 0 ? "(none)" : (video.tags ?? []).join(", ")}
          </span>
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runAnalysis}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-md bg-violet-500/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading
            ? "Analyzing…"
            : analysis
            ? "Re-analyze metadata"
            : "Analyze metadata"}
        </button>
        {cachedLabel && status !== "loading" ? (
          <span
            className="text-xs text-zinc-400"
            title="Cached locally in your browser for 24 hours. Click Re-analyze to replace it."
          >
            Cached {cachedLabel}
          </span>
        ) : null}
      </div>

      {isLoading && <p className="text-sm text-zinc-400">Reviewing title, description and tags with Gemini…</p>}
      {error && status === "error" && <p className="text-sm text-rose-400">{error}</p>}

      {analysis ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <div>
              <p className="text-zinc-400">Overall SEO / Packaging Score</p>
              <p className="mt-1 text-xs text-zinc-500">Composite of title, description, and tag quality.</p>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${scoreBadgeClass(
                analysis.overallScore
              )}`}
            >
              {analysis.overallScore}/10
            </span>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-zinc-400">Title Feedback</p>
            <p className="mt-1 whitespace-pre-wrap text-zinc-100">{analysis.titleFeedback}</p>
            <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">Alternative titles</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-100">
              {analysis.titleSuggestions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-zinc-400">Description Feedback</p>
            <p className="mt-1 whitespace-pre-wrap text-zinc-100">{analysis.descriptionFeedback}</p>
            <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">
              Concrete edits to apply
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-100">
              {analysis.descriptionSuggestions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-zinc-400">Tag Feedback</p>
            <p className="mt-1 whitespace-pre-wrap text-zinc-100">{analysis.tagsFeedback}</p>
            <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">
              Suggested additional tags
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {analysis.suggestedTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-block rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-200"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-violet-600/40 bg-violet-500/10 p-3">
            <p className="text-violet-200">Top Recommendations</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-zinc-100">
              {analysis.topRecommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        </div>
      ) : (
        !isLoading &&
        status !== "error" && (
          <p className="text-sm text-zinc-400">
            Click <span className="text-zinc-200">Analyze metadata</span> to run a Gemini review
            of this video&apos;s title, description, and tags — with 3 title rewrites, 3
            description
            edits, 5 tag suggestions, and 3 prioritized recommendations. Results are cached
            locally for 24 hours.
          </p>
        )
      )}
    </div>
  );
}
