import { NextResponse } from "next/server";
import {
  AB_THUMBNAIL_SCHEMA,
  AbThumbnailResponse,
  buildAbThumbnailPrompt,
  decodeUploadedImage,
  FetchedImage,
  fetchImageFromUrl,
} from "@/lib/abThumbnailPrompt";
import { getGeminiApiKey } from "@/lib/apiKey";
import {
  extractDebugInfo,
  extractResponseText,
  GEMINI_MODEL,
  getGeminiClient,
} from "@/lib/gemini";
import { reportError } from "@/lib/telemetry";

const MISSING_GEMINI_KEY_MESSAGE =
  "Add your Gemini API key in the API Keys panel to compare thumbnails.";

function optionalTrim(raw: FormDataEntryValue | string | undefined | null): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function readMultipart(request: Request) {
  const form = await request.formData();
  const a = form.get("imageA");
  const b = form.get("imageB");
  if (!(a instanceof File) || !(b instanceof File)) {
    return { error: "imageA and imageB file parts are required" };
  }
  try {
    const [imgA, imgB] = await Promise.all([decodeUploadedImage(a), decodeUploadedImage(b)]);
    return {
      images: [imgA, imgB] as [FetchedImage, FetchedImage],
      title: optionalTrim(form.get("title")),
    };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

async function readJson(request: Request) {
  let body: { imageUrlA?: string; imageUrlB?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return { error: "Invalid JSON body" };
  }
  const { imageUrlA, imageUrlB } = body;
  if (!imageUrlA || !imageUrlB) {
    return { error: "imageUrlA and imageUrlB are required" };
  }
  try {
    const [imgA, imgB] = await Promise.all([
      fetchImageFromUrl(imageUrlA),
      fetchImageFromUrl(imageUrlB),
    ]);
    return {
      images: [imgA, imgB] as [FetchedImage, FetchedImage],
      title: optionalTrim(body.title),
    };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

async function readImages(
  request: Request
): Promise<{ images: [FetchedImage, FetchedImage]; title?: string } | { error: string }> {
  const contentType = request.headers.get("content-type");
  if (contentType?.includes("multipart/form-data")) return readMultipart(request);
  if (contentType?.includes("application/json")) return readJson(request);
  return { error: "Use multipart/form-data with imageA/imageB or JSON with imageUrlA/imageUrlB" };
}

export async function POST(request: Request) {
  const geminiKey = getGeminiApiKey();
  if (!geminiKey) {
    return NextResponse.json({ error: MISSING_GEMINI_KEY_MESSAGE }, { status: 401 });
  }

  const parsed = await readImages(request);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const [imgA, imgB] = parsed.images;
  const client = getGeminiClient(geminiKey);
  let response;
  try {
    response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: imgA.mimeType, data: imgA.base64 } },
            { inlineData: { mimeType: imgB.mimeType, data: imgB.base64 } },
            { text: buildAbThumbnailPrompt(parsed.title) },
          ],
        },
      ],
      config: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        responseSchema: AB_THUMBNAIL_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
  } catch (error) {
    void reportError(error, { route: "/api/studio/ab-thumbnail" });
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
    const parsedJson = JSON.parse(rawText) as AbThumbnailResponse;
    return NextResponse.json(parsedJson);
  } catch {
    return NextResponse.json(
      { error: "Gemini did not return valid JSON", raw: rawText, debug },
      { status: 502 }
    );
  }
}
