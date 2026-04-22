"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { COMPARE_GAP_LIMITS, CompareGapResponse } from "@/lib/compareGapPrompt";

interface CompareGapClientProps {
  ids: string[];
}

export default function CompareGapClient({ ids }: CompareGapClientProps) {
  const [focus, setFocus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CompareGapResponse | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setData(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ ids: ids.join(",") });
      if (focus.trim()) params.set("focus", focus.trim());
      const res = await fetch(`/api/compare/gap?${params.toString()}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? `Request failed (${res.status}).`);
      setData(payload as CompareGapResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run gap analysis.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-5">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <label className="block text-sm">
          <span className="text-zinc-300">Focus (optional)</span>
          <textarea
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            maxLength={COMPARE_GAP_LIMITS.maxFocusLength}
            placeholder="e.g. Focus on tutorials for junior devs"
            className="mt-1 h-24 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-center justify-between">
          {error ? <p className="text-sm text-rose-400">{error}</p> : <span />}
          <button
            type="submit"
            disabled={loading || ids.length < COMPARE_GAP_LIMITS.minChannels}
            className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Analyzing…" : "Run Gap Analysis"}
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Channels:{" "}
          {ids.length ? (
            ids.join(", ")
          ) : (
            <Link href="/compare" className="text-violet-300 hover:underline">
              pick channels first
            </Link>
          )}
        </p>
      </form>
      {data ? <GapResult data={data} /> : null}
    </section>
  );
}

function GapResult({ data }: { data: CompareGapResponse }) {
  return (
    <article className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h2 className="text-sm font-semibold text-zinc-100">Shared topics</h2>
        {data.sharedTopics.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.sharedTopics.map((t) => (
              <li
                key={t}
                className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200"
              >
                {t}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No shared topics detected.</p>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {data.perChannelGaps.map((gap) => (
          <div
            key={gap.channelId}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5"
          >
            <p className="text-xs uppercase tracking-wide text-zinc-500">{gap.channelId}</p>
            <h3 className="mt-1 text-sm font-semibold text-zinc-100">Missing topics</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {gap.missingTopics.map((t) => (
                <li
                  key={t}
                  className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs text-violet-200"
                >
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-zinc-300">{gap.notes}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
