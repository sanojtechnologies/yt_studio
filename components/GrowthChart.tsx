"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GrowthPoint } from "@/lib/timeSeries";

interface GrowthChartProps {
  points: GrowthPoint[];
}

interface Size {
  width: number;
  height: number;
}

const SERIES: { key: keyof GrowthPoint; label: string; color: string }[] = [
  { key: "subCount", label: "Subscribers", color: "#a78bfa" },
  { key: "totalViews", label: "Total views", color: "#38bdf8" },
  { key: "avgViews", label: "Avg views / video", color: "#f472b6" },
  { key: "uploadsPerWeek", label: "Uploads / week", color: "#fbbf24" },
];

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

export default function GrowthChart({ points }: GrowthChartProps) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const hasSize = size.width > 0 && size.height > 0;

  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SERIES.map((s) => [s.key, true]))
  );

  const data = useMemo(
    () =>
      points.map((p) => ({
        label: new Date(p.savedAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        subCount: p.subCount,
        totalViews: p.totalViews,
        avgViews: Math.round(p.avgViews),
        uploadsPerWeek: Number(p.uploadsPerWeek.toFixed(2)),
      })),
    [points]
  );

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Growth over time</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Snapshots captured on this browser. Visit again to add more data points.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {SERIES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setEnabled((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
              aria-pressed={enabled[s.key]}
              className="rounded-full border px-2.5 py-1 transition"
              style={{
                borderColor: enabled[s.key] ? s.color : "#3f3f46",
                color: enabled[s.key] ? s.color : "#a1a1aa",
                backgroundColor: enabled[s.key] ? `${s.color}1a` : "transparent",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={ref} className="mt-4 h-[320px] w-full">
        {hasSize ? (
          <LineChart
            width={size.width}
            height={size.height}
            data={data}
            margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} />
            <YAxis
              tick={{ fill: "#a1a1aa", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={compact}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "#09090b", borderColor: "#3f3f46" }}
              formatter={(value, name) => [compact(Number(value ?? 0)), String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} />
            {SERIES.map((s) =>
              enabled[s.key] ? (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                />
              ) : null
            )}
          </LineChart>
        ) : null}
      </div>
    </section>
  );
}
