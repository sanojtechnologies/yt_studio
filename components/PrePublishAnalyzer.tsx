"use client";

import { useMemo, useState } from "react";
import { MetadataAnalysis } from "@/lib/metadataPrompt";
import { ThumbnailAnalysis } from "@/lib/thumbnailPrompt";

interface DraftVideo {
  id: string;
  title: string;
  description: string;
  tags: string[];
  thumbnailFileName: string;
  thumbnailMimeType?: string;
  thumbnailBase64?: string;
  thumbnailUrl?: string;
  recommendation?: DraftRecommendation;
  updatedAt: string;
}

const STORAGE_KEY = "ytstudio:unpublished-drafts";
const MAX_STORED_THUMBNAIL_BYTES = 2 * 1024 * 1024;
const THUMBNAIL_GENERATION_PROMPT_LIMIT = 500;

interface GeneratedMetadataPack {
  overallScore: number;
  title: string;
  description: string;
  tags: string[];
}

interface GeneratedVariant {
  dataUrl: string;
  mimeType: string;
}

interface ScoredGeneratedVariant extends GeneratedVariant {
  readabilityScore: number;
  curiosityScore: number;
  overallScore: number;
}

interface DraftRecommendation {
  generatedAt: string;
  metadataAnalysis?: MetadataAnalysis;
  thumbnailAnalysis?: ThumbnailAnalysis;
  generatedMetadataPack?: GeneratedMetadataPack;
  generatedThumbnails?: ScoredGeneratedVariant[];
}

function buildCompactThumbnailPrompt(title: string, suggestions: string[]): string {
  const intro = `YouTube thumbnail for: "${title.trim().slice(0, 120)}". Apply: `;
  const compactSuggestions = suggestions
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 4);
  let merged = intro;
  for (let idx = 0; idx < compactSuggestions.length; idx++) {
    const suffix = `${idx + 1}) ${compactSuggestions[idx]}; `;
    if ((merged + suffix).length > THUMBNAIL_GENERATION_PROMPT_LIMIT - 60) break;
    merged += suffix;
  }
  merged += "High contrast, clear focal point, mobile-readable text.";
  return merged.slice(0, THUMBNAIL_GENERATION_PROMPT_LIMIT);
}

function loadDrafts(): DraftVideo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DraftVideo[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item?.id && item?.title)
      .map((item) => ({
        ...item,
        thumbnailFileName:
          typeof (item as Partial<DraftVideo>).thumbnailFileName === "string"
            ? (item as Partial<DraftVideo>).thumbnailFileName ?? ""
            : "",
        thumbnailUrl:
          typeof (item as Partial<DraftVideo>).thumbnailUrl === "string"
            ? (item as Partial<DraftVideo>).thumbnailUrl ?? ""
            : "",
        thumbnailMimeType:
          typeof (item as Partial<DraftVideo>).thumbnailMimeType === "string"
            ? (item as Partial<DraftVideo>).thumbnailMimeType ?? ""
            : "",
        thumbnailBase64:
          typeof (item as Partial<DraftVideo>).thumbnailBase64 === "string"
            ? (item as Partial<DraftVideo>).thumbnailBase64 ?? ""
            : "",
        recommendation:
          typeof (item as Partial<DraftVideo>).recommendation === "object" &&
          (item as Partial<DraftVideo>).recommendation !== null
            ? (item as Partial<DraftVideo>).recommendation
            : undefined,
      }));
  } catch {
    return [];
  }
}

function saveDrafts(drafts: DraftVideo[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export default function PrePublishAnalyzer() {
  const [drafts, setDrafts] = useState<DraftVideo[]>(() => loadDrafts());
  const [selectedId, setSelectedId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [thumbnailFileName, setThumbnailFileName] = useState("");
  const [thumbnailMimeType, setThumbnailMimeType] = useState("");
  const [thumbnailBase64, setThumbnailBase64] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [message, setMessage] = useState("");
  const [metadata, setMetadata] = useState<MetadataAnalysis | null>(null);
  const [thumbnail, setThumbnail] = useState<ThumbnailAnalysis | null>(null);
  const [generatedPack, setGeneratedPack] = useState<GeneratedMetadataPack | null>(null);
  const [generatedVariants, setGeneratedVariants] = useState<ScoredGeneratedVariant[]>([]);
  const [error, setError] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [isRunningWorkflow, setIsRunningWorkflow] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState("");

  const selected = useMemo(
    () => drafts.find((draft) => draft.id === selectedId) ?? null,
    [drafts, selectedId]
  );

  function resetForm() {
    setSelectedId("");
    setTitle("");
    setDescription("");
    setTagsInput("");
    setThumbnailFileName("");
    setThumbnailMimeType("");
    setThumbnailBase64("");
    setThumbnailUrl("");
    setMetadata(null);
    setThumbnail(null);
    setGeneratedPack(null);
    setGeneratedVariants([]);
    setError("");
    setGenerationError("");
    setWorkflowStatus("");
  }

  function hydrateFromDraft(draft: DraftVideo) {
    setSelectedId(draft.id);
    setTitle(draft.title);
    setDescription(draft.description);
    setTagsInput(draft.tags.join(", "));
    setThumbnailFileName(draft.thumbnailFileName);
    setThumbnailMimeType(draft.thumbnailMimeType?.trim() ?? "");
    setThumbnailBase64(draft.thumbnailBase64?.trim() ?? "");
    setThumbnailUrl(draft.thumbnailUrl?.trim() ?? "");
    setMetadata(draft.recommendation?.metadataAnalysis ?? null);
    setThumbnail(draft.recommendation?.thumbnailAnalysis ?? null);
    setGeneratedPack(draft.recommendation?.generatedMetadataPack ?? null);
    setGeneratedVariants(draft.recommendation?.generatedThumbnails ?? []);
    setError("");
    setGenerationError("");
    setWorkflowStatus("");
  }

  function upsertDraft() {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle) {
      setError("Title is required for a draft.");
      return;
    }
    const nextDraft: DraftVideo = {
      id: selected?.id ?? `draft-${Date.now()}`,
      title: trimmedTitle,
      description: trimmedDescription,
      tags: parseTags(tagsInput),
      thumbnailFileName,
      thumbnailMimeType: thumbnailMimeType || undefined,
      thumbnailBase64: thumbnailBase64 || undefined,
      thumbnailUrl: thumbnailUrl.trim(),
      recommendation:
        metadata || thumbnail || generatedPack || generatedVariants.length > 0
          ? {
              generatedAt: new Date().toISOString(),
              metadataAnalysis: metadata ?? undefined,
              thumbnailAnalysis: thumbnail ?? undefined,
              generatedMetadataPack: generatedPack ?? undefined,
              generatedThumbnails: generatedVariants.length > 0 ? generatedVariants : undefined,
            }
          : undefined,
      updatedAt: new Date().toISOString(),
    };
    const nextDrafts = selected
      ? drafts.map((draft) => (draft.id === selected.id ? nextDraft : draft))
      : [nextDraft, ...drafts];
    setDrafts(nextDrafts);
    saveDrafts(nextDrafts);
    setSelectedId(nextDraft.id);
    setMessage(selected ? "Draft updated." : "Draft saved.");
    setError("");
  }

  function deleteDraft(id: string) {
    const nextDrafts = drafts.filter((draft) => draft.id !== id);
    setDrafts(nextDrafts);
    saveDrafts(nextDrafts);
    if (selectedId === id) resetForm();
    setMessage("Draft deleted.");
  }

  async function requestJson<T>(url: string, body: unknown, fallbackError: string): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as T & { error?: string; detail?: string };
    if (!response.ok) {
      const message = payload.detail
        ? `${payload.error ?? fallbackError}: ${payload.detail}`
        : payload.error ?? fallbackError;
      throw new Error(message);
    }
    return payload as T;
  }

  function dataUrlToInlineData(dataUrl: string): { mimeType: string; imageBase64: string } | null {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
    if (!match) return null;
    return { mimeType: match[1].toLowerCase(), imageBase64: match[2] };
  }

  async function runFullRecommendationWorkflow() {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const parsedTags = parseTags(tagsInput);
    const trimmedUrl = thumbnailUrl.trim();
    if (!trimmedTitle) {
      setError("Add a title before running pre-publish recommendations.");
      return;
    }
    if (!thumbnailBase64 && !trimmedUrl) {
      setError("Upload a thumbnail file before running pre-publish recommendations.");
      return;
    }

    setIsRunningWorkflow(true);
    setError("");
    setGenerationError("");
    setMessage("");
    setWorkflowStatus("Analyzing metadata…");
    setGeneratedPack(null);
    setGeneratedVariants([]);

    try {
      const metadataAnalysis = await requestJson<MetadataAnalysis>(
        "/api/video-metadata",
        {
          videoId: selected?.id ?? "draft-preview",
          title: trimmedTitle,
          description: trimmedDescription,
          tags: parsedTags,
        },
        "Metadata analysis failed."
      );
      setMetadata(metadataAnalysis);

      setWorkflowStatus("Analyzing thumbnail…");
      const thumbnailAnalysis = thumbnailBase64 && thumbnailMimeType
        ? await requestJson<ThumbnailAnalysis>(
            "/api/thumbnail/file",
            {
              videoId: selected?.id ?? "draft-preview",
              title: trimmedTitle,
              mimeType: thumbnailMimeType,
              imageBase64: thumbnailBase64,
            },
            "Thumbnail analysis failed."
          )
        : await requestJson<ThumbnailAnalysis>(
            "/api/thumbnail",
            {
              videoId: selected?.id ?? "draft-preview",
              title: trimmedTitle,
              thumbnailUrl: trimmedUrl,
            },
            "Thumbnail analysis failed."
          );
      setThumbnail(thumbnailAnalysis);

      setWorkflowStatus("Generating optimized metadata…");
      const metadataPack = await requestJson<GeneratedMetadataPack>(
        "/api/video-metadata/generate",
        {
          videoId: selected?.id ?? "draft-preview",
          currentTitle: trimmedTitle,
          currentDescription: trimmedDescription,
          currentTags: parsedTags,
          recommendedTitle: metadataAnalysis.titleSuggestions[0]?.trim() || trimmedTitle,
          topRecommendations: metadataAnalysis.topRecommendations,
          descriptionSuggestions: metadataAnalysis.descriptionSuggestions,
          suggestedTags: metadataAnalysis.suggestedTags,
        },
        "Failed to generate metadata pack."
      );
      setGeneratedPack(metadataPack);

      setWorkflowStatus("Generating 3 thumbnail variants…");
      const variantsPayload = await requestJson<{ variants?: GeneratedVariant[] }>(
        "/api/studio/thumbnails",
        {
          prompt: buildCompactThumbnailPrompt(trimmedTitle, thumbnailAnalysis.improvementSuggestions),
          styleHint: "YouTube thumbnail, high contrast, mobile-readable text hierarchy",
          variantCount: 3,
        },
        "Failed to generate thumbnails."
      );
      const variants = Array.isArray(variantsPayload.variants) ? variantsPayload.variants.slice(0, 3) : [];
      if (variants.length === 0) throw new Error("Image model returned no variants.");

      setWorkflowStatus("Scoring generated thumbnails…");
      const scoredVariants = await Promise.all(
        variants.map(async (variant) => {
          const inline = dataUrlToInlineData(variant.dataUrl);
          if (!inline) throw new Error("Generated thumbnail format is invalid.");
          const score = await requestJson<ThumbnailAnalysis>(
            "/api/thumbnail/file",
            {
              videoId: selected?.id ?? "draft-preview",
              title: metadataPack.title || trimmedTitle,
              mimeType: inline.mimeType,
              imageBase64: inline.imageBase64,
            },
            "Failed to score generated thumbnail."
          );
          const overall = Math.round(((score.textReadabilityScore + score.titleCuriosityGapScore) / 2) * 10) / 10;
          return {
            ...variant,
            readabilityScore: score.textReadabilityScore,
            curiosityScore: score.titleCuriosityGapScore,
            overallScore: overall,
          };
        })
      );
      setGeneratedVariants(scoredVariants);
      setWorkflowStatus("Done. Click Update Draft to save recommendations.");
      setMessage("Recommendations generated. Click Update Draft to persist.");
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : "Failed to run pre-publish workflow.");
      setWorkflowStatus("");
    } finally {
      setIsRunningWorkflow(false);
    }
  }

  function onThumbnailFileChange(file: File | null) {
    if (!file) {
      setThumbnailFileName("");
      setThumbnailMimeType("");
      setThumbnailBase64("");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file for thumbnail analysis.");
      return;
    }
    if (file.size > MAX_STORED_THUMBNAIL_BYTES) {
      setError("Thumbnail is too large. Please upload an image up to 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.split(",")[1] ?? "";
      if (!base64) {
        setError("Failed to read thumbnail file.");
        return;
      }
      setThumbnailFileName(file.name);
      setThumbnailMimeType(file.type);
      setThumbnailBase64(base64);
      setError("");
    };
    reader.onerror = () => setError("Failed to read thumbnail file.");
    reader.readAsDataURL(file);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.15fr,0.85fr]">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 md:p-5">
        <h2 className="text-lg font-semibold text-zinc-100">Draft Workspace</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Add unpublished video drafts manually, then run title/description/tag + thumbnail checks before publishing.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Note: YouTube API keys cannot fetch private/draft uploads; OAuth would be required for that.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-400"
              placeholder="Enter draft title"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-400"
              placeholder="Enter draft description"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">Tags (comma separated)</span>
            <input
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-400"
              placeholder="ai, rag, graph rag"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">Thumbnail Upload</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
              onChange={(event) => onThumbnailFileChange(event.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-400"
            />
            {thumbnailFileName ? (
              <p className="mt-1 text-xs text-zinc-500">Selected: {thumbnailFileName}</p>
            ) : null}
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={upsertDraft}
            className="rounded-lg bg-violet-500/90 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500"
          >
            {selected ? "Update Draft" : "Save Draft"}
          </button>
          <button
            type="button"
            onClick={() => void runFullRecommendationWorkflow()}
            disabled={isRunningWorkflow}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-violet-400 disabled:opacity-50"
          >
            {isRunningWorkflow ? "Running Full Analysis…" : "Analyze + Generate Recommendations"}
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            New Draft
          </button>
        </div>

        {message ? <p className="mt-2 text-xs text-emerald-300">{message}</p> : null}
        {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}
        {generationError ? <p className="mt-2 text-xs text-rose-400">{generationError}</p> : null}
        {workflowStatus ? <p className="mt-2 text-xs text-zinc-400">{workflowStatus}</p> : null}

        {metadata ? (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-sm">
            <p className="text-zinc-400">Metadata Score: <span className="text-zinc-100">{metadata.overallScore}/10</span></p>
            <p className="mt-2 text-zinc-400">Top Recommendations</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-zinc-100">
              {metadata.topRecommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        ) : null}

        {generatedPack ? (
          <div className="mt-4 rounded-lg border border-emerald-600/40 bg-emerald-500/10 p-3 text-sm">
            <p className="text-emerald-200">Generated Metadata Pack</p>
            <p className="mt-1 text-zinc-100">Score: {generatedPack.overallScore}/10</p>
            <p className="mt-2 text-xs uppercase tracking-wide text-zinc-400">Title</p>
            <p className="text-zinc-100">{generatedPack.title}</p>
            <p className="mt-2 text-xs uppercase tracking-wide text-zinc-400">Description</p>
            <p className="whitespace-pre-wrap text-zinc-100">{generatedPack.description}</p>
            <p className="mt-2 text-xs uppercase tracking-wide text-zinc-400">Tags</p>
            <p className="text-zinc-100">{generatedPack.tags.join(", ")}</p>
          </div>
        ) : null}

        {thumbnail ? (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-sm">
            <p className="text-zinc-400">
              Readability: <span className="text-zinc-100">{thumbnail.textReadabilityScore}/10</span>
              {" · "}
              Curiosity: <span className="text-zinc-100">{thumbnail.titleCuriosityGapScore}/10</span>
            </p>
            <p className="mt-2 text-zinc-400">Thumbnail Improvements</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-100">
              {thumbnail.improvementSuggestions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {generatedVariants.length > 0 ? (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-sm">
            <p className="text-zinc-400">Generated Thumbnails</p>
            <ul className="mt-2 grid gap-3 sm:grid-cols-3">
              {generatedVariants.map((variant, idx) => (
                <li
                  key={`${variant.mimeType}-${idx}`}
                  className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={variant.dataUrl}
                    alt={`Generated thumbnail ${idx + 1}`}
                    className="aspect-video w-full object-cover"
                  />
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <div className="text-[11px] text-zinc-400">
                      <p>Variant {idx + 1}</p>
                      <p>Readability {variant.readabilityScore}/10</p>
                      <p>Curiosity {variant.curiosityScore}/10</p>
                      <p>Score {variant.overallScore}/10</p>
                    </div>
                    <a
                      href={variant.dataUrl}
                      download={`draft-thumb-${idx + 1}.png`}
                      className="text-[11px] text-violet-300 hover:text-violet-200"
                    >
                      Download
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 md:p-5">
        <h2 className="text-lg font-semibold text-zinc-100">Unpublished Drafts</h2>
        <p className="mt-1 text-xs text-zinc-400">Stored locally in this browser.</p>
        {drafts.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-400">No drafts yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {drafts.map((draft) => (
              <li key={draft.id} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                <button
                  type="button"
                  onClick={() => hydrateFromDraft(draft)}
                  className="w-full text-left"
                >
                  <p className="truncate text-sm font-medium text-zinc-100">{draft.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {draft.tags.length} tags · Updated {new Date(draft.updatedAt).toLocaleString()}
                  </p>
                </button>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => deleteDraft(draft.id)}
                    className="text-xs text-rose-300 hover:text-rose-200"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
