import { describe, expect, it, vi } from "vitest";
import { embedTexts, EMBEDDING_MODEL } from "@/lib/embeddings";
import type { GoogleGenAI } from "@google/genai";

function fakeClient(response: unknown): GoogleGenAI {
  return {
    models: {
      embedContent: vi.fn().mockResolvedValue(response),
    },
  } as unknown as GoogleGenAI;
}

describe("embedTexts", () => {
  it("short-circuits with no API call for an empty input", async () => {
    const client = fakeClient({});
    const result = await embedTexts(client, []);
    expect(result).toEqual([]);
    expect(client.models.embedContent).not.toHaveBeenCalled();
  });

  it("returns vectors aligned 1:1 with input order", async () => {
    const client = fakeClient({
      embeddings: [{ values: [1, 0] }, { values: [0, 1] }],
    });
    const result = await embedTexts(client, ["a", "b"]);
    expect(result).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it("falls back to an empty vector for missing rows", async () => {
    const client = fakeClient({ embeddings: [{ values: [1, 0] }] });
    const result = await embedTexts(client, ["a", "b"]);
    expect(result[0]).toEqual([1, 0]);
    expect(result[1]).toEqual([]);
  });

  it("falls back to empty vectors when the response is shapeless", async () => {
    const client = fakeClient({});
    const result = await embedTexts(client, ["a"]);
    expect(result).toEqual([[]]);
  });

  it("calls embedContent with the documented model", async () => {
    const client = fakeClient({ embeddings: [{ values: [1] }] });
    await embedTexts(client, ["x"]);
    const calls = (client.models.embedContent as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0].model).toBe(EMBEDDING_MODEL);
  });
});
