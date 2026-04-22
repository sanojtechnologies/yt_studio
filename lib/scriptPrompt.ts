import { Type } from "@google/genai";

export interface ScriptBeat {
  heading: string;
  bullets: string[];
}

export interface ScriptResponse {
  coldOpen: string;
  hook: string;
  beats: ScriptBeat[];
  callToAction: string;
  outro: string;
}

export interface ScriptInput {
  title: string;
  targetMinutes: number;
  audience?: string;
  channelContext?: string;
}

/** Caps mirror YouTube's practical script limits + Gemini prompt size budget. */
export const SCRIPT_LIMITS = {
  maxTitleLength: 160,
  minTargetMinutes: 1,
  maxTargetMinutes: 30,
  maxAudienceLength: 200,
  maxChannelContextLength: 500,
} as const;

/** Suggested beat count scaled to the target runtime; keeps very short scripts tight. */
export function suggestedBeatCount(targetMinutes: number): number {
  if (!Number.isFinite(targetMinutes) || targetMinutes <= 0) return 3;
  if (targetMinutes <= 3) return 3;
  if (targetMinutes <= 8) return 5;
  if (targetMinutes <= 15) return 7;
  return 9;
}

export function buildScriptPrompt(input: ScriptInput): string {
  const { title, targetMinutes, audience, channelContext } = input;
  const beats = suggestedBeatCount(targetMinutes);
  return [
    "You are a senior YouTube script doctor.",
    `Write a ${targetMinutes}-minute script outline for the video titled below.`,
    `Structure it as: coldOpen (≤10s), hook (≤30s), ${beats} beats, a callToAction, and an outro.`,
    "Each beat has a heading plus 2–4 concrete bullet points a creator can riff on.",
    "Tone: conversational, specific, evidence-led. Avoid filler.",
    "Return ONLY JSON matching the provided schema. No commentary, no markdown.",
    "",
    `Title: ${title}`,
    audience ? `Primary audience: ${audience}` : "",
    channelContext ? `Channel context: ${channelContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const SCRIPT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    coldOpen: { type: Type.STRING },
    hook: { type: Type.STRING },
    beats: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          heading: { type: Type.STRING },
          bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["heading", "bullets"],
        propertyOrdering: ["heading", "bullets"],
      },
    },
    callToAction: { type: Type.STRING },
    outro: { type: Type.STRING },
  },
  required: ["coldOpen", "hook", "beats", "callToAction", "outro"],
  propertyOrdering: ["coldOpen", "hook", "beats", "callToAction", "outro"],
};
