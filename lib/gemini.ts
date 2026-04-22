import { GenerateContentResponse, GoogleGenAI } from "@google/genai";

export const GEMINI_MODEL = "gemini-2.5-flash";

export function getGeminiClient(apiKey: string): GoogleGenAI {
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    throw new Error("Gemini API key is required");
  }

  return new GoogleGenAI({ apiKey: trimmed });
}

export function extractResponseText(response: GenerateContentResponse): string {
  if (typeof response.text === "string" && response.text.length > 0) {
    return response.text.trim();
  }
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

export interface GeminiDebugInfo {
  finishReason?: string;
  safetyRatings?: unknown;
  promptFeedback?: unknown;
}

export function extractDebugInfo(response: GenerateContentResponse): GeminiDebugInfo {
  const candidate = response.candidates?.[0];
  return {
    finishReason: candidate?.finishReason,
    safetyRatings: candidate?.safetyRatings,
    promptFeedback: response.promptFeedback,
  };
}
