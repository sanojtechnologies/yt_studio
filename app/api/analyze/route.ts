import { NextResponse } from "next/server";
import { getGeminiApiKey, getYouTubeApiKey } from "@/lib/apiKey";
import {
  ANALYZE_SCHEMA,
  buildAnalyzePrompt,
  summarizeVideos,
} from "@/lib/analyzePrompt";
import {
  YOUTUBE_INVALID_API_KEY_MESSAGE,
  YOUTUBE_QUOTA_EXCEEDED_MESSAGE,
  YouTubeInvalidApiKeyError,
  YouTubeQuotaExceededError,
} from "@/lib/errors";
import { GEMINI_MODEL, getGeminiClient } from "@/lib/gemini";
import { reportError } from "@/lib/telemetry";
import { getChannelVideos } from "@/lib/youtube";

const MISSING_YT_KEY_MESSAGE =
  "Add your YouTube Data API v3 key in the API Keys panel to run analysis.";
const MISSING_GEMINI_KEY_MESSAGE =
  "Add your Gemini API key in the API Keys panel to run analysis.";

interface AnalyzeBody {
  channelId?: string;
}

export async function POST(request: Request) {
  const youtubeKey = getYouTubeApiKey();
  const geminiKey = getGeminiApiKey();
  if (!youtubeKey) {
    return NextResponse.json({ error: MISSING_YT_KEY_MESSAGE }, { status: 401 });
  }
  if (!geminiKey) {
    return NextResponse.json({ error: MISSING_GEMINI_KEY_MESSAGE }, { status: 401 });
  }

  let body: AnalyzeBody;
  try {
    body = (await request.json()) as AnalyzeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const channelId = body.channelId?.trim();
  if (!channelId) {
    return NextResponse.json({ error: "channelId is required" }, { status: 400 });
  }

  let videos;
  try {
    videos = await getChannelVideos(youtubeKey, channelId, 20);
  } catch (error) {
    if (error instanceof YouTubeQuotaExceededError) {
      return NextResponse.json({ error: YOUTUBE_QUOTA_EXCEEDED_MESSAGE }, { status: 429 });
    }
    if (error instanceof YouTubeInvalidApiKeyError) {
      return NextResponse.json({ error: YOUTUBE_INVALID_API_KEY_MESSAGE }, { status: 400 });
    }
    void reportError(error, { route: "/api/analyze", channelId });
    return NextResponse.json({ error: "Failed to fetch videos for analysis" }, { status: 500 });
  }

  const summary = summarizeVideos(videos);

  const client = getGeminiClient(geminiKey);
  const stream = await client.models.generateContentStream({
    model: GEMINI_MODEL,
    contents: buildAnalyzePrompt(channelId, summary),
    config: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: ANALYZE_SCHEMA,
      // Disable "thinking" so the entire output budget is spent on the JSON payload.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        encoder.encode(JSON.stringify({ type: "meta", channelId }) + "\n")
      );

      let finalText = "";
      try {
        for await (const chunk of stream) {
          const text = chunk.text;
          if (!text) continue;
          finalText += text;
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "chunk", text }) + "\n")
          );
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(finalText);
        } catch {
          parsed = { raw: finalText };
        }

        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "final", data: parsed }) + "\n")
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Analysis failed";
        void reportError(error, { route: "/api/analyze", phase: "stream", channelId });
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "error", error: message }) + "\n")
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
