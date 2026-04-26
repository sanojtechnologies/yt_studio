import { NextResponse } from "next/server";
import { getGeminiApiKey, getYouTubeApiKey } from "@/lib/apiKey";
import { reportError } from "@/lib/telemetry";
import {
  buildVideoIdeateEvidence,
  fetchVideosForIdeation,
} from "@/lib/videoIdeate";
import {
  buildVideoIdeatePrompt,
  normalizeSeedKeywords,
  VIDEO_IDEATE_LIMITS,
  VIDEO_IDEATE_SCHEMA,
  VideoIdeateResponse,
  clampIdeaCount,
} from "@/lib/videoIdeatePrompt";
import {
  extractDebugInfo,
  extractResponseText,
  GEMINI_MODEL,
  getGeminiClient,
} from "@/lib/gemini";

const MISSING_YOUTUBE_KEY_MESSAGE =
  "Add your YouTube API key in the API Keys panel to generate data-grounded ideas.";
const MISSING_GEMINI_KEY_MESSAGE =
  "Add your Gemini API key in the API Keys panel to generate data-grounded ideas.";

interface RequestBody {
  keywords?: unknown;
  ideaCount?: number;
}

function validateBody(body: RequestBody): { keywords: string[]; ideaCount: number } | string {
  const keywords = normalizeSeedKeywords(body.keywords);
  if (keywords.length === 0) return "keywords must include at least one seed term";
  return { keywords, ideaCount: clampIdeaCount(body.ideaCount) };
}

export async function POST(request: Request) {
  const ytKey = getYouTubeApiKey();
  if (!ytKey) {
    return NextResponse.json({ error: MISSING_YOUTUBE_KEY_MESSAGE }, { status: 401 });
  }
  const geminiKey = getGeminiApiKey();
  if (!geminiKey) {
    return NextResponse.json({ error: MISSING_GEMINI_KEY_MESSAGE }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const validated = validateBody(body);
  if (typeof validated === "string") {
    return NextResponse.json({ error: validated }, { status: 400 });
  }

  let videos;
  try {
    videos = await fetchVideosForIdeation({
      apiKey: ytKey,
      keywords: validated.keywords,
      windowDays: 30,
      maxVideosPerKeyword: 25,
    });
  } catch (error) {
    void reportError(error, { route: "/api/studio/ideate" });
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "YouTube fetch failed" }, { status: 502 });
  }

  const evidence = buildVideoIdeateEvidence({
    keywords: validated.keywords,
    videos,
    windowDays: 30,
  });

  const prompt = buildVideoIdeatePrompt({
    keywords: validated.keywords,
    ideaCount: validated.ideaCount,
    evidence,
  });

  const client = getGeminiClient(geminiKey);
  let response;
  try {
    response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.5,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseSchema: VIDEO_IDEATE_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
  } catch (error) {
    void reportError(error, { route: "/api/studio/ideate" });
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
    const parsed = JSON.parse(rawText) as VideoIdeateResponse;
    return NextResponse.json({ ...parsed, evidence });
  } catch {
    return NextResponse.json(
      { error: "Gemini did not return valid JSON", raw: rawText, debug },
      { status: 502 }
    );
  }
}
