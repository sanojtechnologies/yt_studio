import { Type } from "@google/genai";
import { YouTubeVideo } from "@/types/youtube";

export interface TitleCandidate {
  title: string;
  rationale: string;
  curiosityGapScore: number;
  keywordStrengthScore: number;
  alignmentWithChannelScore: number;
  characterCount: number;
  warnings: string[];
}

export interface TitleLabResponse {
  candidates: TitleCandidate[];
  channelStyleSummary: string;
}

export interface TitleLabInput {
  topic: string;
  audience?: string;
  desiredTone?: string;
  topPerformers: Array<Pick<YouTubeVideo, "title" | "viewCount">>;
}

const DESIRED_COUNT = 10;

/**
 * Distill the raw 50-video sample into the 10 strongest examples (by view
 * count) so the prompt stays small and the model anchors on what actually
 * works for this channel — not the long tail.
 */
export function pickTopPerformers(
  videos: YouTubeVideo[],
  limit = 10
): Array<Pick<YouTubeVideo, "title" | "viewCount">> {
  return [...videos]
    .filter((v) => v.title.length > 0)
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, limit)
    .map((v) => ({ title: v.title, viewCount: v.viewCount }));
}

export function buildTitleLabPrompt(input: TitleLabInput): string {
  const { topic, audience, desiredTone, topPerformers } = input;
  return [
    "You are a senior YouTube title strategist.",
    `Generate exactly ${DESIRED_COUNT} title candidates for the topic below.`,
    "Each candidate must:",
    "- Be 40-70 characters; flag warnings if outside.",
    "- Score curiosityGapScore, keywordStrengthScore, alignmentWithChannelScore as integers 1-10.",
    "- Provide a short rationale explaining the lever it pulls.",
    "- Include `warnings` for length, clickbait, or misalignment issues; empty array when clean.",
    "Use this channel's recent top performers as voice/style reference.",
    "Return ONLY JSON matching the provided schema. No commentary.",
    "",
    `Topic: ${topic}`,
    audience ? `Audience: ${audience}` : "",
    desiredTone ? `Desired tone: ${desiredTone}` : "",
    "",
    "Channel top performers:",
    JSON.stringify(topPerformers),
  ]
    .filter(Boolean)
    .join("\n");
}

export const TITLE_LAB_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    channelStyleSummary: { type: Type.STRING },
    candidates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          rationale: { type: Type.STRING },
          curiosityGapScore: { type: Type.INTEGER },
          keywordStrengthScore: { type: Type.INTEGER },
          alignmentWithChannelScore: { type: Type.INTEGER },
          characterCount: { type: Type.INTEGER },
          warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          "title",
          "rationale",
          "curiosityGapScore",
          "keywordStrengthScore",
          "alignmentWithChannelScore",
          "characterCount",
          "warnings",
        ],
        propertyOrdering: [
          "title",
          "rationale",
          "curiosityGapScore",
          "keywordStrengthScore",
          "alignmentWithChannelScore",
          "characterCount",
          "warnings",
        ],
      },
    },
  },
  required: ["channelStyleSummary", "candidates"],
  propertyOrdering: ["channelStyleSummary", "candidates"],
};

export const TITLE_LAB_LIMITS = {
  maxTopicLength: 280,
  desiredCount: DESIRED_COUNT,
} as const;
