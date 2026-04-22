"use client";

import { FormEvent, useState } from "react";

interface GeneratedVariant {
  dataUrl: string;
  mimeType: string;
  readabilityScore?: number;
  curiosityScore?: number;
  overallScore?: number;
}

interface ThumbnailApiResponse {
  variants: GeneratedVariant[];
  promptUsed: string;
  modelUsed?: string;
  error?: string;
  detail?: string;
}

const JSON_CONTENT_TYPE = "application/json";

function dataUrlToInlineData(dataUrl: string): { mimeType: string; imageBase64: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1].toLowerCase(), imageBase64: match[2] };
}

async function readApiPayload(response: Response): Promise<ThumbnailApiResponse | null> {
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes(JSON_CONTENT_TYPE)) return null;
  try {
    return (await response.json()) as ThumbnailApiResponse;
  } catch {
    return null;
  }
}

async function buildRequestError(response: Response): Promise<Error> {
  const payload = await readApiPayload(response);
  if (payload?.error) {
    return new Error(payload.detail ? `${payload.error}: ${payload.detail}` : payload.error);
  }
  const text = (await response.text()).trim();
  if (text.length > 0) return new Error(text.slice(0, 200));
  return new Error(`Request failed (${response.status}).`);
}

export default function ThumbnailStudio() {
  const [prompt, setPrompt] = useState("");
  const [channelStyle, setChannelStyle] = useState("");
  const [styleHint, setStyleHint] = useState("");
  const [variantCount, setVariantCount] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ThumbnailApiResponse | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/studio/thumbnails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          channelStyle: channelStyle.trim() || undefined,
          styleHint: styleHint.trim() || undefined,
          variantCount,
        }),
      });
      if (!res.ok) {
        throw await buildRequestError(res);
      }
      const payload = await readApiPayload(res);
      if (!payload) throw new Error("Server returned a non-JSON response.");
      const scoredVariants = await Promise.all(
        payload.variants.map(async (variant, index) => {
          const inline = dataUrlToInlineData(variant.dataUrl);
          if (!inline) return variant;
          try {
            const scoreRes = await fetch("/api/thumbnail/file", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                videoId: `studio-variant-${index + 1}`,
                title: prompt.trim(),
                mimeType: inline.mimeType,
                imageBase64: inline.imageBase64,
              }),
            });
            const scorePayload = (await scoreRes.json()) as {
              textReadabilityScore?: number;
              titleCuriosityGapScore?: number;
            };
            if (!scoreRes.ok) return variant;
            const readability = Number(scorePayload.textReadabilityScore ?? 0);
            const curiosity = Number(scorePayload.titleCuriosityGapScore ?? 0);
            if (!Number.isFinite(readability) || !Number.isFinite(curiosity)) return variant;
            const overall = Math.round(((readability + curiosity) / 2) * 10) / 10;
            return {
              ...variant,
              readabilityScore: readability,
              curiosityScore: curiosity,
              overallScore: overall,
            };
          } catch {
            return variant;
          }
        })
      );
      setResult({ ...payload, variants: scoredVariants });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate thumbnails.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <label className="block text-sm">
          <span className="text-zinc-300">Concept</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Describe the hero image, mood, subject."
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            required
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-zinc-300">Channel style (optional)</span>
            <input
              value={channelStyle}
              onChange={(e) => setChannelStyle(e.target.value)}
              placeholder="Bold reds, faces, retro sans-serif"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-300">Style hint (optional)</span>
            <input
              value={styleHint}
              onChange={(e) => setStyleHint(e.target.value)}
              placeholder="cinematic / flat vector / photographic"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="block text-sm md:w-1/3">
          <span className="text-zinc-300">Variants</span>
          <input
            type="number"
            min={1}
            max={3}
            value={variantCount}
            onChange={(e) => setVariantCount(Math.max(1, Math.min(3, Number(e.target.value) || 1)))}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="rounded-xl bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Rendering…" : `Generate ${variantCount} Thumbnail${variantCount === 1 ? "" : "s"}`}
        </button>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      </form>

      {result ? (
        <div className="space-y-4">
          <ul className="grid gap-4 md:grid-cols-3">
            {result.variants.map((variant, idx) => (
              <li
                key={`${variant.mimeType}-${idx}`}
                className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80"
              >
                {/* Inline data URL — next/image won't optimise base64, so a plain <img> is correct here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={variant.dataUrl}
                  alt={`Generated thumbnail ${idx + 1}`}
                  className="aspect-video w-full object-cover"
                />
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="text-[11px] text-zinc-400">
                    <p>Variant {idx + 1}</p>
                    <p>
                      Readability {variant.readabilityScore ?? "N/A"}/
                      {typeof variant.readabilityScore === "number" ? "10" : ""}
                    </p>
                    <p>
                      Curiosity {variant.curiosityScore ?? "N/A"}/
                      {typeof variant.curiosityScore === "number" ? "10" : ""}
                    </p>
                    <p>
                      Overall {variant.overallScore ?? "N/A"}/
                      {typeof variant.overallScore === "number" ? "10" : ""}
                    </p>
                  </div>
                  <a
                    href={variant.dataUrl}
                    download={`thumbnail-${idx + 1}.png`}
                    className="text-xs text-violet-300 hover:text-violet-200"
                  >
                    Download
                  </a>
                </div>
              </li>
            ))}
          </ul>
          <details className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 text-xs text-zinc-400">
            <summary className="cursor-pointer select-none">Prompt used</summary>
            {result.modelUsed ? (
              <p className="mt-3 text-[11px] text-zinc-400">
                Model used: <span className="font-mono text-zinc-300">{result.modelUsed}</span>
              </p>
            ) : null}
            <pre className="mt-3 whitespace-pre-wrap text-[11px] text-zinc-300">{result.promptUsed}</pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}
