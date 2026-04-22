"use client";

import { useMemo } from "react";
import type { DeltaRow, GrowthPoint } from "@/lib/timeSeries";

interface GrowthDeltaCardProps {
  previous: GrowthPoint;
  current: GrowthPoint;
  delta: DeltaRow;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

function formatDelta(value: number, digits = 0): { text: string; tone: "up" | "down" | "flat" } {
  if (value === 0) return { text: "±0", tone: "flat" };
  const tone = value > 0 ? "up" : "down";
  const sign = value > 0 ? "+" : "−";
  const abs = Math.abs(value);
  const text = digits > 0 ? `${sign}${abs.toFixed(digits)}` : `${sign}${compact(abs)}`;
  return { text, tone };
}

function describeSpan(ms: number): string {
  const days = ms / MS_PER_DAY;
  if (days < 1) {
    const hours = Math.max(Math.round(ms / (60 * 60 * 1000)), 1);
    return hours === 1 ? "in the last hour" : `in the last ${hours} hours`;
  }
  const rounded = Math.round(days);
  if (rounded === 1) return "since yesterday";
  return `in the last ${rounded} days`;
}

function toneClass(tone: "up" | "down" | "flat"): string {
  if (tone === "up") return "text-emerald-400";
  if (tone === "down") return "text-rose-400";
  return "text-zinc-400";
}

export default function GrowthDeltaCard({ previous, current, delta }: GrowthDeltaCardProps) {
  const spanLabel = useMemo(() => describeSpan(delta.spanMs), [delta.spanMs]);

  const rows = [
    {
      label: "Subscribers",
      current: current.subCount,
      previous: previous.subCount,
      delta: formatDelta(delta.subCountDelta),
    },
    {
      label: "Total views",
      current: current.totalViews,
      previous: previous.totalViews,
      delta: formatDelta(delta.totalViewsDelta),
    },
    {
      label: "Avg views / video",
      current: Math.round(current.avgViews),
      previous: Math.round(previous.avgViews),
      delta: formatDelta(delta.avgViewsDelta),
    },
    {
      label: "Uploads / week",
      current: Number(current.uploadsPerWeek.toFixed(2)),
      previous: Number(previous.uploadsPerWeek.toFixed(2)),
      delta: formatDelta(delta.uploadsPerWeekDelta, 2),
    },
  ];

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">What changed</h2>
        <span className="text-xs text-zinc-500">{spanLabel}</span>
      </div>
      <dl className="mt-4 grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
          >
            <dt className="text-xs uppercase tracking-wide text-zinc-500">{row.label}</dt>
            <dd className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-lg font-semibold text-zinc-100">{compact(row.current)}</span>
              <span className={`text-sm font-medium ${toneClass(row.delta.tone)}`}>
                {row.delta.text}
              </span>
            </dd>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              was {compact(row.previous)} {spanLabel}
            </p>
          </div>
        ))}
      </dl>
    </section>
  );
}
