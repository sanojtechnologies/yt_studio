import { Type } from "@google/genai";
import { YouTubeVideo } from "@/types/youtube";

export interface VideoSummary {
  title: string;
  views: number;
  likes: number;
  comments: number;
  duration: string;
  publishedAt: string;
  dayOfWeek: string;
}

export function toDayOfWeek(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

export function summarizeVideos(videos: YouTubeVideo[]): VideoSummary[] {
  return videos.map((video) => ({
    title: video.title,
    views: video.viewCount,
    likes: video.likeCount,
    comments: video.commentCount,
    duration: video.duration,
    publishedAt: video.publishedAt,
    dayOfWeek: toDayOfWeek(video.publishedAt),
  }));
}

export function buildAnalyzePrompt(
  channelId: string,
  videos: VideoSummary[]
): string {
  return [
    "You are a YouTube growth strategist.",
    "Analyze the channel performance data and return ONLY valid minified JSON.",
    "Do not include markdown, code fences, commentary, or extra keys.",
    "",
    "Return this exact JSON shape:",
    "{",
    '  "topPatternsThatWork": ["string", "string", "string"],',
    '  "topUnderperformingPatterns": ["string", "string", "string"],',
    '  "contentGapSuggestions": ["string", "string", "string", "string", "string"],',
    '  "optimalPostingSchedule": {',
    '    "bestDays": ["string"],',
    '    "bestTimeWindows": ["string"],',
    '    "recommendedFrequency": "string",',
    '    "rationale": "string"',
    "  }",
    "}",
    "",
    "Requirements:",
    "- topPatternsThatWork: exactly 3 concise insights.",
    "- topUnderperformingPatterns: exactly 3 concise insights.",
    "- contentGapSuggestions: exactly 5 concrete ideas.",
    "- optimalPostingSchedule: actionable and data-grounded.",
    "- Base all conclusions only on the provided video summary.",
    "",
    `Channel ID: ${channelId}`,
    `Video Summary JSON: ${JSON.stringify(videos)}`,
  ].join("\n");
}

export const ANALYZE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    topPatternsThatWork: { type: Type.ARRAY, items: { type: Type.STRING } },
    topUnderperformingPatterns: { type: Type.ARRAY, items: { type: Type.STRING } },
    contentGapSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
    optimalPostingSchedule: {
      type: Type.OBJECT,
      properties: {
        bestDays: { type: Type.ARRAY, items: { type: Type.STRING } },
        bestTimeWindows: { type: Type.ARRAY, items: { type: Type.STRING } },
        recommendedFrequency: { type: Type.STRING },
        rationale: { type: Type.STRING },
      },
      required: ["bestDays", "bestTimeWindows", "recommendedFrequency", "rationale"],
      propertyOrdering: [
        "bestDays",
        "bestTimeWindows",
        "recommendedFrequency",
        "rationale",
      ],
    },
  },
  required: [
    "topPatternsThatWork",
    "topUnderperformingPatterns",
    "contentGapSuggestions",
    "optimalPostingSchedule",
  ],
  propertyOrdering: [
    "topPatternsThatWork",
    "topUnderperformingPatterns",
    "contentGapSuggestions",
    "optimalPostingSchedule",
  ],
};
