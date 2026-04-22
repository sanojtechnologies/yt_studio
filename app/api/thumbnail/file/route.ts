import { NextResponse } from "next/server";
import { getGeminiApiKey } from "@/lib/apiKey";
import {
  extractDebugInfo,
  extractResponseText,
  GEMINI_MODEL,
  getGeminiClient,
} from "@/lib/gemini";
import {
  buildThumbnailPrompt,
  SUPPORTED_IMAGE_TYPES,
  ThumbnailAnalysis,
  THUMBNAIL_SCHEMA,
} from "@/lib/thumbnailPrompt";

const MISSING_GEMINI_KEY_MESSAGE =
  "Add your Gemini API key in the API Keys panel to analyze thumbnails.";

interface ThumbnailFileBody {
  videoId?: string;
  title?: string;
  mimeType?: string;
  imageBase64?: string;
}

export async function POST(request: Request) {
  const geminiKey = getGeminiApiKey();
  if (!geminiKey) {
    return NextResponse.json({ error: MISSING_GEMINI_KEY_MESSAGE }, { status: 401 });
  }

  let body: ThumbnailFileBody;
  try {
    body = (await request.json()) as ThumbnailFileBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const videoId = body.videoId?.trim();
  const title = body.title?.trim();
  const mimeType = body.mimeType?.trim().toLowerCase();
  const imageBase64 = body.imageBase64?.trim();

  if (!videoId || !title || !mimeType || !imageBase64) {
    return NextResponse.json(
      { error: "videoId, title, mimeType, and imageBase64 are required" },
      { status: 400 }
    );
  }

  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: `Unsupported image type: ${mimeType}` },
      { status: 400 }
    );
  }

  const client = getGeminiClient(geminiKey);
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: buildThumbnailPrompt(videoId, title) },
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

  const rawText = extractResponseText(response);
  const debug = extractDebugInfo(response);
  if (!rawText) {
    return NextResponse.json(
      { error: "Gemini returned an empty response", debug },
      { status: 502 }
    );
  }

  try {
    const parsed = JSON.parse(rawText) as ThumbnailAnalysis;
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(
      {
        error: "Gemini did not return valid JSON",
        raw: rawText,
        debug,
      },
      { status: 502 }
    );
  }
}
