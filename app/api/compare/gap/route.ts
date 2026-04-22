import { NextResponse } from "next/server";
import { getGeminiApiKey, getYouTubeApiKey } from "@/lib/apiKey";
import {
  buildCompareGapPrompt,
  COMPARE_GAP_LIMITS,
  COMPARE_GAP_SCHEMA,
  CompareGapResponse,
  selectGapChannels,
} from "@/lib/compareGapPrompt";
import { buildComparisonRow, parseCompareIds } from "@/lib/compareStats";
import {
  YOUTUBE_INVALID_API_KEY_MESSAGE,
  YOUTUBE_QUOTA_EXCEEDED_MESSAGE,
  YouTubeInvalidApiKeyError,
  YouTubeQuotaExceededError,
} from "@/lib/errors";
import {
  extractDebugInfo,
  extractResponseText,
  GEMINI_MODEL,
  getGeminiClient,
} from "@/lib/gemini";
import { reportError } from "@/lib/telemetry";
import { getChannelById, getChannelVideos } from "@/lib/youtube";

const MISSING_YT_KEY_MESSAGE =
  "Add your YouTube Data API v3 key in the API Keys panel to compare channels.";
const MISSING_GEMINI_KEY_MESSAGE =
  "Add your Gemini API key in the API Keys panel to run gap analysis.";

export async function GET(request: Request) {
  const youtubeKey = getYouTubeApiKey();
  if (!youtubeKey) {
    return NextResponse.json({ error: MISSING_YT_KEY_MESSAGE }, { status: 401 });
  }
  const geminiKey = getGeminiApiKey();
  if (!geminiKey) {
    return NextResponse.json({ error: MISSING_GEMINI_KEY_MESSAGE }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ids = parseCompareIds(searchParams.get("ids"));
  const focusRaw = searchParams.get("focus")?.trim();
  if (focusRaw && focusRaw.length > COMPARE_GAP_LIMITS.maxFocusLength) {
    return NextResponse.json({ error: "focus is too long" }, { status: 400 });
  }

  if (ids.length < COMPARE_GAP_LIMITS.minChannels) {
    return NextResponse.json(
      {
        error: `Provide at least ${COMPARE_GAP_LIMITS.minChannels} channel ids (max ${COMPARE_GAP_LIMITS.maxChannels}).`,
      },
      { status: 400 }
    );
  }

  let rows;
  try {
    const settled = await Promise.all(
      ids.map(async (id) => {
        const [channel, videos] = await Promise.all([
          getChannelById(youtubeKey, id),
          getChannelVideos(youtubeKey, id, 50),
        ]);
        if (!channel) return null;
        return buildComparisonRow(channel, videos);
      })
    );
    rows = settled.filter((row): row is NonNullable<typeof row> => row !== null);
  } catch (error) {
    if (error instanceof YouTubeQuotaExceededError) {
      return NextResponse.json({ error: YOUTUBE_QUOTA_EXCEEDED_MESSAGE }, { status: 429 });
    }
    if (error instanceof YouTubeInvalidApiKeyError) {
      return NextResponse.json({ error: YOUTUBE_INVALID_API_KEY_MESSAGE }, { status: 400 });
    }
    void reportError(error, { route: "/api/compare/gap", ids });
    return NextResponse.json({ error: "Failed to load channel comparison." }, { status: 500 });
  }

  if (rows.length < COMPARE_GAP_LIMITS.minChannels) {
    return NextResponse.json(
      { error: "Could not resolve enough channels for gap analysis." },
      { status: 404 }
    );
  }

  const prompt = buildCompareGapPrompt({
    channels: selectGapChannels(rows),
    focus: focusRaw || undefined,
  });

  const client = getGeminiClient(geminiKey);
  let response;
  try {
    response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: COMPARE_GAP_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
  } catch (error) {
    void reportError(error, { route: "/api/compare/gap" });
    return NextResponse.json({ error: "Gemini call failed" }, { status: 502 });
  }

  const rawText = extractResponseText(response);
  const debug = extractDebugInfo(response);
  if (!rawText) {
    return NextResponse.json(
      { error: "Gemini returned an empty response", debug },
      { status: 502 }
    );
  }

  try {
    const parsed = JSON.parse(rawText) as CompareGapResponse;
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(
      { error: "Gemini did not return valid JSON", raw: rawText, debug },
      { status: 502 }
    );
  }
}
