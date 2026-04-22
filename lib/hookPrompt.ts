import { Type } from "@google/genai";

export interface HookOption {
  label: string;
  hook: string;
  reasoning: string;
  approxSeconds: number;
}

export interface ChapterMarker {
  timestamp: string; // mm:ss or hh:mm:ss
  title: string;
}

export interface HookResponse {
  hooks: HookOption[];
  description: string;
  tags: string[];
  chapters: ChapterMarker[];
}

export interface HookInput {
  title: string;
  outline: string;
  targetLengthMinutes?: number;
}

export const HOOK_LIMITS = {
  maxTitleLength: 200,
  maxOutlineLength: 4000,
} as const;

export function buildHookPrompt(input: HookInput): string {
  const { title, outline, targetLengthMinutes } = input;
  return [
    "You are a YouTube cold-open and packaging coach.",
    "Given a planned video, return:",
    "- 3 hook variants (≤15 seconds each, distinct angles).",
    "- 1 SEO description: 150-300 words, includes primary keyword in first sentence.",
    "- 3-7 search-friendly tags (lowercase, no hashtags).",
    "- Chapter markers using HH:MM:SS or MM:SS timestamps that match the outline.",
    "Reasoning fields explain the lever (curiosity / contrast / stakes / payoff).",
    "Return ONLY JSON matching the provided schema. No commentary or markdown.",
    "",
    `Video title: ${title}`,
    targetLengthMinutes ? `Target length: ${targetLengthMinutes} minutes` : "",
    "",
    "Outline:",
    outline,
  ]
    .filter(Boolean)
    .join("\n");
}

export const HOOK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    hooks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          hook: { type: Type.STRING },
          reasoning: { type: Type.STRING },
          approxSeconds: { type: Type.INTEGER },
        },
        required: ["label", "hook", "reasoning", "approxSeconds"],
        propertyOrdering: ["label", "hook", "reasoning", "approxSeconds"],
      },
    },
    description: { type: Type.STRING },
    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    chapters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          timestamp: { type: Type.STRING },
          title: { type: Type.STRING },
        },
        required: ["timestamp", "title"],
        propertyOrdering: ["timestamp", "title"],
      },
    },
  },
  required: ["hooks", "description", "tags", "chapters"],
  propertyOrdering: ["hooks", "description", "tags", "chapters"],
};

const TIMESTAMP_PATTERN = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;

export function isValidTimestamp(value: string): boolean {
  return TIMESTAMP_PATTERN.test(value.trim());
}
