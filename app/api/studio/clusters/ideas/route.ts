import { NextResponse } from "next/server";
import { getGeminiApiKey } from "@/lib/apiKey";
import {
  buildClusterIdeasPrompt,
  CLUSTER_IDEAS_LIMITS,
  CLUSTER_IDEAS_SCHEMA,
  ClusterIdeasResponse,
} from "@/lib/clusterIdeasPrompt";
import {
  extractDebugInfo,
  extractResponseText,
  GEMINI_MODEL,
  getGeminiClient,
} from "@/lib/gemini";
import { reportError } from "@/lib/telemetry";

const MISSING_GEMINI_KEY_MESSAGE =
  "Add your Gemini API key in the API Keys panel to ideate for clusters.";

interface RequestBody {
  label?: string;
  sampleTitles?: unknown;
  medianViews?: number;
  channelContext?: string;
  ideaCount?: number;
}

function validate(body: RequestBody): string | null {
  const label = body.label?.trim();
  if (!label) return "label is required";
  if (label.length > CLUSTER_IDEAS_LIMITS.maxLabelLength) return "label is too long";
  if (!Array.isArray(body.sampleTitles)) return "sampleTitles must be an array";
  if (body.sampleTitles.length === 0) return "sampleTitles must not be empty";
  if (body.sampleTitles.some((t) => typeof t !== "string")) return "sampleTitles must be strings";
  if (typeof body.medianViews !== "number" || body.medianViews < 0)
    return "medianViews must be a non-negative number";
  const cc = body.channelContext?.trim();
  if (cc && cc.length > CLUSTER_IDEAS_LIMITS.maxChannelContextLength)
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

  const prompt = buildClusterIdeasPrompt({
    label: body.label!.trim(),
    sampleTitles: (body.sampleTitles as string[])
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, CLUSTER_IDEAS_LIMITS.maxTitles),
    medianViews: body.medianViews!,
    channelContext: body.channelContext?.trim() || undefined,
    ideaCount: body.ideaCount,
  });

  const client = getGeminiClient(geminiKey);
  let response;
  try {
    response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.6,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: CLUSTER_IDEAS_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
  } catch (error) {
    void reportError(error, { route: "/api/studio/clusters/ideas" });
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
    const parsed = JSON.parse(rawText) as ClusterIdeasResponse;
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(
      { error: "Gemini did not return valid JSON", raw: rawText, debug },
      { status: 502 }
    );
  }
}
