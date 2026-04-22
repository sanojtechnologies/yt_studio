import { Type } from "@google/genai";

export interface ThumbnailAnalysis {
  faceEmotionDetection: string;
  textReadabilityScore: number;
  colorContrastAssessment: string;
  titleCuriosityGapScore: number;
  improvementSuggestions: string[];
}

export const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function buildThumbnailPrompt(videoId: string, title: string): string {
  return [
    "You are a YouTube thumbnail and packaging expert.",
    "Analyze the attached thumbnail image together with the provided title.",
    "Rules:",
    "- textReadabilityScore is an integer 1-10.",
    "- titleCuriosityGapScore is an integer 1-10.",
    "- improvementSuggestions must contain exactly 3 specific, actionable recommendations.",
    "- If no face is visible, say so plainly in faceEmotionDetection.",
    `Video ID: ${videoId}`,
    `Video Title: ${title}`,
  ].join("\n");
}

export const THUMBNAIL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    faceEmotionDetection: { type: Type.STRING },
    textReadabilityScore: { type: Type.INTEGER },
    colorContrastAssessment: { type: Type.STRING },
    titleCuriosityGapScore: { type: Type.INTEGER },
    improvementSuggestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    "faceEmotionDetection",
    "textReadabilityScore",
    "colorContrastAssessment",
    "titleCuriosityGapScore",
    "improvementSuggestions",
  ],
  propertyOrdering: [
    "faceEmotionDetection",
    "textReadabilityScore",
    "colorContrastAssessment",
    "titleCuriosityGapScore",
    "improvementSuggestions",
  ],
};
