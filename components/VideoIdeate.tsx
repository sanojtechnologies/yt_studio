"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  buildIdeatePdfDocument,
  IdeateIdeaExport,
  IdeateResponseExport,
  safeIdeateFilename,
} from "@/lib/videoIdeateExport";

interface IdeateResponse extends IdeateResponseExport {
  ideas: IdeateIdeaExport[];
}

function confidenceClass(value: IdeateIdeaExport["confidence"]): string {
  if (value === "high") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (value === "medium") return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-zinc-700 bg-zinc-800/60 text-zinc-300";
}

export default function VideoIdeate() {
  const searchParams = useSearchParams();
  const initialKeywords = searchParams.get("keywords")?.trim() ?? "";
  const [keywords, setKeywords] = useState(initialKeywords);
  const [ideaCount, setIdeaCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IdeateResponse | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string>("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/studio/ideate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: keywords.split(",").map((item) => item.trim()).filter(Boolean),
          ideaCount,
        }),
      });
      const payload = (await response.json()) as IdeateResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Failed to ideate.");
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ideate.");
    } finally {
      setLoading(false);
    }
  }

  function downloadPdf() {
    if (!result) return;
    try {
      const doc = buildIdeatePdfDocument(result, keywords);
      doc.save(safeIdeateFilename(keywords));
      setDownloadStatus("PDF downloaded.");
    } catch {
      setDownloadStatus("Failed to generate PDF. Try again.");
    }
  }

  return (
    <section className="space-y-6">
      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5"
      >
        <label className="block text-sm">
          <span className="text-zinc-300">Niche Keywords (comma separated)</span>
          <input
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder="graph rag, ai architecture, llm workflows"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block text-sm md:w-1/4">
          <span className="text-zinc-300">Idea Count</span>
          <input
            type="number"
            min={3}
            max={10}
            value={ideaCount}
            onChange={(event) =>
              setIdeaCount(Math.max(3, Math.min(10, Number(event.target.value) || 3)))
            }
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={loading || keywords.trim().length === 0}
          className="rounded-xl bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Analyzing 30-Day Niche Trends…" : "Generate Data-Grounded Ideas"}
        </button>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      </form>

      {result ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={downloadPdf}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 hover:border-violet-400"
            >
              Download As PDF
            </button>
            {downloadStatus ? <p className="text-xs text-zinc-400">{downloadStatus}</p> : null}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 text-sm text-zinc-300">
            <p className="text-zinc-100">{result.summary}</p>
            <p className="mt-1 text-xs text-zinc-500">
              Based on {result.evidence.sampleSize} matching videos from the last{" "}
              {result.evidence.windowDays} days.
            </p>
            {result.evidence.opportunitySignals.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-400">
                {result.evidence.opportunitySignals.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <ul className="grid gap-3">
            {result.ideas.map((idea) => (
              <li key={`${idea.title}-${idea.keywordAngle}`} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100">{idea.title}</h3>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${confidenceClass(idea.confidence)}`}
                  >
                    {idea.confidence}
                  </span>
                  <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">
                    {idea.format}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-200">{idea.hook}</p>
                <p className="mt-1 text-xs text-zinc-400">{idea.whyNow}</p>
                <p className="mt-2 text-xs text-violet-300">Keyword angle: {idea.keywordAngle}</p>
                {idea.supportingSignals.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-400">
                    {idea.supportingSignals.map((signal) => (
                      <li key={signal}>{signal}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
