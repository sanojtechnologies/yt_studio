import { NextResponse } from "next/server";
import { getGeminiApiKey, getYouTubeApiKey } from "@/lib/apiKey";
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
import {
  buildTitleLabPrompt,
  pickTopPerformers,
  TITLE_LAB_LIMITS,
  TITLE_LAB_SCHEMA,
  TitleLabResponse,
} from "@/lib/titleLabPrompt";
import { getChannelVideos } from "@/lib/youtube";

const MISSING_YT_KEY_MESSAGE =
  "Add your YouTube Data API v3 key in the API Keys panel to generate titles.";
const MISSING_GEMINI_KEY_MESSAGE =
  "Add your Gemini API key in the API Keys panel to generate titles.";

interface RequestBody {
  channelId?: string;
  topic?: string;
  audience?: string;
  desiredTone?: string;
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

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const channelId = body.channelId?.trim();
  const topic = body.topic?.trim();
  if (!channelId) {
    return NextResponse.json({ error: "channelId is required" }, { status: 400 });
  }
  if (!topic) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }
  if (topic.length > TITLE_LAB_LIMITS.maxTopicLength) {
    return NextResponse.json(
      { error: `topic must be ${TITLE_LAB_LIMITS.maxTopicLength} characters or fewer` },
      { status: 400 }
    );
  }

  let videos;
  try {
    videos = await getChannelVideos(youtubeKey, channelId, 50);
  } catch (error) {
    if (error instanceof YouTubeQuotaExceededError) {
      return NextResponse.json({ error: YOUTUBE_QUOTA_EXCEEDED_MESSAGE }, { status: 429 });
    }
    if (error instanceof YouTubeInvalidApiKeyError) {
      return NextResponse.json({ error: YOUTUBE_INVALID_API_KEY_MESSAGE }, { status: 400 });
    }
    void reportError(error, { route: "/api/studio/titles", channelId });
    return NextResponse.json(
      { error: "Failed to load channel videos for title generation" },
      { status: 500 }
    );
  }

  const topPerformers = pickTopPerformers(videos);
  const prompt = buildTitleLabPrompt({
    topic,
    audience: body.audience?.trim(),
    desiredTone: body.desiredTone?.trim(),
    topPerformers,
  });

  const client = getGeminiClient(geminiKey);
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: TITLE_LAB_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const rawText = extractResponseText(response);
  const debug = extractDebugInfo(response);

  if (!rawText) {
    return NextResponse.json(
      { error: "Gemini returned an empty response", debug },
      { status: 502 }
    );
  }

  try {
    const parsed = JSON.parse(rawText) as TitleLabResponse;
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(
      { error: "Gemini did not return valid JSON", raw: rawText, debug },
      { status: 502 }
    );
  }
}
