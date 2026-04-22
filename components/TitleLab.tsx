"use client";

import { FormEvent, useState } from "react";
import type { TitleLabResponse } from "@/lib/titleLabPrompt";

interface HistoryEntry {
  channelId: string;
  channelTitle?: string;
}

function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem("ytstudio:history");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function TitleLab() {
  const [channelId, setChannelId] = useState("");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TitleLabResponse | null>(null);

  const history = typeof window === "undefined" ? [] : readHistory();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setData(null);
    setLoading(true);
    try {
      const res = await fetch("/api/studio/titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: channelId.trim(),
          topic: topic.trim(),
          audience: audience.trim() || undefined,
          desiredTone: tone.trim() || undefined,
        }),
      });
      const payload = (await res.json()) as TitleLabResponse & { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? `Request failed (${res.status}).`);
      }
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate titles.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <label className="block text-sm">
          <span className="text-zinc-300">Channel</span>
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            required
          >
            <option value="">Pick a channel from history…</option>
            {history.map((entry) => (
              <option key={entry.channelId} value={entry.channelId}>
                {entry.channelTitle || entry.channelId}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-zinc-300">Topic / outline</span>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What's the next video about?"
            rows={3}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            required
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-zinc-300">Audience (optional)</span>
            <input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-300">Desired tone (optional)</span>
            <input
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={loading || !channelId || !topic.trim()}
          className="rounded-xl bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Generating…" : "Generate 10 Titles"}
        </button>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      </form>

      {data ? (
        <article className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Channel style summary</p>
          <p className="text-sm text-zinc-200">{data.channelStyleSummary}</p>
          <ol className="space-y-3">
            {data.candidates.map((candidate, idx) => (
              <li key={`${candidate.title}-${idx}`} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-medium text-zinc-100">{candidate.title}</h3>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(candidate.title)}
                    className="text-xs text-violet-300 hover:text-violet-200"
                  >
                    Copy
                  </button>
                </div>
                <p className="mt-2 text-sm text-zinc-300">{candidate.rationale}</p>
                <ul className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-300">
                  <li className="rounded-full bg-violet-500/15 px-2 py-1">
                    Curiosity {candidate.curiosityGapScore}/10
                  </li>
                  <li className="rounded-full bg-blue-500/15 px-2 py-1">
                    Keywords {candidate.keywordStrengthScore}/10
                  </li>
                  <li className="rounded-full bg-emerald-500/15 px-2 py-1">
                    Alignment {candidate.alignmentWithChannelScore}/10
                  </li>
                  <li className="rounded-full bg-zinc-800 px-2 py-1">{candidate.characterCount} chars</li>
                </ul>
                {candidate.warnings.length > 0 ? (
                  <p className="mt-3 text-xs text-amber-300">⚠ {candidate.warnings.join(" · ")}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </article>
      ) : null}
    </section>
  );
}
