import { NextResponse } from "next/server";
import { getYouTubeApiKey } from "@/lib/apiKey";
import { parseChannelInput } from "@/lib/channelResolver";
import {
  YOUTUBE_INVALID_API_KEY_MESSAGE,
  YOUTUBE_QUOTA_EXCEEDED_MESSAGE,
  YouTubeInvalidApiKeyError,
  YouTubeQuotaExceededError,
} from "@/lib/errors";
import { reportError } from "@/lib/telemetry";
import { getChannelByHandle, getChannelById } from "@/lib/youtube";

const MISSING_KEY_MESSAGE =
  "Add your YouTube Data API v3 key in the API Keys panel to continue.";

async function resolveChannelIdFromHandlePage(handle: string): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const html = await response.text();
  const channelIdMatch =
    html.match(/"channelId":"(UC[\w-]+)"/) ??
    html.match(/https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)/);

  return channelIdMatch?.[1] ?? null;
}

export async function GET(request: Request) {
  const apiKey = getYouTubeApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: MISSING_KEY_MESSAGE }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const { channelId, handle } = parseChannelInput(q);

  if (!channelId && !handle) {
    return NextResponse.json({ error: "Invalid channel input" }, { status: 400 });
  }

  let channel;
  try {
    if (channelId) {
      channel = await getChannelById(apiKey, channelId);
    } else {
      const resolvedChannelId = await resolveChannelIdFromHandlePage(handle!);
      channel = resolvedChannelId
        ? await getChannelById(apiKey, resolvedChannelId)
        : await getChannelByHandle(apiKey, handle!);
    }
  } catch (error) {
    if (error instanceof YouTubeQuotaExceededError) {
      return NextResponse.json({ error: YOUTUBE_QUOTA_EXCEEDED_MESSAGE }, { status: 429 });
    }
    if (error instanceof YouTubeInvalidApiKeyError) {
      return NextResponse.json({ error: YOUTUBE_INVALID_API_KEY_MESSAGE }, { status: 400 });
    }
    void reportError(error, { route: "/api/channel", q });
    return NextResponse.json({ error: "Failed to resolve channel" }, { status: 500 });
  }

  if (!channel?.id) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  return NextResponse.json({ channelId: channel.id, channel });
}
