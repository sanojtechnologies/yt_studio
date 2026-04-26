"use client";

import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ChartPoint {
  index: number;
  views: number;
  title: string;
}

interface PerformanceChartProps {
  data: ChartPoint[];
}

interface Size {
  width: number;
  height: number;
}

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

// Self-measured container avoids recharts' `ResponsiveContainer` warning
// ("width(-1) and height(-1)") that fires during the initial zero-size render
// cycle (e.g. Suspense fallback → content swap, StrictMode double-render).
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

export default function PerformanceChart({ data }: PerformanceChartProps) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const hasSize = size.width > 0 && size.height > 0;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 md:p-6">
      <h2 className="text-lg font-semibold text-zinc-100">Performance (Last 50 Videos)</h2>
      <div ref={ref} className="mt-4 h-[320px] w-full">
        {hasSize ? (
          <LineChart
            width={size.width}
            height={size.height}
            data={data}
            margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="index" tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} />
            <YAxis
              tick={{ fill: "#a1a1aa", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={compact}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "#09090b", borderColor: "#3f3f46" }}
              formatter={(value) => [compact(Number(value ?? 0)), "Views"]}
              labelFormatter={(label, payload) => {
                const point = payload?.[0]?.payload as ChartPoint | undefined;
                const title = point?.title?.trim();
                return title ? `Video #${label}: ${title}` : `Video #${label}`;
              }}
            />
            <Line type="monotone" dataKey="views" stroke="#8b5cf6" strokeWidth={2} dot={false} />
          </LineChart>
        ) : null}
      </div>
    </section>
  );
}
