"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import ThumbnailAnalyzer from "@/components/ThumbnailAnalyzer";
import { classifyVideoFormat, SHORT_MAX_SECONDS, VideoFormat } from "@/lib/duration";
import {
  computeEngagementReport,
  EngagementAnnotation,
  EngagementBucket,
} from "@/lib/engagement";
import { computeOutliers, OutlierKind } from "@/lib/outliers";
import { YouTubeVideo } from "@/types/youtube";

interface VideoGridProps {
  videos: YouTubeVideo[];
}

type FilterMode = "all" | "outliers";
type FormatFilter = "all" | VideoFormat;

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

const ENGAGEMENT_BADGE_STYLES: Record<EngagementBucket, { label: string; className: string }> = {
  high: { label: "High engagement", className: "bg-emerald-500/20 text-emerald-300" },
  normal: { label: "Normal engagement", className: "bg-zinc-700/40 text-zinc-200" },
  below: { label: "Below average", className: "bg-amber-500/20 text-amber-200" },
  na: {
    label: "Engagement N/A",
    className: "border border-zinc-700 text-zinc-400",
  },
};

function engagementTooltip(annotation: EngagementAnnotation): string {
  const formatLabel = annotation.format === "short" ? "Shorts" : "long-form";
  if (annotation.bucket === "na") {
    return `No engagement signal yet (no views, or likes & comments are both 0). Format: ${formatLabel}.`;
  }
  return (
    `This video: ${annotation.rate.toFixed(2)}% engagement. ` +
    `Channel median for ${formatLabel}: ${annotation.medianForFormat.toFixed(2)}%. ` +
    `Classification is relative to the creator's own ${formatLabel} baseline.`
  );
}

function outlierBadge(kind: OutlierKind | undefined): { label: string; className: string } | null {
  if (!kind || kind === "normal") return null;
  if (kind === "over") {
    return {
      label: "Outperformer",
      className: "bg-violet-500/25 text-violet-200",
    };
  }
  return {
    label: "Underperformer",
    className: "bg-zinc-700/40 text-zinc-300",
  };
}

export default function VideoGrid({ videos }: VideoGridProps) {
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);
  const [mode, setMode] = useState<FilterMode>("all");
  const [format, setFormat] = useState<FormatFilter>("all");

  const formatByVideo = useMemo(() => {
    const map = new Map<string, VideoFormat>();
    for (const v of videos) map.set(v.id, classifyVideoFormat(v));
    return map;
  }, [videos]);

  const formatCounts = useMemo(() => {
    let shorts = 0;
    formatByVideo.forEach((v) => {
      if (v === "short") shorts += 1;
    });
    return { shorts, long: videos.length - shorts };
  }, [formatByVideo, videos.length]);

  const formatFiltered = useMemo(() => {
    if (format === "all") return videos;
    return videos.filter((v) => formatByVideo.get(v.id) === format);
  }, [format, videos, formatByVideo]);

  const report = useMemo(() => computeOutliers(formatFiltered), [formatFiltered]);

  // Engagement is computed over the full sample (not `formatFiltered`) so a
  // video's badge doesn't shift as the user toggles format filters — the
  // baseline for a Short is always the channel's Shorts baseline.
  const engagementReport = useMemo(() => computeEngagementReport(videos), [videos]);

  const visible = useMemo(() => {
    if (mode === "all") return formatFiltered;
    return formatFiltered.filter((v) => {
      const annotation = report.annotations.get(v.id);
      return annotation?.kind === "over" || annotation?.kind === "under";
    });
  }, [mode, formatFiltered, report]);

  const outlierCount = useMemo(() => {
    let count = 0;
    report.annotations.forEach((a) => {
      if (a.kind !== "normal") count += 1;
    });
    return count;
  }, [report]);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">Latest Videos</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-1 text-xs"
            title={`Classified using YouTube's own /shorts/{id} endpoint server-side (24h cache). If a probe is inconclusive we fall back to a duration check: videos ≤ ${SHORT_MAX_SECONDS}s are treated as Shorts.`}
          >
            <button
              type="button"
              onClick={() => setFormat("all")}
              className={`rounded-md px-3 py-1 ${
                format === "all" ? "bg-sky-500/20 text-sky-200" : "text-zinc-400"
              }`}
            >
              All ({videos.length})
            </button>
            <button
              type="button"
              onClick={() => setFormat("short")}
              disabled={formatCounts.shorts === 0}
              className={`rounded-md px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                format === "short" ? "bg-sky-500/20 text-sky-200" : "text-zinc-400"
              }`}
            >
              Shorts ({formatCounts.shorts})
            </button>
            <button
              type="button"
              onClick={() => setFormat("long")}
              disabled={formatCounts.long === 0}
              className={`rounded-md px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                format === "long" ? "bg-sky-500/20 text-sky-200" : "text-zinc-400"
              }`}
            >
              Long-form ({formatCounts.long})
            </button>
          </div>
          <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("all")}
              className={`rounded-md px-3 py-1 ${
                mode === "all" ? "bg-violet-500/20 text-violet-200" : "text-zinc-400"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setMode("outliers")}
              disabled={outlierCount === 0}
              className={`rounded-md px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                mode === "outliers" ? "bg-violet-500/20 text-violet-200" : "text-zinc-400"
              }`}
            >
              Outliers ({outlierCount})
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((video) => {
          const annotation = engagementReport.annotations.get(video.id);
          const badge = annotation ? ENGAGEMENT_BADGE_STYLES[annotation.bucket] : null;
          const outlier = outlierBadge(report.annotations.get(video.id)?.kind);
          return (
            <button
              key={video.id}
              type="button"
              onClick={() => setSelectedVideo(video)}
              className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 text-left transition hover:border-violet-500/60"
            >
              <div className="aspect-video overflow-hidden rounded-lg bg-zinc-800">
                {video.thumbnailUrl ? (
                  <Image
                    src={video.thumbnailUrl}
                    alt={video.title}
                    width={640}
                    height={360}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <h3 className="mt-3 line-clamp-2 text-sm font-medium text-zinc-100">{video.title}</h3>
              <p className="mt-1 text-xs text-zinc-400">{compact(video.viewCount)} views</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {badge && annotation ? (
                  <span
                    className={`inline-block rounded-full px-2 py-1 text-xs ${badge.className}`}
                    title={engagementTooltip(annotation)}
                  >
                    {badge.label}
                  </span>
                ) : null}
                {outlier ? (
                  <span className={`inline-block rounded-full px-2 py-1 text-xs ${outlier.className}`}>
                    {outlier.label}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
      <ThumbnailAnalyzer
        video={selectedVideo}
        isOpen={Boolean(selectedVideo)}
        onClose={() => setSelectedVideo(null)}
      />
    </section>
  );
}
