/**
 * End-to-end smoke tests against the real YouTube Data API and Google Gemini.
 *
 * These tests are gated on two env vars so the normal `npm test` run does not
 * consume live quota or require keys:
 *
 *   YOUTUBE_API_KEY_TEST - YouTube Data API v3 key with quota enabled
 *   GEMINI_API_KEY_TEST  - Google AI Studio Gemini key
 *
 * Sample channel: @LearnwithManoj (chosen by the project owner).
 */
import { describe, expect, it } from "vitest";
import {
  ANALYZE_SCHEMA,
  buildAnalyzePrompt,
  summarizeVideos,
} from "@/lib/analyzePrompt";
import {
  extractDebugInfo,
  extractResponseText,
  GEMINI_MODEL,
  getGeminiClient,
} from "@/lib/gemini";
import {
  buildThumbnailPrompt,
  SUPPORTED_IMAGE_TYPES,
  THUMBNAIL_SCHEMA,
} from "@/lib/thumbnailPrompt";
import {
  getChannelByHandle,
  getChannelById,
  getChannelVideos,
} from "@/lib/youtube";
import {
  assertAnalyzeResponse,
  assertThumbnailAnalysis,
} from "../utils/schemas";

const HANDLE = "LearnwithManoj";
const YT_KEY = process.env.YOUTUBE_API_KEY_TEST?.trim() ?? "";
const GEMINI_KEY = process.env.GEMINI_API_KEY_TEST?.trim() ?? "";

const haveYouTube = YT_KEY.length > 0;
const haveGemini = GEMINI_KEY.length > 0;
const haveBoth = haveYouTube && haveGemini;

// Resolve the channel once and share across the live tests to keep quota use
// tight. Populated by the first test that depends on YouTube.
let resolvedChannelId: string | null = null;
let resolvedVideos: Awaited<ReturnType<typeof getChannelVideos>> = [];

describe.runIf(haveYouTube)("live · YouTube · @LearnwithManoj", () => {
  it("resolves the channel id by handle", async () => {
    const channel = await getChannelByHandle(YT_KEY, HANDLE);
    expect(channel, "channel should be found").not.toBeNull();
    expect(channel?.id).toMatch(/^UC[\w-]{20,}$/);
    expect(channel?.title.length).toBeGreaterThan(0);
    expect(channel?.subscriberCount).toBeGreaterThanOrEqual(0);
    expect(channel?.viewCount).toBeGreaterThanOrEqual(0);
    resolvedChannelId = channel?.id ?? null;
  });

  it("fetches the channel again by id and gets a consistent shape", async () => {
    expect(resolvedChannelId, "run the handle resolution test first").not.toBeNull();
    const byId = await getChannelById(YT_KEY, resolvedChannelId!);
    expect(byId?.id).toBe(resolvedChannelId);
  });

  it("fetches the latest videos with valid shape", async () => {
    expect(resolvedChannelId).not.toBeNull();
    const videos = await getChannelVideos(YT_KEY, resolvedChannelId!, 5);
    expect(videos.length).toBeGreaterThan(0);

    for (const video of videos) {
      expect(video.id.length).toBeGreaterThan(0);
      expect(video.title.length).toBeGreaterThan(0);
      expect(video.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(typeof video.viewCount).toBe("number");
      expect(Number.isFinite(video.viewCount)).toBe(true);
    }

    resolvedVideos = videos;
  });
});

describe.runIf(haveBoth)("live · Gemini · analyze @LearnwithManoj", () => {
  it("returns a schema-conforming analysis payload", async () => {
    expect(resolvedChannelId).not.toBeNull();
    expect(resolvedVideos.length).toBeGreaterThan(0);

    const summary = summarizeVideos(resolvedVideos.slice(0, 10));
    const prompt = buildAnalyzePrompt(resolvedChannelId!, summary);

    const client = getGeminiClient(GEMINI_KEY);
    const stream = await client.models.generateContentStream({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: ANALYZE_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    let text = "";
    for await (const chunk of stream) {
      if (chunk.text) text += chunk.text;
    }

    expect(text.length, "Gemini returned no text").toBeGreaterThan(0);
    const parsed = JSON.parse(text);
    assertAnalyzeResponse(parsed);
  });
});

describe.runIf(haveBoth)("live · Gemini · thumbnail analysis", () => {
  it("returns a schema-conforming thumbnail analysis", async () => {
    const video = resolvedVideos.find((entry) => entry.thumbnailUrl);
    expect(video, "need at least one video with a thumbnail").toBeTruthy();
    if (!video?.thumbnailUrl) return;

    const imgResponse = await fetch(video.thumbnailUrl);
    expect(imgResponse.ok).toBe(true);
    const contentType = (imgResponse.headers.get("content-type") ?? "image/jpeg")
      .split(";")[0]
      .trim()
      .toLowerCase();
    expect(SUPPORTED_IMAGE_TYPES.has(contentType)).toBe(true);
    const base64 = Buffer.from(await imgResponse.arrayBuffer()).toString("base64");

    const client = getGeminiClient(GEMINI_KEY);
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: contentType, data: base64 } },
            { text: buildThumbnailPrompt(video.id, video.title) },
          ],
        },
      ],
      config: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: THUMBNAIL_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const raw = extractResponseText(response);
    if (!raw) {
      throw new Error(
        `Gemini returned empty text; debug=${JSON.stringify(extractDebugInfo(response))}`
      );
    }

    const parsed = JSON.parse(raw);
    assertThumbnailAnalysis(parsed);
  });
});
