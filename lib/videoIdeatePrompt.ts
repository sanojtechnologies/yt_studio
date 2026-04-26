import { Type } from "@google/genai";

export const VIDEO_IDEATE_LIMITS = {
  minIdeaCount: 3,
  maxIdeaCount: 10,
  maxKeywordCount: 8,
  maxKeywordLength: 80,
} as const;

export interface VideoIdeateIdea {
  title: string;
  hook: string;
  whyNow: string;
  keywordAngle: string;
  format: "short" | "long" | "either";
  confidence: "high" | "medium" | "low";
  supportingSignals: string[];
}

export interface VideoIdeateResponse {
  summary: string;
  ideas: VideoIdeateIdea[];
}

export interface VideoIdeateEvidence {
  windowDays: number;
  sampleSize: number;
  topPhrases: Array<{ phrase: string; weightedViews: number; count: number }>;
  keywordPerformance: Array<{
    keyword: string;
    mentions: number;
    avgViews: number;
    avgEngagementRate: number;
  }>;
  topVideos: Array<{
    title: string;
    channelTitle: string;
    viewCount: number;
    publishedAt: string;
  }>;
  opportunitySignals: string[];
}

export function clampIdeaCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return 5;
  const parsed = Math.trunc(value as number);
  if (parsed < VIDEO_IDEATE_LIMITS.minIdeaCount) return VIDEO_IDEATE_LIMITS.minIdeaCount;
  if (parsed > VIDEO_IDEATE_LIMITS.maxIdeaCount) return VIDEO_IDEATE_LIMITS.maxIdeaCount;
  return parsed;
}

export function normalizeSeedKeywords(rawKeywords: unknown): string[] {
  if (!Array.isArray(rawKeywords)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of rawKeywords) {
    if (typeof entry !== "string") continue;
    const value = entry.trim().slice(0, VIDEO_IDEATE_LIMITS.maxKeywordLength);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= VIDEO_IDEATE_LIMITS.maxKeywordCount) break;
  }
  return out;
}

export function buildVideoIdeatePrompt(args: {
  keywords: string[];
  ideaCount?: number;
  evidence: VideoIdeateEvidence;
}): string {
  const count = clampIdeaCount(args.ideaCount);
  const keywordsLine = args.keywords.map((item) => `"${item}"`).join(", ");
  return [
    "You are a YouTube strategist creating data-grounded ideas.",
    "Use ONLY the supplied evidence from the last 30 days.",
    `Return exactly ${count} ideas.`,
    "Rules:",
    "- whyNow must reference real evidence and specific trend signals.",
    "- supportingSignals must contain 2-4 concise, concrete bullets.",
    "- title should be <= 80 chars and not generic.",
    "- confidence must be one of: high, medium, low.",
    "- format must be one of: short, long, either.",
    "- Return JSON only, no markdown.",
    `Niche seed keywords: ${keywordsLine}`,
    "Evidence JSON:",
    JSON.stringify(args.evidence),
  ].join("\n");
}

export const VIDEO_IDEATE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    ideas: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          hook: { type: Type.STRING },
          whyNow: { type: Type.STRING },
          keywordAngle: { type: Type.STRING },
          format: { type: Type.STRING, enum: ["short", "long", "either"] },
          confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
          supportingSignals: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          "title",
          "hook",
          "whyNow",
          "keywordAngle",
          "format",
          "confidence",
          "supportingSignals",
        ],
        propertyOrdering: [
          "title",
          "hook",
          "whyNow",
          "keywordAngle",
          "format",
          "confidence",
          "supportingSignals",
        ],
      },
    },
  },
  required: ["summary", "ideas"],
  propertyOrdering: ["summary", "ideas"],
} as const;
