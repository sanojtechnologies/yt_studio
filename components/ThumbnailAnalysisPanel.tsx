"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { formatRelativeTime, resolveBrowserStorage } from "@/components/analysisPanelShared";
import {
  readCachedAnalysis,
  ThumbnailCacheEntry,
  writeCachedAnalysis,
} from "@/lib/thumbnailCache";
import { ThumbnailAnalysis } from "@/lib/thumbnailPrompt";
import { YouTubeVideo } from "@/types/youtube";

interface ThumbnailAnalysisPanelProps {
  video: YouTubeVideo;
  isActive: boolean;
}

type Status = "idle" | "loading" | "ready" | "error";

export default function ThumbnailAnalysisPanel({ video, isActive }: ThumbnailAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<ThumbnailAnalysis | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  // Resolved once on mount; SSR → null and cache reads become no-ops.
  const storage = useMemo(resolveBrowserStorage, []);

  // Load from cache whenever the panel becomes active for a new video.
  // Analysis never runs automatically — the user must click the button
  // so Gemini spend is always intentional.
  useEffect(() => {
    if (!isActive) return;
    setError("");
    const entry = readCachedAnalysis(storage, video.id);
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
    if (!video.thumbnailUrl) {
      setStatus("error");
      setError("This video does not have a thumbnail available.");
      return;
    }

    setStatus("loading");
    setError("");

    try {
      const response = await fetch("/api/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: video.id,
          thumbnailUrl: video.thumbnailUrl,
          title: video.title,
        }),
      });

      const payload = (await response.json()) as ThumbnailAnalysis & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to analyze thumbnail.");
      }

      const entry: ThumbnailCacheEntry | null = writeCachedAnalysis(storage, video.id, payload);
      setAnalysis(payload);
      setCachedAt(entry?.savedAt ?? new Date().toISOString());
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to analyze thumbnail.");
    }
  }, [video, storage]);

  const isLoading = status === "loading";
  const cachedLabel = cachedAt ? formatRelativeTime(cachedAt, new Date()) : null;

  return (
    <div>
      {video.thumbnailUrl ? (
        <div className="mb-4 overflow-hidden rounded-lg border border-zinc-800">
          <Image
            src={video.thumbnailUrl}
            alt={video.title}
            width={640}
            height={360}
            className="w-full object-cover"
          />
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runAnalysis}
          disabled={isLoading || !video.thumbnailUrl}
          className="inline-flex items-center gap-2 rounded-md bg-violet-500/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading
            ? "Analyzing…"
            : analysis
            ? "Re-analyze thumbnail"
            : "Analyze thumbnail"}
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

      {isLoading && <p className="text-sm text-zinc-400">Analyzing thumbnail with Gemini…</p>}
      {error && status === "error" && <p className="text-sm text-rose-400">{error}</p>}

      {analysis ? (
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-zinc-400">Face / Emotion Detection</p>
            <p className="mt-1 text-zinc-100">{analysis.faceEmotionDetection}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <p className="text-zinc-400">Text Readability</p>
              <p className="mt-1 text-zinc-100">{analysis.textReadabilityScore}/10</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <p className="text-zinc-400">Title Curiosity Gap</p>
              <p className="mt-1 text-zinc-100">{analysis.titleCuriosityGapScore}/10</p>
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-zinc-400">Color Contrast Assessment</p>
            <p className="mt-1 text-zinc-100">{analysis.colorContrastAssessment}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-zinc-400">Improvement Suggestions</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-100">
              {analysis.improvementSuggestions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        !isLoading &&
        status !== "error" && (
          <p className="text-sm text-zinc-400">
            Click <span className="text-zinc-200">Analyze thumbnail</span> to run a Gemini
            vision review of this thumbnail and title. Results are cached locally for 24 hours.
          </p>
        )
      )}
    </div>
  );
}
