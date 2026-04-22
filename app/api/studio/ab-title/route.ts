import { NextResponse } from "next/server";
import {
  AB_TITLE_LIMITS,
  AB_TITLE_SCHEMA,
  AbTitleResponse,
  buildAbTitlePrompt,
} from "@/lib/abTitlePrompt";
import { getGeminiApiKey } from "@/lib/apiKey";
import {
  extractDebugInfo,
  extractResponseText,
  GEMINI_MODEL,
  getGeminiClient,
} from "@/lib/gemini";

const MISSING_GEMINI_KEY_MESSAGE =
  "Add your Gemini API key in the API Keys panel to score titles.";

interface RequestBody {
  titleA?: string;
  titleB?: string;
  channelContext?: string;
  audience?: string;
}

function validate(body: RequestBody): string | null {
  const titleA = body.titleA?.trim();
  const titleB = body.titleB?.trim();
  if (!titleA) return "titleA is required";
  if (!titleB) return "titleB is required";
  if (titleA.length > AB_TITLE_LIMITS.maxTitleLength) return "titleA is too long";
  if (titleB.length > AB_TITLE_LIMITS.maxTitleLength) return "titleB is too long";
  if (titleA === titleB) return "titleA and titleB must differ";
  const audience = body.audience?.trim();
  if (audience && audience.length > AB_TITLE_LIMITS.maxAudienceLength) return "audience is too long";
  const channelContext = body.channelContext?.trim();
  if (channelContext && channelContext.length > AB_TITLE_LIMITS.maxChannelContextLength)
    return "channelContext is too long";
  return null;
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

  const validationError = validate(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const prompt = buildAbTitlePrompt({
    titleA: body.titleA!.trim(),
    titleB: body.titleB!.trim(),
    audience: body.audience?.trim(),
    channelContext: body.channelContext?.trim(),
  });

  const client = getGeminiClient(geminiKey);
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0.2,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      responseSchema: AB_TITLE_SCHEMA,
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
    const parsed = JSON.parse(rawText) as AbTitleResponse;
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(
      { error: "Gemini did not return valid JSON", raw: rawText, debug },
      { status: 502 }
    );
  }
}
