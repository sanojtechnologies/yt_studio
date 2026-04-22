import { Type } from "@google/genai";
import { NextResponse } from "next/server";
import { getGeminiApiKey } from "@/lib/apiKey";
import { extractDebugInfo, extractResponseText, GEMINI_MODEL, getGeminiClient } from "@/lib/gemini";
import { METADATA_LIMITS, normaliseTags } from "@/lib/metadataPrompt";

const MISSING_GEMINI_KEY_MESSAGE =
  "Add your Gemini API key in the API Keys panel to generate metadata.";

interface MetadataGenerateBody {
  videoId?: string;
  currentTitle?: string;
  currentDescription?: string;
  currentTags?: string[];
  recommendedTitle?: string;
  topRecommendations?: string[];
  descriptionSuggestions?: string[];
  suggestedTags?: string[];
}

interface GeneratedMetadataPack {
  overallScore: number;
  title: string;
  description: string;
  tags: string[];
}

const GENERATED_METADATA_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overallScore: { type: Type.INTEGER },
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["overallScore", "title", "description", "tags"],
  propertyOrdering: ["overallScore", "title", "description", "tags"],
} as const;

function sanitizeLines(values: string[] | undefined, maxItems: number): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, maxItems);
}

function isGeneratedMetadataPack(value: unknown): value is GeneratedMetadataPack {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.overallScore === "number" &&
    Number.isInteger(candidate.overallScore) &&
    candidate.overallScore >= 1 &&
    candidate.overallScore <= 10 &&
    typeof candidate.title === "string" &&
    typeof candidate.description === "string" &&
    Array.isArray(candidate.tags) &&
    candidate.tags.every((tag) => typeof tag === "string")
  );
}

function buildMetadataPackPrompt(args: {
  videoId: string;
  currentTitle: string;
  currentDescription: string;
  currentTags: string[];
  recommendedTitle: string;
  topRecommendations: string[];
  descriptionSuggestions: string[];
  suggestedTags: string[];
}): string {
  const {
    videoId,
    currentTitle,
    currentDescription,
    currentTags,
    recommendedTitle,
    topRecommendations,
    descriptionSuggestions,
    suggestedTags,
  } = args;

  const recommendationsBlock =
    topRecommendations.length > 0 ? topRecommendations.map((item) => `- ${item}`).join("\n") : "- (none)";
  const descriptionHintsBlock =
    descriptionSuggestions.length > 0
      ? descriptionSuggestions.map((item) => `- ${item}`).join("\n")
      : "- (none)";
  const currentTagsBlock =
    currentTags.length > 0 ? currentTags.map((tag) => `- ${tag}`).join("\n") : "- (none)";
  const suggestedTagsBlock =
    suggestedTags.length > 0 ? suggestedTags.map((tag) => `- ${tag}`).join("\n") : "- (none)";

  return [
    "You are a YouTube growth strategist and copywriter.",
    "Generate a publish-ready metadata pack for one video.",
    "Hard requirements:",
    "- Use the recommended title as the final title (you may lightly polish wording but keep intent).",
    "- Description must be coherent prose aligned to the final title and must NOT include analysis notes, bullet-point advice, or sections like 'Prioritized improvements'.",
    "- Description should read like final YouTube copy: strong opening hook, value promise, and clear CTA.",
    "- Tags must be practical search tags; return 8 to 15 tags, deduplicated, no empty strings.",
    "- overallScore must be an integer 1-10 representing the SEO/packaging quality of the NEW generated pack (not the old one).",
    "- Return JSON only matching the schema.",
    "",
    `Video ID: ${videoId}`,
    `Current title: ${currentTitle}`,
    "Current description:",
    currentDescription || "(no description)",
    "Current tags:",
    currentTagsBlock,
    `Recommended title: ${recommendedTitle}`,
    "Top recommendations:",
    recommendationsBlock,
    "Description suggestions:",
    descriptionHintsBlock,
    "Suggested tags:",
    suggestedTagsBlock,
  ].join("\n");
}

export async function POST(request: Request) {
  const geminiKey = getGeminiApiKey();
  if (!geminiKey) {
    return NextResponse.json({ error: MISSING_GEMINI_KEY_MESSAGE }, { status: 401 });
  }

  let body: MetadataGenerateBody;
  try {
    body = (await request.json()) as MetadataGenerateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const videoId = body.videoId?.trim();
  const currentTitle = body.currentTitle?.trim();
  const currentDescription =
    typeof body.currentDescription === "string"
      ? body.currentDescription.trim().slice(0, METADATA_LIMITS.maxDescriptionLength)
      : null;
  const recommendedTitle = body.recommendedTitle?.trim();
  if (!videoId || !currentTitle || currentDescription === null || !recommendedTitle) {
    return NextResponse.json(
      { error: "videoId, currentTitle, currentDescription, and recommendedTitle are required" },
      { status: 400 }
    );
  }

  const currentTags = normaliseTags(body.currentTags);
  const topRecommendations = sanitizeLines(body.topRecommendations, 3);
  const descriptionSuggestions = sanitizeLines(body.descriptionSuggestions, 3);
  const suggestedTags = normaliseTags(body.suggestedTags);

  const client = getGeminiClient(geminiKey);
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: buildMetadataPackPrompt({
              videoId,
              currentTitle,
              currentDescription,
              currentTags,
              recommendedTitle,
              topRecommendations,
              descriptionSuggestions,
              suggestedTags,
            }),
          },
        ],
      },
    ],
    config: {
      temperature: 0.4,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: GENERATED_METADATA_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const rawText = extractResponseText(response);
  const debug = extractDebugInfo(response);
  if (!rawText) {
    return NextResponse.json(
      { error: "Gemini returned an empty response", debug },
      { status: 502 }
    );
  }

  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (!isGeneratedMetadataPack(parsed)) {
      return NextResponse.json(
        { error: "Gemini returned invalid metadata pack shape", raw: rawText, debug },
        { status: 502 }
      );
    }
    return NextResponse.json({
      overallScore: parsed.overallScore,
      title: parsed.title.trim() || recommendedTitle,
      description: parsed.description.trim(),
      tags: normaliseTags(parsed.tags).slice(0, 15),
    });
  } catch {
    return NextResponse.json(
      { error: "Gemini did not return valid JSON", raw: rawText, debug },
      { status: 502 }
    );
  }
}
