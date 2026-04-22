"use client";

import { useEffect, useMemo, useState } from "react";
import InfoHint from "@/components/InfoHint";
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

function formatScore(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
}

export default function PublishHeatmap({ videos }: PublishHeatmapProps) {
  // Render first in UTC to match the server snapshot, then swap to the
  // browser's zone after mount so hydration is stable. `timeZoneLabel`
  // mirrors the state so the header stays consistent with the grid.
  const [timeZone, setTimeZone] = useState<string>("UTC");
  const [timeZoneLabel, setTimeZoneLabel] = useState<string>("UTC");
  const [applyStatus, setApplyStatus] = useState<string>("");

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
  const topSlots = useMemo(() => {
    const ranked = result.cells.filter((cell) => cell.count > 0 && cell.recommendationScore > 0);
    const eligible = ranked.filter((cell) => cell.count >= 2);
    const source = eligible.length > 0 ? eligible : ranked;
    return source.sort((a, b) => b.recommendationScore - a.recommendationScore).slice(0, 3);
  }, [result.cells]);
  const totalPublished = useMemo(
    () => result.cells.reduce((sum, cell) => sum + cell.count, 0),
    [result.cells]
  );
  const bestCellShare = result.bestCell && totalPublished > 0 ? result.cells
    .find((cell) => cell.day === result.bestCell?.day && cell.hour === result.bestCell?.hour)?.count ?? 0 : 0;
  const confidence: "High" | "Medium" | "Low" =
    totalPublished >= 25 ? "High" : totalPublished >= 12 ? "Medium" : "Low";
  const confidenceStyle =
    confidence === "High"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : confidence === "Medium"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
        : "border-zinc-700 bg-zinc-800/60 text-zinc-300";
  const interpretation = !result.bestCell
    ? "Not enough publish-time density yet to identify reliable slot advantage."
    : bestCellShare >= 3
      ? "Strong repeatability in your best slot. This is a dependable publishing window."
      : "Best slot exists, but sample depth is thin. Treat this as a hypothesis and validate.";
  const nextAction = !result.bestCell
    ? "Publish 6-8 videos across varied days/hours to generate enough timing signal."
    : `Schedule your next 2 uploads near ${DAY_NAMES_SHORT[result.bestCell.day]} ${String(result.bestCell.hour).padStart(2, "0")}:00 ${timeZoneLabel} and compare median views vs your baseline.`;

  function formatIcsUtc(date: Date): string {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function nextSlotDate(day: number, hour: number): Date {
    const now = new Date();
    const candidate = new Date(now);
    candidate.setMinutes(0, 0, 0);
    candidate.setHours(hour);
    const dayDelta = (day - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + dayDelta);
    if (candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 7);
    }
    return candidate;
  }

  function nextSlotDates(day: number, hour: number, count: number): Date[] {
    if (count <= 0) return [];
    const first = nextSlotDate(day, hour);
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(first);
      date.setDate(first.getDate() + index * 7);
      return date;
    });
  }

  async function applyTimingAction() {
    if (!result.bestCell || typeof window === "undefined" || typeof document === "undefined") return;
    try {
      const starts = nextSlotDates(result.bestCell.day, result.bestCell.hour, 2);
      const events = starts
        .map((start, index) => {
          const end = new Date(start.getTime() + 60 * 60 * 1000);
          const uid = `ytstudio-${start.getTime()}-${index}@local`;
          return [
            "BEGIN:VEVENT",
            `UID:${uid}`,
            `DTSTAMP:${formatIcsUtc(new Date())}`,
            `DTSTART:${formatIcsUtc(start)}`,
            `DTEND:${formatIcsUtc(end)}`,
            `SUMMARY:Publish Video ${index + 1}`,
            `DESCRIPTION:${nextAction}`,
            "END:VEVENT",
          ].join("\r\n");
        })
        .join("\r\n");
      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//YT Studio//Publish Timing//EN",
        events,
        "END:VCALENDAR",
      ].join("\r\n");
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ytstudio-next-2-publish-slots.ics";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setApplyStatus("2 Draft Events Created");
    } catch {
      setApplyStatus("Could Not Create Draft");
    }
    window.setTimeout(() => setApplyStatus(""), 1800);
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 md:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-100">Publish-time heatmap</h2>
            <InfoHint label="Use this to decide when to publish next. Brighter cells indicate stronger channel-specific timing outcomes." />
          </div>
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
            ({compact(result.bestCell.medianViews)} median views · {result.bestCell.count} upload{result.bestCell.count > 1 ? "s" : ""})
          </p>
        ) : (
          <p className="text-xs text-zinc-500">No publishable signal yet.</p>
        )}
      </header>

      {result.bestCell ? (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-zinc-300">Why this slot?</p>
            <InfoHint label="Slots are ranked by reliability score: median views × ln(1 + number of uploads in that slot). This balances performance and evidence depth." />
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Median: <span className="text-zinc-200">{compact(result.bestCell.medianViews)}</span> ·
            Samples: <span className="text-zinc-200"> {result.bestCell.count}</span> ·
            Score: <span className="text-zinc-200"> {formatScore(result.bestCell.score)}</span>
          </p>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-xs text-zinc-500">Interpretation</p>
          <p className="mt-1 text-sm text-zinc-200">{interpretation}</p>
        </article>
        <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">Signal Confidence</p>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${confidenceStyle}`}>
              {confidence}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-300">
            Based on {totalPublished} timestamped uploads in this sample.
          </p>
        </article>
        <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-xs text-zinc-500">Next Action</p>
          <p className="mt-1 text-sm text-zinc-200">{nextAction}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={applyTimingAction}
              className="inline-flex items-center rounded-lg border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-200 hover:border-violet-400 hover:bg-violet-500/20"
              title="Download a calendar draft with your next 2 best-slot publish events."
            >
              Create 2 Calendar Drafts
            </button>
            {applyStatus ? <span className="text-xs text-zinc-400">{applyStatus}</span> : null}
          </div>
        </article>
      </div>

      {topSlots.length > 0 ? (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-xs text-zinc-500">Top Windows To Test</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {topSlots.map((slot) => (
              <span
                key={`${slot.day}-${slot.hour}`}
                className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs text-violet-200"
                title={`${slot.count} uploads in this slot`}
              >
                {DAY_NAMES_SHORT[slot.day]} {String(slot.hour).padStart(2, "0")}:00 · {compact(slot.medianViews)} median
              </span>
            ))}
          </div>
        </div>
      ) : null}

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
                      : `${day} ${hour}:00 ${timeZoneLabel} — ${cell.count} video${cell.count > 1 ? "s" : ""}, median ${compact(cell.medianViews)} views, peak ${compact(cell.maxViews)} views`;
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
