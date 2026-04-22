import { Type } from "@google/genai";
import { ChannelComparisonRow } from "@/lib/compareStats";

export interface CompareGapChannelInput {
  channelId: string;
  channelTitle: string;
  medianViews: number;
  topTitles: string[];
}

export interface CompareGapInput {
  channels: CompareGapChannelInput[];
  focus?: string;
}

export interface CompareGapPerChannel {
  channelId: string;
  missingTopics: string[];
  notes: string;
}

export interface CompareGapResponse {
  sharedTopics: string[];
  perChannelGaps: CompareGapPerChannel[];
}

export const COMPARE_GAP_LIMITS = {
  minChannels: 2,
  maxChannels: 4,
  maxTopTitles: 8,
  maxFocusLength: 300,
} as const;

const MISSING_TWO_CHANNELS_MESSAGE =
  "Competitor gap analysis needs at least 2 channels.";

export function selectGapChannels(
  rows: ChannelComparisonRow[],
  topN: number = COMPARE_GAP_LIMITS.maxTopTitles
): CompareGapChannelInput[] {
  return rows.map((row) => ({
    channelId: row.channel.id,
    channelTitle: row.channel.title,
    medianViews: row.medianViews,
    topTitles: row.topVideos
      .slice(0, topN)
      .map((v) => v.title)
      .filter((t) => t.trim().length > 0),
  }));
}

export function buildCompareGapPrompt(input: CompareGapInput): string {
  const header = [
    "You are a YouTube content strategist doing a comparative gap analysis.",
    `Given ${input.channels.length} channels and each channel's top-performing titles,`,
    "identify (a) topics that appear across MULTIPLE channels (sharedTopics)",
    "and (b) topics/angles each channel is MISSING relative to peers (perChannelGaps).",
    "Each channel in perChannelGaps MUST use the provided channelId verbatim.",
    "Return only JSON matching the provided schema. Concise prose only.",
  ].join("\n");

  const channelBlocks = input.channels.map((c, idx) => {
    const titleLines = c.topTitles.length
      ? c.topTitles.map((t, i) => `  ${i + 1}. ${t}`).join("\n")
      : "  (no titles available)";
    return [
      `Channel ${idx + 1} — ${c.channelTitle} (id=${c.channelId})`,
      `  Median views: ${c.medianViews.toLocaleString("en-US")}`,
      "  Top titles:",
      titleLines,
    ].join("\n");
  });

  const focusLine = input.focus ? `\nFocus / user note: ${input.focus}` : "";
  return [header, "", ...channelBlocks, focusLine].filter(Boolean).join("\n");
}

export const COMPARE_GAP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    sharedTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
    perChannelGaps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          channelId: { type: Type.STRING },
          missingTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
          notes: { type: Type.STRING },
        },
        required: ["channelId", "missingTopics", "notes"],
        propertyOrdering: ["channelId", "missingTopics", "notes"],
      },
    },
  },
  required: ["sharedTopics", "perChannelGaps"],
  propertyOrdering: ["sharedTopics", "perChannelGaps"],
};

export { MISSING_TWO_CHANNELS_MESSAGE };
