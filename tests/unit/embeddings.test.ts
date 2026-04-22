import { describe, expect, it, vi } from "vitest";
import { embedTexts, EMBEDDING_MODEL, EMBEDDING_FALLBACK_MODEL } from "@/lib/embeddings";
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

  it("falls back to gemini-embedding-001 when primary model is not found", async () => {
    const client = {
      models: {
        embedContent: vi
          .fn()
          .mockRejectedValueOnce(new Error("404 NOT_FOUND: model not found"))
          .mockResolvedValueOnce({ embeddings: [{ values: [0.5, 0.5] }] }),
      },
    } as unknown as GoogleGenAI;

    const result = await embedTexts(client, ["x"]);
    const calls = (client.models.embedContent as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][0].model).toBe(EMBEDDING_FALLBACK_MODEL);
    expect(result).toEqual([[0.5, 0.5]]);
  });

  it("treats a nested error payload with NOT_FOUND message as fallback-eligible", async () => {
    const client = {
      models: {
        embedContent: vi
          .fn()
          .mockRejectedValueOnce({
            error: { message: "models/text-embedding-004 is not found (404)" },
          })
          .mockResolvedValueOnce({ embeddings: [{ values: [1] }] }),
      },
    } as unknown as GoogleGenAI;
    const result = await embedTexts(client, ["x"]);
    const calls = (client.models.embedContent as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][0].model).toBe(EMBEDDING_FALLBACK_MODEL);
    expect(result).toEqual([[1]]);
  });

  it("rethrows non-not-found string errors without fallback", async () => {
    const client = {
      models: {
        embedContent: vi.fn().mockRejectedValueOnce("service overloaded"),
      },
    } as unknown as GoogleGenAI;
    await expect(embedTexts(client, ["x"])).rejects.toBe("service overloaded");
    const calls = (client.models.embedContent as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
  });

  it("rethrows unknown object errors without fallback", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const client = {
      models: {
        embedContent: vi.fn().mockRejectedValueOnce(circular),
      },
    } as unknown as GoogleGenAI;
    await expect(embedTexts(client, ["x"])).rejects.toBe(circular);
  });

  it("throws when all candidate models are not found", async () => {
    const client = {
      models: {
        embedContent: vi
          .fn()
          .mockRejectedValueOnce(new Error("404 not found"))
          .mockRejectedValueOnce({ error: { message: "NOT_FOUND" } }),
      },
    } as unknown as GoogleGenAI;
    await expect(embedTexts(client, ["x"])).rejects.toBeTruthy();
    const calls = (client.models.embedContent as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
  });
});
