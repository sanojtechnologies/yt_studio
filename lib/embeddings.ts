import { GoogleGenAI } from "@google/genai";

export const EMBEDDING_MODEL = "text-embedding-004";

interface EmbedContentResponse {
  embeddings?: Array<{ values?: number[] }>;
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
  // The SDK accepts a single string or an array. Use array form for clarity.
  const response = (await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: inputs,
  })) as unknown as EmbedContentResponse;

  const rows = response.embeddings ?? [];
  return inputs.map((_, idx) => rows[idx]?.values ?? []);
}
