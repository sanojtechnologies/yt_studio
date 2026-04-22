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
  isValidHttpUrl,
  SUPPORTED_IMAGE_TYPES,
  ThumbnailAnalysis,
  THUMBNAIL_SCHEMA,
} from "@/lib/thumbnailPrompt";

const MISSING_GEMINI_KEY_MESSAGE =
  "Add your Gemini API key in the API Keys panel to analyze thumbnails.";

interface ThumbnailAnalyzeBody {
  videoId?: string;
  thumbnailUrl?: string;
  title?: string;
}

export async function POST(request: Request) {
  const geminiKey = getGeminiApiKey();
  if (!geminiKey) {
    return NextResponse.json({ error: MISSING_GEMINI_KEY_MESSAGE }, { status: 401 });
  }

  let body: ThumbnailAnalyzeBody;
  try {
    body = (await request.json()) as ThumbnailAnalyzeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const videoId = body.videoId?.trim();
  const thumbnailUrl = body.thumbnailUrl?.trim();
  const title = body.title?.trim();

  if (!videoId || !thumbnailUrl || !title) {
    return NextResponse.json(
      { error: "videoId, thumbnailUrl, and title are required" },
      { status: 400 }
    );
  }

  if (!isValidHttpUrl(thumbnailUrl)) {
    return NextResponse.json({ error: "Invalid thumbnailUrl" }, { status: 400 });
  }

  const thumbnailResponse = await fetch(thumbnailUrl);
  if (!thumbnailResponse.ok) {
    return NextResponse.json({ error: "Failed to fetch thumbnail image" }, { status: 400 });
  }

  const rawContentType = thumbnailResponse.headers.get("content-type") ?? "image/jpeg";
  const contentType = rawContentType.split(";")[0].trim().toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: `Unsupported image type: ${contentType}` },
      { status: 400 }
    );
  }

  const imageBuffer = await thumbnailResponse.arrayBuffer();
  const imageBase64 = Buffer.from(imageBuffer).toString("base64");

  const client = getGeminiClient(geminiKey);
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: contentType, data: imageBase64 } },
          { text: buildThumbnailPrompt(videoId, title) },
        ],
      },
    ],
    config: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: THUMBNAIL_SCHEMA,
      // gemini-2.5-flash burns output tokens on internal "thinking" by default
      // which can swallow the entire budget for deterministic extraction tasks.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const rawText = extractResponseText(response);
  const debug = extractDebugInfo(response);

  if (!rawText) {
    console.warn("[thumbnail] empty Gemini response", debug);
    return NextResponse.json(
      { error: "Gemini returned an empty response", debug },
      { status: 502 }
    );
  }

  try {
    const parsed = JSON.parse(rawText) as ThumbnailAnalysis;
    return NextResponse.json(parsed);
  } catch {
    console.warn("[thumbnail] unparseable Gemini response", { debug, rawText });
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
