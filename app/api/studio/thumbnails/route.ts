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
const DEFAULT_THUMBNAIL_IMAGE_MODEL = "gemini-3.1-flash-image-preview";

/**
 * Default to Nano Banana 2 for out-of-the-box behavior. Deployments can
 * override with THUMBNAIL_IMAGE_MODEL without code changes.
 */
const IMAGE_MODEL = process.env.THUMBNAIL_IMAGE_MODEL?.trim() || DEFAULT_THUMBNAIL_IMAGE_MODEL;

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
  generatedImages?: Array<{ image?: { imageBytes?: string; mimeType?: string } }>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  if (isRecord(error)) {
    const nested =
      getMaybeString(error, "message") ??
      (isRecord(error.error) ? getMaybeString(error.error, "message") : undefined);
    if (nested && nested.trim()) return nested.trim();
    try {
      return JSON.stringify(error);
    } catch {
      // fall through
    }
  }
  return "Unknown error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getMaybeString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function extractImages(response: ImageResponseShape): Array<{ dataUrl: string; mimeType: string }> {
  const out: Array<{ dataUrl: string; mimeType: string }> = [];
  for (const generated of response.generatedImages ?? []) {
    const data = generated.image?.imageBytes;
    const mimeType = generated.image?.mimeType ?? "image/png";
    if (data) {
      out.push({ dataUrl: `data:${mimeType};base64,${data}`, mimeType });
    }
  }
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

function isGeminiImageModel(model: string): boolean {
  return model.startsWith("gemini-");
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
      const response = isGeminiImageModel(IMAGE_MODEL)
        ? ((await client.models.generateContent({
            model: IMAGE_MODEL,
            contents: composedPrompt,
            config: {
              responseModalities: ["TEXT", "IMAGE"],
              thinkingConfig: { thinkingBudget: 0 },
            },
          })) as unknown as ImageResponseShape)
        : ((await client.models.generateImages({
            model: IMAGE_MODEL,
            prompt: composedPrompt,
            config: { numberOfImages: 1 },
          })) as unknown as ImageResponseShape);
      variants.push(...extractImages(response));
    } catch (error) {
      void reportError(error, {
        route: "/api/studio/thumbnails",
        variant: i,
        model: IMAGE_MODEL,
      });
      return NextResponse.json(
        {
          error: "Image generation failed",
          detail: getErrorMessage(error),
          variant: i,
        },
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
    modelUsed: IMAGE_MODEL,
  });
}
