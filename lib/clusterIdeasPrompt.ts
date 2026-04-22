import { Type } from "@google/genai";
import type { AggregateClusterStats } from "@/lib/cluster";

export interface ClusterIdea {
  title: string;
  hook: string;
  why: string;
}

export interface ClusterIdeasResponse {
  ideas: ClusterIdea[];
}

export interface ClusterIdeasInput {
  label: string;
  sampleTitles: string[];
  medianViews: number;
  channelContext?: string;
  ideaCount?: number;
}

export const CLUSTER_IDEAS_LIMITS = {
  minIdeas: 3,
  maxIdeas: 8,
  maxTitles: 12,
  maxLabelLength: 120,
  maxChannelContextLength: 500,
} as const;

export function clampIdeaCount(desired: number | undefined): number {
  if (typeof desired !== "number" || !Number.isFinite(desired)) return 5;
  const raw = Math.trunc(desired);
  if (!raw) return 5;
  if (raw < CLUSTER_IDEAS_LIMITS.minIdeas) return CLUSTER_IDEAS_LIMITS.minIdeas;
  if (raw > CLUSTER_IDEAS_LIMITS.maxIdeas) return CLUSTER_IDEAS_LIMITS.maxIdeas;
  return raw;
}

export function clusterIdeasInputFromStats(
  stats: AggregateClusterStats,
  extra: { label?: string; channelContext?: string; ideaCount?: number } = {}
): ClusterIdeasInput {
  return {
    label: extra.label?.trim() || `Theme ${stats.clusterId + 1}`,
    sampleTitles: stats.representativeTitles
      .filter((t) => t && t.trim().length > 0)
      .slice(0, CLUSTER_IDEAS_LIMITS.maxTitles),
    medianViews: stats.medianViews,
    channelContext: extra.channelContext?.trim() || undefined,
    ideaCount: extra.ideaCount,
  };
}

export function buildClusterIdeasPrompt(input: ClusterIdeasInput): string {
  const count = clampIdeaCount(input.ideaCount);
  const titleLines = input.sampleTitles.length
    ? input.sampleTitles.map((t, i) => `  ${i + 1}. ${t}`).join("\n")
    : "  (no titles available)";
  return [
    "You are a YouTube content strategist generating fresh video ideas for a topic cluster.",
    `Produce exactly ${count} new video ideas. Each MUST include:`,
    "- title (<= 80 chars, distinct angle, no clickbait-y ALL CAPS)",
    "- hook (<= 2 sentences, first 10 seconds of the video)",
    "- why (<= 2 sentences explaining why this idea fits the cluster)",
    "Do not repeat the sample titles. Return ONLY JSON.",
    "",
    `Cluster label: ${input.label}`,
    `Median views in cluster: ${input.medianViews.toLocaleString("en-US")}`,
    "Sample titles:",
    titleLines,
    input.channelContext ? `Channel context: ${input.channelContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const CLUSTER_IDEAS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    ideas: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          hook: { type: Type.STRING },
          why: { type: Type.STRING },
        },
        required: ["title", "hook", "why"],
        propertyOrdering: ["title", "hook", "why"],
      },
    },
  },
  required: ["ideas"],
  propertyOrdering: ["ideas"],
};
