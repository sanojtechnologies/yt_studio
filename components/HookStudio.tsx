"use client";

import { FormEvent, useState } from "react";
import type { HookResponse } from "@/lib/hookPrompt";

export default function HookStudio() {
  const [title, setTitle] = useState("");
  const [outline, setOutline] = useState("");
  const [targetLength, setTargetLength] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HookResponse | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setData(null);
    setLoading(true);
    try {
      const res = await fetch("/api/studio/hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          outline: outline.trim(),
          targetLengthMinutes: targetLength ? Number(targetLength) : undefined,
        }),
      });
      const payload = (await res.json()) as HookResponse & { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? `Request failed (${res.status}).`);
      }
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate hooks.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <label className="block text-sm">
          <span className="text-zinc-300">Video title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-300">Outline</span>
          <textarea
            value={outline}
            onChange={(e) => setOutline(e.target.value)}
            rows={8}
            placeholder="Rough outline with beats / sections. Timestamps help chapter generation."
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block text-sm md:w-1/3">
          <span className="text-zinc-300">Target length (minutes, optional)</span>
          <input
            type="number"
            min={1}
            value={targetLength}
            onChange={(e) => setTargetLength(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !title.trim() || !outline.trim()}
          className="rounded-xl bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Crafting…" : "Generate hooks + description"}
        </button>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      </form>

      {data ? (
        <div className="space-y-5">
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Hooks</h2>
            <ul className="mt-3 space-y-3">
              {data.hooks.map((hook) => (
                <li key={hook.label} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs uppercase tracking-wide text-violet-200">
                      {hook.label}
                    </span>
                    <span className="text-xs text-zinc-500">~{hook.approxSeconds}s</span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-100">{hook.hook}</p>
                  <p className="mt-2 text-xs text-zinc-400">{hook.reasoning}</p>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Description</h2>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(data.description)}
                className="text-xs text-violet-300 hover:text-violet-200"
              >
                Copy
              </button>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-200">{data.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {data.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                  {tag}
                </span>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Chapters</h2>
            <ol className="mt-3 space-y-2 text-sm text-zinc-200">
              {data.chapters.map((chapter, idx) => (
                <li key={`${chapter.timestamp}-${idx}`} className="flex gap-3">
                  <span className="font-mono text-zinc-400">{chapter.timestamp}</span>
                  <span>{chapter.title}</span>
                </li>
              ))}
            </ol>
          </article>
        </div>
      ) : null}
    </section>
  );
}
