import { NextResponse } from "next/server";
import { getYouTubeApiKey } from "@/lib/apiKey";
import {
  buildComparisonRow,
  COMPARE_LIMITS,
  parseCompareIds,
} from "@/lib/compareStats";
import {
  YOUTUBE_INVALID_API_KEY_MESSAGE,
  YOUTUBE_QUOTA_EXCEEDED_MESSAGE,
  YouTubeInvalidApiKeyError,
  YouTubeQuotaExceededError,
} from "@/lib/errors";
import { reportError } from "@/lib/telemetry";
import { getChannelById, getChannelVideos } from "@/lib/youtube";

const MISSING_KEY_MESSAGE =
  "Add your YouTube Data API v3 key in the API Keys panel to compare channels.";

export async function GET(request: Request) {
  const apiKey = getYouTubeApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: MISSING_KEY_MESSAGE }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ids = parseCompareIds(searchParams.get("ids"));

  if (ids.length < COMPARE_LIMITS.min) {
    return NextResponse.json(
      {
        error: `Provide at least ${COMPARE_LIMITS.min} channel ids (max ${COMPARE_LIMITS.max}).`,
      },
      { status: 400 }
    );
  }

  try {
    const settled = await Promise.all(
      ids.map(async (id) => {
        const [channel, videos] = await Promise.all([
          getChannelById(apiKey, id),
          getChannelVideos(apiKey, id, 50),
        ]);
        if (!channel) return null;
        return buildComparisonRow(channel, videos);
      })
    );

    const rows = settled.filter(
      (row): row is NonNullable<typeof row> => row !== null
    );

    if (rows.length < COMPARE_LIMITS.min) {
      return NextResponse.json(
        { error: "Could not resolve enough channels to compare." },
        { status: 404 }
      );
    }

    return NextResponse.json({ rows });
  } catch (error) {
    if (error instanceof YouTubeQuotaExceededError) {
      return NextResponse.json(
        { error: YOUTUBE_QUOTA_EXCEEDED_MESSAGE },
        { status: 429 }
      );
    }
    if (error instanceof YouTubeInvalidApiKeyError) {
      return NextResponse.json(
        { error: YOUTUBE_INVALID_API_KEY_MESSAGE },
        { status: 400 }
      );
    }
    void reportError(error, { route: "/api/compare", ids });
    return NextResponse.json(
      { error: "Failed to load channel comparison." },
      { status: 500 }
    );
  }
}
