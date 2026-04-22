import { Type } from "@google/genai";

export interface AbTitleAxisScore {
  axis: "clarity" | "curiosity" | "seo" | "clickability";
  a: number;
  b: number;
}

export interface AbTitleResponse {
  winnerIndex: 0 | 1;
  axes: AbTitleAxisScore[];
  reasons: string[];
}

export interface AbTitleInput {
  titleA: string;
  titleB: string;
  channelContext?: string;
  audience?: string;
}

export const AB_TITLE_LIMITS = {
  maxTitleLength: 200,
  maxChannelContextLength: 500,
  maxAudienceLength: 200,
} as const;

export function buildAbTitlePrompt(input: AbTitleInput): string {
  const { titleA, titleB, channelContext, audience } = input;
  return [
    "You are a YouTube title analyst scoring two candidates head-to-head.",
    "Score each title 1-10 on FOUR axes: clarity, curiosity, seo, clickability.",
    "Then pick a winnerIndex (0 = A, 1 = B) based on the weighted whole.",
    "Provide 2-4 short, concrete reasons (≤25 words each) for the verdict.",
    "Return ONLY JSON matching the provided schema. No commentary.",
    "",
    `Title A: ${titleA}`,
    `Title B: ${titleB}`,
    audience ? `Audience: ${audience}` : "",
    channelContext ? `Channel context: ${channelContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const AB_TITLE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    winnerIndex: { type: Type.INTEGER },
    axes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          axis: { type: Type.STRING },
          a: { type: Type.INTEGER },
          b: { type: Type.INTEGER },
        },
        required: ["axis", "a", "b"],
        propertyOrdering: ["axis", "a", "b"],
      },
    },
    reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["winnerIndex", "axes", "reasons"],
  propertyOrdering: ["winnerIndex", "axes", "reasons"],
};
