"use client";

import { FormEvent, useState } from "react";
import { SCRIPT_LIMITS, ScriptResponse } from "@/lib/scriptPrompt";

type StreamEvent =
  | { type: "meta"; title: string; targetMinutes: number }
  | { type: "chunk"; text: string }
  | { type: "final"; data: ScriptResponse | { raw: string } }
  | { type: "error"; error: string };

function isScriptResponse(value: unknown): value is ScriptResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ScriptResponse>;
  return (
    typeof v.coldOpen === "string" &&
    typeof v.hook === "string" &&
    Array.isArray(v.beats) &&
    typeof v.callToAction === "string" &&
    typeof v.outro === "string"
  );
}

export default function ScriptLab() {
  const [title, setTitle] = useState("");
  const [targetMinutes, setTargetMinutes] = useState(5);
  const [audience, setAudience] = useState("");
  const [channelContext, setChannelContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [script, setScript] = useState<ScriptResponse | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setScript(null);
    setStreamingText("");
    setLoading(true);
    try {
      const res = await fetch("/api/studio/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          targetMinutes,
          audience: audience.trim() || undefined,
          channelContext: channelContext.trim() || undefined,
        }),
      });
      if (!res.ok || !res.body) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Request failed (${res.status}).`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as StreamEvent;
          if (evt.type === "chunk") {
            setStreamingText((prev) => prev + evt.text);
          } else if (evt.type === "final") {
            if (isScriptResponse(evt.data)) setScript(evt.data);
          } else if (evt.type === "error") {
            setError(evt.error);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate script.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <form
        onSubmit={submit}
        className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5"
      >
        <label className="block text-sm">
          <span className="text-zinc-300">Video title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={SCRIPT_LIMITS.maxTitleLength}
            required
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            placeholder="e.g. Stop over-engineering your side projects"
          />
        </label>
        <label className="block text-sm">
          <span className="flex items-center justify-between text-zinc-300">
            <span>Target runtime</span>
            <span className="text-zinc-400">{targetMinutes} min</span>
          </span>
          <input
            type="range"
            min={SCRIPT_LIMITS.minTargetMinutes}
            max={SCRIPT_LIMITS.maxTargetMinutes}
            value={targetMinutes}
            onChange={(e) => setTargetMinutes(Number(e.target.value))}
            className="mt-2 w-full accent-violet-500"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-300">Audience (optional)</span>
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            maxLength={SCRIPT_LIMITS.maxAudienceLength}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            placeholder="e.g. Senior engineers planning a side project"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-300">Channel context (optional)</span>
          <textarea
            value={channelContext}
            onChange={(e) => setChannelContext(e.target.value)}
            maxLength={SCRIPT_LIMITS.maxChannelContextLength}
            rows={3}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            placeholder="e.g. Calm, evidence-led, avoids hype"
          />
        </label>
        <div className="flex items-center justify-between">
          {error ? <p className="text-sm text-rose-400">{error}</p> : <span />}
          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Writing…" : "Generate Outline"}
          </button>
        </div>
      </form>

      {loading && streamingText ? (
        <pre className="max-h-64 overflow-auto rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-400">
          {streamingText}
        </pre>
      ) : null}

      {script ? <ScriptView script={script} /> : null}
    </section>
  );
}

function ScriptView({ script }: { script: ScriptResponse }) {
  return (
    <article className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
      <Block heading="Cold open" body={script.coldOpen} />
      <Block heading="Hook" body={script.hook} />
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Beats</h2>
        <ol className="mt-2 space-y-4">
          {script.beats.map((beat, index) => (
            <li key={`${beat.heading}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
              <h3 className="text-sm font-semibold text-zinc-100">
                {index + 1}. {beat.heading}
              </h3>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-300">
                {beat.bullets.map((bullet, i) => (
                  <li key={i}>{bullet}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
      <Block heading="Call to action" body={script.callToAction} />
      <Block heading="Outro" body={script.outro} />
    </article>
  );
}

function Block({ heading, body }: { heading: string; body: string }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{heading}</h2>
      <p className="mt-1 text-sm text-zinc-200">{body}</p>
    </div>
  );
}
