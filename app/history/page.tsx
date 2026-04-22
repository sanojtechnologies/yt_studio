"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { detectBreakouts } from "@/lib/breakout";
import {
  formatRelativeAge,
  SnapshotSummary,
  summarizeHistory,
} from "@/lib/dashboardSnapshot";
import { deleteDashboardHistory, getAllDashboardHistories } from "@/lib/idb";

interface HistoryItem {
  channelId: string;
  channelTitle?: string;
  thumbnailUrl?: string;
  savedAt: string;
}

const STORAGE_KEY = "ytstudio:history";

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function ChannelAvatar({
  thumbnailUrl,
  displayName,
}: {
  thumbnailUrl?: string;
  displayName: string;
}) {
  const [broken, setBroken] = useState(false);
  const src = thumbnailUrl?.trim();
  if (!src || broken) {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-xs text-zinc-500">
        {displayName.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={displayName}
      width={40}
      height={40}
      onError={() => setBroken(true)}
      unoptimized
      className="size-10 shrink-0 rounded-full border border-zinc-800 object-cover"
    />
  );
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotSummary>>({});
  const [snapshotCounts, setSnapshotCounts] = useState<Record<string, number>>({});
  const [breakoutCounts, setBreakoutCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as HistoryItem[];
      setItems(parsed.filter((item) => item?.channelId));
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAllDashboardHistories()
      .then((all) => {
        if (cancelled) return;
        const map: Record<string, SnapshotSummary> = {};
        const counts: Record<string, number> = {};
        const breakouts: Record<string, number> = {};
        for (const history of all) {
          map[history.channelId] = summarizeHistory(history);
          counts[history.channelId] = history.entries.length;
          if (history.entries.length >= 2) {
            const prev = history.entries[history.entries.length - 2].videos;
            const curr = history.entries[history.entries.length - 1].videos;
            breakouts[history.channelId] = detectBreakouts(prev, curr).length;
          }
        }
        setSnapshots(map);
        setSnapshotCounts(counts);
        setBreakoutCounts(breakouts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
    Promise.all(items.map((item) => deleteDashboardHistory(item.channelId))).catch(() => {});
    setItems([]);
    setSnapshots({});
    setSnapshotCounts({});
    setBreakoutCounts({});
  }

  return (
    <main id="main" className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100 md:px-8">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Recent Channel Analyses</h1>
            <p className="mt-1 text-sm text-zinc-400">Channels opened recently on this browser.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/lookup"
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-violet-400 hover:text-white"
            >
              New analysis
            </Link>
            <button
              type="button"
              onClick={clearHistory}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Clear
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-zinc-400">No history yet.</p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const displayName = item.channelTitle?.trim() || item.channelId;
              const hasTitle = Boolean(item.channelTitle?.trim());
              const summary = snapshots[item.channelId];
              const snapshotCount = snapshotCounts[item.channelId] ?? 0;
              const breakoutCount = breakoutCounts[item.channelId] ?? 0;
              return (
                <Link
                  key={item.channelId}
                  href={`/dashboard/${item.channelId}`}
                  className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3 hover:border-violet-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <ChannelAvatar thumbnailUrl={item.thumbnailUrl} displayName={displayName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">{displayName}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-400">
                      {hasTitle ? <span className="truncate font-mono">{item.channelId}</span> : null}
                      {hasTitle ? <span aria-hidden className="text-zinc-700">•</span> : null}
                      <span>{new Date(item.savedAt).toLocaleString()}</span>
                    </p>
                    {summary ? (
                      <p
                        className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500"
                        title={`Cached snapshot saved ${formatRelativeAge(summary.ageMs)}`}
                      >
                        <span>{summary.videoCount} videos</span>
                        <span aria-hidden className="text-zinc-700">•</span>
                        <span>avg {compactNumber(Math.round(summary.avgViews))} views</span>
                        <span aria-hidden className="text-zinc-700">•</span>
                        <span>{summary.isFresh ? "fresh" : "stale"} cache · {formatRelativeAge(summary.ageMs)}</span>
                        {snapshotCount > 1 ? (
                          <>
                            <span aria-hidden className="text-zinc-700">•</span>
                            <span>{snapshotCount} snapshots tracked</span>
                          </>
                        ) : null}
                        {breakoutCount > 0 ? (
                          <>
                            <span aria-hidden className="text-zinc-700">•</span>
                            <span className="text-emerald-400">
                              {breakoutCount} breakout{breakoutCount === 1 ? "" : "s"}
                            </span>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <span aria-hidden className="text-zinc-500">→</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
