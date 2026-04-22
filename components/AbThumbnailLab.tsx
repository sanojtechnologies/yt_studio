"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { AbThumbnailResponse } from "@/lib/abThumbnailPrompt";

type Mode = "upload" | "url";
const MAX_UPLOAD_TOTAL_BYTES = 4 * 1024 * 1024;
const JSON_CONTENT_TYPE = "application/json";

async function readApiPayload(
  response: Response
): Promise<(AbThumbnailResponse & { error?: string }) | null> {
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes(JSON_CONTENT_TYPE)) return null;
  try {
    return (await response.json()) as AbThumbnailResponse & { error?: string };
  } catch {
    return null;
  }
}

async function buildRequestError(response: Response): Promise<Error> {
  const payload = await readApiPayload(response);
  if (payload?.error) {
    return new Error(payload.error);
  }
  const text = (await response.text()).trim();
  if (response.status === 413 || text.toLowerCase().startsWith("request entity too large")) {
    return new Error(
      "Upload payload too large. Keep combined image size under 4 MiB or use URL pair mode."
    );
  }
  if (text.length > 0) {
    return new Error(text.slice(0, 180));
  }
  return new Error(`Request failed (${response.status}).`);
}

export default function AbThumbnailLab() {
  const [mode, setMode] = useState<Mode>("upload");
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [urlA, setUrlA] = useState("");
  const [urlB, setUrlB] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AbThumbnailResponse | null>(null);

  function pickFile(setter: (f: File | null) => void) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      setter(e.target.files?.[0] ?? null);
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setData(null);
    setLoading(true);
    try {
      let res: Response;
      if (mode === "upload") {
        if (!fileA || !fileB) throw new Error("Select two images first.");
        if (fileA.size + fileB.size > MAX_UPLOAD_TOTAL_BYTES) {
          throw new Error(
            "Combined upload size exceeds 4 MiB. Compress images or switch to URL pair mode."
          );
        }
        const form = new FormData();
        form.append("imageA", fileA);
        form.append("imageB", fileB);
        if (title.trim()) form.append("title", title.trim());
        res = await fetch("/api/studio/ab-thumbnail", { method: "POST", body: form });
      } else {
        res = await fetch("/api/studio/ab-thumbnail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrlA: urlA.trim(),
            imageUrlB: urlB.trim(),
            title: title.trim() || undefined,
          }),
        });
      }
      if (!res.ok) throw await buildRequestError(res);
      const payload = await readApiPayload(res);
      if (!payload) throw new Error("Server returned a non-JSON response.");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not compare thumbnails.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-1 text-xs">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`rounded-md px-3 py-1 ${mode === "upload" ? "bg-violet-500/20 text-violet-200" : "text-zinc-400"}`}
        >
          Upload
        </button>
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`rounded-md px-3 py-1 ${mode === "url" ? "bg-violet-500/20 text-violet-200" : "text-zinc-400"}`}
        >
          URL pair
        </button>
      </div>

      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        {mode === "upload" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <FileInput label="Image A" onChange={pickFile(setFileA)} file={fileA} />
            <FileInput label="Image B" onChange={pickFile(setFileB)} file={fileB} />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="text-zinc-300">URL A</span>
              <input
                value={urlA}
                onChange={(e) => setUrlA(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                placeholder="https://…"
              />
            </label>
            <label className="block text-sm">
              <span className="text-zinc-300">URL B</span>
              <input
                value={urlB}
                onChange={(e) => setUrlB(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                placeholder="https://…"
              />
            </label>
          </div>
        )}
        <label className="block text-sm">
          <span className="text-zinc-300">Title (optional context)</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-center justify-between">
          {error ? <p className="text-sm text-rose-400">{error}</p> : <span />}
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Comparing…" : "Compare thumbnails"}
          </button>
        </div>
      </form>

      {data ? <AbThumbnailResult data={data} /> : null}
    </section>
  );
}

function FileInput({
  label,
  onChange,
  file,
}: {
  label: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  file: File | null;
}) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-300">{label}</span>
      <input
        type="file"
        accept="image/*"
        onChange={onChange}
        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-violet-500/20 file:px-3 file:py-1 file:text-violet-200"
      />
      {file ? <p className="mt-1 text-xs text-zinc-500">{file.name}</p> : null}
    </label>
  );
}

function AbThumbnailResult({ data }: { data: AbThumbnailResponse }) {
  return (
    <article className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-medium text-emerald-300">
          Winner: Thumbnail {data.winnerIndex === 0 ? "A" : "B"}
        </span>
        <p className="text-sm text-zinc-300">{data.verdict}</p>
      </div>
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Axis scores</h2>
        <ul className="mt-2 grid gap-2 md:grid-cols-2">
          {data.axisScores.map((axis) => (
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
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Improvements</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-300">
          {data.improvements.map((imp, i) => (
            <li key={i}>{imp}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}
