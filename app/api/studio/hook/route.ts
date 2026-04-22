import { NextResponse } from "next/server";
import { getGeminiApiKey } from "@/lib/apiKey";
import {
  extractDebugInfo,
  extractResponseText,
  GEMINI_MODEL,
  getGeminiClient,
} from "@/lib/gemini";
import {
  buildHookPrompt,
  HOOK_LIMITS,
  HOOK_SCHEMA,
  HookResponse,
} from "@/lib/hookPrompt";

const MISSING_GEMINI_KEY_MESSAGE =
  "Add your Gemini API key in the API Keys panel to generate hooks.";

interface RequestBody {
  title?: string;
  outline?: string;
  targetLengthMinutes?: number;
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

  const title = body.title?.trim();
  const outline = body.outline?.trim();
  if (!title || !outline) {
    return NextResponse.json(
      { error: "title and outline are required" },
      { status: 400 }
    );
  }
  if (title.length > HOOK_LIMITS.maxTitleLength) {
    return NextResponse.json(
      { error: `title must be ${HOOK_LIMITS.maxTitleLength} characters or fewer` },
      { status: 400 }
    );
  }
  if (outline.length > HOOK_LIMITS.maxOutlineLength) {
    return NextResponse.json(
      { error: `outline must be ${HOOK_LIMITS.maxOutlineLength} characters or fewer` },
      { status: 400 }
    );
  }

  const targetLengthMinutes =
    typeof body.targetLengthMinutes === "number" && body.targetLengthMinutes > 0
      ? Math.min(body.targetLengthMinutes, 240)
      : undefined;

  const client = getGeminiClient(geminiKey);
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: buildHookPrompt({ title, outline, targetLengthMinutes }),
    config: {
      temperature: 0.6,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: HOOK_SCHEMA,
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
    const parsed = JSON.parse(rawText) as HookResponse;
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(
      { error: "Gemini did not return valid JSON", raw: rawText, debug },
      { status: 502 }
    );
  }
}
