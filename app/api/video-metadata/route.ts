import { NextResponse } from "next/server";
import { getGeminiApiKey } from "@/lib/apiKey";
import {
  extractDebugInfo,
  extractResponseText,
  GEMINI_MODEL,
  getGeminiClient,
} from "@/lib/gemini";
import {
  buildMetadataPrompt,
  MetadataAnalysis,
  METADATA_LIMITS,
  METADATA_SCHEMA,
  normaliseTags,
} from "@/lib/metadataPrompt";

const MISSING_GEMINI_KEY_MESSAGE =
  "Add your Gemini API key in the API Keys panel to analyze video metadata.";

interface MetadataBody {
  videoId?: string;
  title?: string;
  description?: string;
  tags?: string[];
}

export async function POST(request: Request) {
  const geminiKey = getGeminiApiKey();
  if (!geminiKey) {
    return NextResponse.json({ error: MISSING_GEMINI_KEY_MESSAGE }, { status: 401 });
  }

  let body: MetadataBody;
  try {
    body = (await request.json()) as MetadataBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const videoId = body.videoId?.trim();
  const title = body.title?.trim();
  // Description is allowed to be empty — many Shorts ship without one —
  // but we still require the field to be present so the request shape is
  // unambiguous. Clamp to the configured ceiling before sending to Gemini
  // so an accidental paste doesn't blow the context window.
  const rawDescription = typeof body.description === "string" ? body.description.trim() : null;

  if (!videoId || !title || rawDescription === null) {
    return NextResponse.json(
      { error: "videoId, title, and description are required" },
      { status: 400 }
    );
  }

  if (title.length > METADATA_LIMITS.maxTitleLength) {
    return NextResponse.json(
      { error: `title exceeds maximum length of ${METADATA_LIMITS.maxTitleLength} characters` },
      { status: 400 }
    );
  }

  const description = rawDescription.slice(0, METADATA_LIMITS.maxDescriptionLength);
  const tags = normaliseTags(body.tags);

  const client = getGeminiClient(geminiKey);
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: buildMetadataPrompt({ videoId, title, description, tags }) }],
      },
    ],
    config: {
      temperature: 0.3,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: METADATA_SCHEMA,
      // Match other structured-JSON routes: thinking tokens can swallow the
      // full output budget on deterministic extraction tasks.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const rawText = extractResponseText(response);
  const debug = extractDebugInfo(response);

  if (!rawText) {
    console.warn("[video-metadata] empty Gemini response", debug);
    return NextResponse.json(
      { error: "Gemini returned an empty response", debug },
      { status: 502 }
    );
  }

  try {
    const parsed = JSON.parse(rawText) as MetadataAnalysis;
    return NextResponse.json(parsed);
  } catch {
    console.warn("[video-metadata] unparseable Gemini response", { debug, rawText });
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
