import { NextResponse } from "next/server";
import { google } from "googleapis";
import { isYouTubeQuotaExceededError } from "@/lib/errors";

interface ValidateBody {
  id?: "youtube" | "gemini";
  key?: string;
}

interface ValidateResult {
  ok: boolean;
  warning?: string;
  error?: string;
}

async function validateYouTube(key: string): Promise<ValidateResult> {
  const youtube = google.youtube({ version: "v3", auth: key });
  try {
    await youtube.i18nLanguages.list({ part: ["snippet"] });
    return { ok: true };
  } catch (error) {
    if (isYouTubeQuotaExceededError(error)) {
      return {
        ok: true,
        warning:
          "Key authenticates, but the project's daily quota is currently exhausted. Lookups may fail until it resets.",
      };
    }
    return {
      ok: false,
      error:
        "YouTube rejected this key. Double-check the value and that YouTube Data API v3 is enabled.",
    };
  }
}

async function validateGemini(key: string): Promise<ValidateResult> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { cache: "no-store" }
    );
    if (response.ok) return { ok: true };
    if ([400, 401, 403].includes(response.status)) {
      return { ok: false, error: "Gemini rejected this key." };
    }
    return { ok: false, error: `Gemini responded with HTTP ${response.status}.` };
  } catch {
    return { ok: false, error: "Could not reach Gemini to validate the key." };
  }
}

export async function POST(request: Request) {
  let body: ValidateBody;
  try {
    body = (await request.json()) as ValidateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const key = body.key?.trim();
  if (!key) {
    return NextResponse.json({ ok: false, error: "Key is required" }, { status: 400 });
  }

  if (body.id === "youtube") {
    return NextResponse.json(await validateYouTube(key));
  }
  if (body.id === "gemini") {
    return NextResponse.json(await validateGemini(key));
  }

  return NextResponse.json({ ok: false, error: "Unknown key id" }, { status: 400 });
}
