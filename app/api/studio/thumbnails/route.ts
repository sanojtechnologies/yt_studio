import { NextResponse } from "next/server";
import { getGeminiApiKey } from "@/lib/apiKey";
import { getGeminiClient } from "@/lib/gemini";
import { reportError } from "@/lib/telemetry";
import {
  buildThumbnailGenPrompt,
  THUMBNAIL_GEN_LIMITS,
} from "@/lib/thumbnailGenPrompt";

const MISSING_GEMINI_KEY_MESSAGE =
  "Add your Gemini API key in the API Keys panel to generate thumbnails.";

const IMAGE_MODEL = "gemini-2.5-flash-image-preview";

interface RequestBody {
  prompt?: string;
  channelStyle?: string;
  styleHint?: string;
  variantCount?: number;
}

interface InlinePart {
  inlineData?: { data?: string; mimeType?: string };
  text?: string;
}

interface CandidateLike {
  content?: { parts?: InlinePart[] };
}

interface ImageResponseShape {
  candidates?: CandidateLike[];
}

function extractImages(response: ImageResponseShape): Array<{ dataUrl: string; mimeType: string }> {
  const out: Array<{ dataUrl: string; mimeType: string }> = [];
  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const data = part.inlineData?.data;
      const mimeType = part.inlineData?.mimeType ?? "image/png";
      if (data) {
        out.push({ dataUrl: `data:${mimeType};base64,${data}`, mimeType });
      }
    }
  }
  return out;
}

export async function POST(request: Request) {
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

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (prompt.length > THUMBNAIL_GEN_LIMITS.maxPromptLength) {
    return NextResponse.json(
      {
        error: `prompt must be ${THUMBNAIL_GEN_LIMITS.maxPromptLength} characters or fewer`,
      },
      { status: 400 }
    );
  }

  const variantCount = Math.max(
    1,
    Math.min(THUMBNAIL_GEN_LIMITS.variantCount, body.variantCount ?? THUMBNAIL_GEN_LIMITS.variantCount)
  );

  const client = getGeminiClient(geminiKey);
  const composedPrompt = buildThumbnailGenPrompt({
    prompt,
    channelStyle: body.channelStyle?.trim(),
    styleHint: body.styleHint?.trim(),
  });

  const variants: Array<{ dataUrl: string; mimeType: string }> = [];
  for (let i = 0; i < variantCount; i++) {
    try {
      const response = (await client.models.generateContent({
        model: IMAGE_MODEL,
        contents: composedPrompt,
      })) as unknown as ImageResponseShape;
      variants.push(...extractImages(response));
    } catch (error) {
      void reportError(error, { route: "/api/studio/thumbnails", variant: i });
      return NextResponse.json(
        { error: "Image generation failed", variant: i },
        { status: 502 }
      );
    }
  }

  if (variants.length === 0) {
    return NextResponse.json(
      { error: "Image model returned no inline image data" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    variants: variants.slice(0, variantCount),
    promptUsed: composedPrompt,
  });
}
