import Image from "next/image";
import Link from "next/link";
import { ChannelComparisonRow } from "@/lib/compareStats";

interface CompareTableProps {
  rows: ChannelComparisonRow[];
}

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

const METRIC_ROWS: Array<{
  key: string;
  label: string;
  best: "max" | "min";
  format: (row: ChannelComparisonRow) => string;
  value: (row: ChannelComparisonRow) => number;
}> = [
  {
    key: "subs",
    label: "Subscribers",
    best: "max",
    format: (r) => compact(r.channel.subscriberCount),
    value: (r) => r.channel.subscriberCount,
  },
  {
    key: "totalViews",
    label: "Lifetime views",
    best: "max",
    format: (r) => compact(r.channel.viewCount),
    value: (r) => r.channel.viewCount,
  },
  {
    key: "videoCount",
    label: "Sample size",
    best: "max",
    format: (r) => `${r.videoCount} videos`,
    value: (r) => r.videoCount,
  },
  {
    key: "avgViews",
    label: "Avg views / video",
    best: "max",
    format: (r) => compact(r.stats.avgViews),
    value: (r) => r.stats.avgViews,
  },
  {
    key: "median",
    label: "Median views / video",
    best: "max",
    format: (r) => compact(r.medianViews),
    value: (r) => r.medianViews,
  },
  {
    key: "engagement",
    label: "Engagement rate",
    best: "max",
    format: (r) => `${r.stats.engagementRate.toFixed(2)}%`,
    value: (r) => r.stats.engagementRate,
  },
  {
    key: "cadence",
    label: "Uploads / week",
    best: "max",
    format: (r) => r.stats.uploadFrequencyPerWeek.toFixed(1),
    value: (r) => r.stats.uploadFrequencyPerWeek,
  },
];

function bestIndex(rows: ChannelComparisonRow[], pick: (r: ChannelComparisonRow) => number, mode: "max" | "min"): number {
  let bestIdx = 0;
  for (let i = 1; i < rows.length; i++) {
    const current = pick(rows[i]);
    const candidate = pick(rows[bestIdx]);
    if (mode === "max" ? current > candidate : current < candidate) bestIdx = i;
  }
  return bestIdx;
}

export default function CompareTable({ rows }: CompareTableProps) {
  if (rows.length === 0) return null;

  return (
    <section className="space-y-6">
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
        {rows.map((row) => (
          <article
            key={row.channel.id}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4"
          >
            <div className="flex items-center gap-3">
              {row.channel.thumbnailUrl ? (
                <Image
                  src={row.channel.thumbnailUrl}
                  alt={row.channel.title}
                  width={48}
                  height={48}
                  className="size-12 rounded-full border border-zinc-700"
                />
              ) : (
                <div className="flex size-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs text-zinc-400">
                  {row.channel.title.charAt(0).toUpperCase() || "?"}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-zinc-100">
                  {row.channel.title}
                </h3>
                <Link
                  href={`/dashboard/${row.channel.id}`}
                  className="text-xs text-violet-300 hover:text-violet-200"
                >
                  Open dashboard →
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th scope="col" className="px-4 py-3 text-left">Metric</th>
              {rows.map((row) => (
                <th key={row.channel.id} scope="col" className="px-4 py-3 text-left">
                  {row.channel.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRIC_ROWS.map((metric) => {
              const winner = bestIndex(rows, metric.value, metric.best);
              return (
                <tr key={metric.key} className="border-t border-zinc-800">
                  <th scope="row" className="px-4 py-3 text-left font-medium text-zinc-300">
                    {metric.label}
                  </th>
                  {rows.map((row, idx) => (
                    <td
                      key={row.channel.id}
                      className={`px-4 py-3 ${
                        idx === winner ? "font-semibold text-emerald-300" : "text-zinc-200"
                      }`}
                    >
                      {metric.format(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
        {rows.map((row) => (
          <article
            key={`top-${row.channel.id}`}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4"
          >
            <h4 className="text-xs uppercase tracking-wide text-zinc-500">
              Top videos · {row.channel.title}
            </h4>
            <ol className="mt-3 space-y-2 text-sm">
              {row.topVideos.length === 0 ? (
                <li className="text-zinc-500">No videos in window.</li>
              ) : (
                row.topVideos.map((video) => (
                  <li key={video.id} className="flex items-center justify-between gap-3">
                    <span className="line-clamp-2 text-zinc-100">{video.title}</span>
                    <span className="shrink-0 text-xs text-zinc-400">
                      {compact(video.viewCount)}
                    </span>
                  </li>
                ))
              )}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}
