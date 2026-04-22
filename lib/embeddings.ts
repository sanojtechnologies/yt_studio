import { GoogleGenAI } from "@google/genai";

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL?.trim() || "text-embedding-004";
export const EMBEDDING_FALLBACK_MODEL = "gemini-embedding-001";

interface EmbedContentResponse {
  embeddings?: Array<{ values?: number[] }>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  if (isRecord(error)) {
    const nested =
      getMaybeString(error, "message") ??
      (isRecord(error.error) ? getMaybeString(error.error, "message") : undefined);
    if (nested && nested.trim()) return nested.trim();
  }
  return "Unknown error";
}

function isModelNotFoundError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("not_found") || message.includes("not found") || message.includes("404");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getMaybeString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Thin adapter so tests don't have to mock the full `@google/genai` shape —
 * we only depend on `models.embedContent`, which the live library exposes.
 * Returns an array aligned 1:1 with the input order; missing rows fall back
 * to a zero vector so downstream cosine similarity treats them as neutral.
 */
export async function embedTexts(
  client: GoogleGenAI,
  inputs: string[]
): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const modelsToTry = Array.from(new Set([EMBEDDING_MODEL, EMBEDDING_FALLBACK_MODEL]));

  let response: EmbedContentResponse | null = null;
  let lastError: unknown;
  for (const model of modelsToTry) {
    try {
      // The SDK accepts a single string or an array. Use array form for clarity.
      response = (await client.models.embedContent({
        model,
        contents: inputs,
      })) as unknown as EmbedContentResponse;
      break;
    } catch (error) {
      lastError = error;
      if (!isModelNotFoundError(error)) throw error;
    }
  }
  if (!response) throw lastError;

  const rows = response.embeddings ?? [];
  return inputs.map((_, idx) => rows[idx]?.values ?? []);
}
