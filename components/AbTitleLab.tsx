"use client";

import { FormEvent, useState } from "react";
import { AB_TITLE_LIMITS, AbTitleResponse } from "@/lib/abTitlePrompt";

export default function AbTitleLab() {
  const [titleA, setTitleA] = useState("");
  const [titleB, setTitleB] = useState("");
  const [audience, setAudience] = useState("");
  const [channelContext, setChannelContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AbTitleResponse | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setData(null);
    setLoading(true);
    try {
      const res = await fetch("/api/studio/ab-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titleA: titleA.trim(),
          titleB: titleB.trim(),
          audience: audience.trim() || undefined,
          channelContext: channelContext.trim() || undefined,
        }),
      });
      const payload = (await res.json()) as AbTitleResponse & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? `Request failed (${res.status}).`);
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not score titles.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-zinc-300">Title A</span>
            <textarea
              value={titleA}
              onChange={(e) => setTitleA(e.target.value)}
              maxLength={AB_TITLE_LIMITS.maxTitleLength}
              rows={3}
              required
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              placeholder="First title candidate"
            />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-300">Title B</span>
            <textarea
              value={titleB}
              onChange={(e) => setTitleB(e.target.value)}
              maxLength={AB_TITLE_LIMITS.maxTitleLength}
              rows={3}
              required
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              placeholder="Second title candidate"
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-zinc-300">Audience (optional)</span>
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            maxLength={AB_TITLE_LIMITS.maxAudienceLength}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-300">Channel context (optional)</span>
          <input
            value={channelContext}
            onChange={(e) => setChannelContext(e.target.value)}
            maxLength={AB_TITLE_LIMITS.maxChannelContextLength}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-center justify-between">
          {error ? <p className="text-sm text-rose-400">{error}</p> : <span />}
          <button
            type="submit"
            disabled={loading || !titleA.trim() || !titleB.trim()}
            className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Scoring…" : "Score titles"}
          </button>
        </div>
      </form>

      {data ? <AbTitleResult data={data} titleA={titleA} titleB={titleB} /> : null}
    </section>
  );
}

function AbTitleResult({
  data,
  titleA,
  titleB,
}: {
  data: AbTitleResponse;
  titleA: string;
  titleB: string;
}) {
  const winner = data.winnerIndex === 0 ? "A" : "B";
  return (
    <article className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-medium text-emerald-300">
          Winner: Title {winner}
        </span>
        <span className="truncate text-sm text-zinc-300">
          {data.winnerIndex === 0 ? titleA : titleB}
        </span>
      </div>
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Axis scores</h2>
        <ul className="mt-2 grid gap-2 md:grid-cols-2">
          {data.axes.map((axis) => (
            <li key={axis.axis} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">{axis.axis}</p>
              <p className="mt-1 text-sm text-zinc-200">
                A <span className="font-semibold">{axis.a}</span>{" "}
                <span className="text-zinc-500">vs</span>{" "}
                B <span className="font-semibold">{axis.b}</span>
              </p>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Why</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-300">
          {data.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}
