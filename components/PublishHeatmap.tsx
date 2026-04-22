"use client";

import { useEffect, useMemo, useState } from "react";
import { buildPublishHeatmap, DAY_NAMES_SHORT, HeatmapResult } from "@/lib/heatmap";
import { formatTimeZoneLabel, getBrowserTimeZone } from "@/lib/timezone";
import { YouTubeVideo } from "@/types/youtube";

interface PublishHeatmapProps {
  videos: YouTubeVideo[];
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function intensity(cell: { medianViews: number; count: number }, max: number): number {
  if (cell.count === 0 || max === 0) return 0;
  return Math.min(1, cell.medianViews / max);
}

function colourForIntensity(value: number): string {
  if (value === 0) return "rgba(63,63,70,0.35)";
  // Violet 500 (139, 92, 246) at variable alpha; clamp to 0.18..1 so faint
  // cells are still visible on the dark background.
  const alpha = 0.18 + value * 0.82;
  return `rgba(139, 92, 246, ${alpha.toFixed(3)})`;
}

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

export default function PublishHeatmap({ videos }: PublishHeatmapProps) {
  // Render first in UTC to match the server snapshot, then swap to the
  // browser's zone after mount so hydration is stable. `timeZoneLabel`
  // mirrors the state so the header stays consistent with the grid.
  const [timeZone, setTimeZone] = useState<string>("UTC");
  const [timeZoneLabel, setTimeZoneLabel] = useState<string>("UTC");

  useEffect(() => {
    const tz = getBrowserTimeZone();
    setTimeZone(tz);
    setTimeZoneLabel(formatTimeZoneLabel(new Date(), tz));
  }, []);

  const result: HeatmapResult = useMemo(
    () => buildPublishHeatmap(videos, timeZone),
    [videos, timeZone]
  );
  const cellByKey = useMemo(
    () => new Map(result.cells.map((cell) => [`${cell.day}:${cell.hour}`, cell])),
    [result.cells]
  );

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 md:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Publish-time heatmap</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Weekday × hour ({timeZoneLabel}). Cell colour = median view count of videos published in that slot.
          </p>
        </div>
        {result.bestCell ? (
          <p className="text-xs text-zinc-400">
            Strongest slot:{" "}
            <span className="text-violet-300">
              {DAY_NAMES_SHORT[result.bestCell.day]} · {String(result.bestCell.hour).padStart(2, "0")}:00 {timeZoneLabel}
            </span>{" "}
            ({compact(result.bestCell.medianViews)} median views)
          </p>
        ) : (
          <p className="text-xs text-zinc-500">No publishable signal yet.</p>
        )}
      </header>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="w-10 text-zinc-500" scope="col"></th>
              {HOURS.map((hour) => (
                <th
                  key={hour}
                  scope="col"
                  className="px-1 text-center font-normal text-zinc-500"
                >
                  {hour % 3 === 0 ? hour.toString().padStart(2, "0") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_NAMES_SHORT.map((day, dayIdx) => (
              <tr key={day}>
                <th scope="row" className="pr-2 text-right text-zinc-400">
                  {day}
                </th>
                {HOURS.map((hour) => {
                  const cell = cellByKey.get(`${dayIdx}:${hour}`)!;
                  const fill = colourForIntensity(intensity(cell, result.maxMedianViews));
                  const label =
                    cell.count === 0
                      ? `${day} ${hour}:00 ${timeZoneLabel} — no videos`
                      : `${day} ${hour}:00 ${timeZoneLabel} — ${cell.count} video${cell.count > 1 ? "s" : ""}, median ${compact(cell.medianViews)} views`;
                  return (
                    <td
                      key={hour}
                      title={label}
                      aria-label={label}
                      className="h-6 rounded-[3px]"
                      style={{ backgroundColor: fill }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
