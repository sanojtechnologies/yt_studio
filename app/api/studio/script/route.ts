import { NextResponse } from "next/server";
import { getGeminiApiKey } from "@/lib/apiKey";
import { GEMINI_MODEL, getGeminiClient } from "@/lib/gemini";
import {
  buildScriptPrompt,
  SCRIPT_LIMITS,
  SCRIPT_SCHEMA,
} from "@/lib/scriptPrompt";
import { reportError } from "@/lib/telemetry";

const MISSING_GEMINI_KEY_MESSAGE =
  "Add your Gemini API key in the API Keys panel to generate scripts.";
const INVALID_DURATION_MESSAGE = `targetMinutes must be an integer between ${SCRIPT_LIMITS.minTargetMinutes} and ${SCRIPT_LIMITS.maxTargetMinutes}`;

interface ScriptBody {
  title?: string;
  targetMinutes?: number;
  audience?: string;
  channelContext?: string;
}

export async function POST(request: Request) {
  const geminiKey = getGeminiApiKey();
  if (!geminiKey) {
    return NextResponse.json({ error: MISSING_GEMINI_KEY_MESSAGE }, { status: 401 });
  }

  let body: ScriptBody;
  try {
    body = (await request.json()) as ScriptBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (title.length > SCRIPT_LIMITS.maxTitleLength) {
    return NextResponse.json(
      { error: `title must be ${SCRIPT_LIMITS.maxTitleLength} characters or fewer` },
      { status: 400 }
    );
  }

  const targetMinutes = body.targetMinutes;
  if (
    typeof targetMinutes !== "number" ||
    !Number.isFinite(targetMinutes) ||
    !Number.isInteger(targetMinutes) ||
    targetMinutes < SCRIPT_LIMITS.minTargetMinutes ||
    targetMinutes > SCRIPT_LIMITS.maxTargetMinutes
  ) {
    return NextResponse.json({ error: INVALID_DURATION_MESSAGE }, { status: 400 });
  }

  const audience = body.audience?.trim();
  if (audience && audience.length > SCRIPT_LIMITS.maxAudienceLength) {
    return NextResponse.json({ error: "audience is too long" }, { status: 400 });
  }

  const channelContext = body.channelContext?.trim();
  if (channelContext && channelContext.length > SCRIPT_LIMITS.maxChannelContextLength) {
    return NextResponse.json({ error: "channelContext is too long" }, { status: 400 });
  }

  const prompt = buildScriptPrompt({ title, targetMinutes, audience, channelContext });
  const client = getGeminiClient(geminiKey);
  const stream = await client.models.generateContentStream({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0.5,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: SCRIPT_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        encoder.encode(JSON.stringify({ type: "meta", title, targetMinutes }) + "\n")
      );
      let finalText = "";
      try {
        for await (const chunk of stream) {
          const text = chunk.text;
          if (!text) continue;
          finalText += text;
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "chunk", text }) + "\n")
          );
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(finalText);
        } catch {
          parsed = { raw: finalText };
        }
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "final", data: parsed }) + "\n")
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Script generation failed";
        void reportError(error, { route: "/api/studio/script", phase: "stream" });
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "error", error: message }) + "\n")
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
