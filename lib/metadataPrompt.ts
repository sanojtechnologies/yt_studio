import { Type } from "@google/genai";

export interface MetadataAnalysis {
  /** Composite packaging/SEO score, integer 1–10. */
  overallScore: number;
  /** Paragraph-level critique of the current title (hook, clarity, length, click-worthiness). */
  titleFeedback: string;
  /** Exactly 3 alternative titles the creator could A/B test. */
  titleSuggestions: string[];
  /** Paragraph-level critique of the description (hook, SEO, CTA, chapters, links, length). */
  descriptionFeedback: string;
  /** Exactly 3 concrete, copy-pasteable edits to the description. */
  descriptionSuggestions: string[];
  /** Paragraph-level critique of existing tags (relevance, duplication, missing topics). */
  tagsFeedback: string;
  /** Exactly 5 additional tags the creator should consider adding. */
  suggestedTags: string[];
  /** Exactly 3 prioritised action items spanning title / description / tags. */
  topRecommendations: string[];
}

/**
 * Input caps applied before the prompt is built. Defensive against
 * accidental blob paste; YouTube's own field limits are much smaller
 * (title 100, description 5000) but we accept anything the API might
 * hand us and let Gemini handle the text.
 */
export const METADATA_LIMITS = {
  maxTitleLength: 500,
  maxDescriptionLength: 10_000,
  maxTagCount: 100,
  maxTagLength: 100,
} as const;

/**
 * Clamp a tag list to the configured count + per-tag length, drop
 * falsy/empty strings, and trim whitespace. Preserves order because
 * YouTube treats earlier tags as higher priority for search relevance.
 */
export function normaliseTags(tags: string[] | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  const cleaned: string[] = [];
  for (const entry of tags) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    cleaned.push(trimmed.slice(0, METADATA_LIMITS.maxTagLength));
    if (cleaned.length >= METADATA_LIMITS.maxTagCount) break;
  }
  return cleaned;
}

export function buildMetadataPrompt(args: {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
}): string {
  const { videoId, title, description, tags } = args;
  const tagsBlock = tags.length === 0 ? "(no tags set)" : tags.map((tag) => `- ${tag}`).join("\n");

  return [
    "You are a YouTube packaging and SEO expert.",
    "Evaluate the video's title, description, and tags for discoverability, click-through potential, and watch-time signalling.",
    "Rules:",
    "- overallScore is an integer 1-10 reflecting how strong the overall packaging is (title + description + tags combined).",
    "- titleSuggestions must contain exactly 3 alternative titles that preserve the video's topic but improve clarity or curiosity.",
    "- descriptionSuggestions must contain exactly 3 copy-pasteable edits (not vague advice — actual rewrites or additions).",
    "- suggestedTags must contain exactly 5 additional tags (no duplicates of existing tags; lowercase unless a proper noun).",
    "- topRecommendations must contain exactly 3 prioritised action items; order them most impactful first.",
    "- All feedback fields must be plain prose, 2-4 sentences, no markdown headings or lists.",
    "- Never invent facts about the video beyond what's inferable from the provided fields.",
    "",
    `Video ID: ${videoId}`,
    `Title: ${title}`,
    "Description:",
    description || "(no description)",
    "Current tags:",
    tagsBlock,
  ].join("\n");
}

export const METADATA_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overallScore: { type: Type.INTEGER },
    titleFeedback: { type: Type.STRING },
    titleSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
    descriptionFeedback: { type: Type.STRING },
    descriptionSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
    tagsFeedback: { type: Type.STRING },
    suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING } },
    topRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "overallScore",
    "titleFeedback",
    "titleSuggestions",
    "descriptionFeedback",
    "descriptionSuggestions",
    "tagsFeedback",
    "suggestedTags",
    "topRecommendations",
  ],
  propertyOrdering: [
    "overallScore",
    "titleFeedback",
    "titleSuggestions",
    "descriptionFeedback",
    "descriptionSuggestions",
    "tagsFeedback",
    "suggestedTags",
    "topRecommendations",
  ],
};

/**
 * Runtime shape check used by both the client-side cache validator and the
 * test suite. The server-side route trusts Gemini's schema and just returns
 * the parsed JSON, so this is mostly a defensive net for stored data that
 * may be from an older app version.
 */
export function isMetadataAnalysis(value: unknown): value is MetadataAnalysis {
  if (!isRecord(value)) return false;
  if (typeof value.overallScore !== "number") return false;
  if (typeof value.titleFeedback !== "string") return false;
  if (typeof value.descriptionFeedback !== "string") return false;
  if (typeof value.tagsFeedback !== "string") return false;
  if (!isStringArray(value.titleSuggestions)) return false;
  if (!isStringArray(value.descriptionSuggestions)) return false;
  if (!isStringArray(value.suggestedTags)) return false;
  if (!isStringArray(value.topRecommendations)) return false;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
