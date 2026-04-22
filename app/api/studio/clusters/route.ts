import { NextResponse } from "next/server";
import { getGeminiApiKey, getYouTubeApiKey } from "@/lib/apiKey";
import { clusterByEmbedding, EmbeddedItem, summarizeClusters } from "@/lib/cluster";
import { embedTexts } from "@/lib/embeddings";
import {
  YOUTUBE_INVALID_API_KEY_MESSAGE,
  YOUTUBE_QUOTA_EXCEEDED_MESSAGE,
  YouTubeInvalidApiKeyError,
  YouTubeQuotaExceededError,
} from "@/lib/errors";
import { getGeminiClient } from "@/lib/gemini";
import { reportError } from "@/lib/telemetry";
import { getChannelVideos } from "@/lib/youtube";

const MISSING_YT_KEY_MESSAGE =
  "Add your YouTube Data API v3 key in the API Keys panel to cluster topics.";
const MISSING_GEMINI_KEY_MESSAGE =
  "Add your Gemini API key in the API Keys panel to cluster topics.";

interface RequestBody {
  channelId?: string;
  desiredClusters?: number;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      // no-op
    }
  }
  return "Unknown error";
}

export async function POST(request: Request) {
  const youtubeKey = getYouTubeApiKey();
  const geminiKey = getGeminiApiKey();
  if (!youtubeKey) {
    return NextResponse.json({ error: MISSING_YT_KEY_MESSAGE }, { status: 401 });
  }
  if (!geminiKey) {
    return NextResponse.json({ error: MISSING_GEMINI_KEY_MESSAGE }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const channelId = body.channelId?.trim();
  if (!channelId) {
    return NextResponse.json({ error: "channelId is required" }, { status: 400 });
  }
  const desired = Math.max(2, Math.min(8, body.desiredClusters ?? 5));

  let videos;
  try {
    videos = await getChannelVideos(youtubeKey, channelId, 50);
  } catch (error) {
    if (error instanceof YouTubeQuotaExceededError) {
      return NextResponse.json({ error: YOUTUBE_QUOTA_EXCEEDED_MESSAGE }, { status: 429 });
    }
    if (error instanceof YouTubeInvalidApiKeyError) {
      return NextResponse.json({ error: YOUTUBE_INVALID_API_KEY_MESSAGE }, { status: 400 });
    }
    void reportError(error, { route: "/api/studio/clusters", channelId });
    return NextResponse.json(
      { error: "Failed to load channel videos for clustering" },
      { status: 500 }
    );
  }

  const titled = videos.filter((v) => v.title.trim().length > 0);
  if (titled.length < 2) {
    return NextResponse.json(
      { error: "Not enough videos with titles to cluster (need at least 2)." },
      { status: 422 }
    );
  }

  let embeddings: number[][];
  try {
    const client = getGeminiClient(geminiKey);
    embeddings = await embedTexts(
      client,
      titled.map((v) => v.title)
    );
  } catch (error) {
    void reportError(error, { route: "/api/studio/clusters", phase: "embed" });
    return NextResponse.json(
      { error: "Failed to embed titles", detail: getErrorMessage(error) },
      { status: 502 }
    );
  }

  // embedTexts guarantees a 1:1 alignment with the input array (missing rows
  // come back as []), so we can index without a defensive fallback.
  const items: EmbeddedItem[] = titled
    .map((video, idx) => ({ videoId: video.id, embedding: embeddings[idx] }))
    .filter((item) => item.embedding.length > 0);

  if (items.length < 2) {
    return NextResponse.json(
      { error: "Embedding service returned no usable vectors." },
      { status: 502 }
    );
  }

  const clusters = clusterByEmbedding(items, desired);
  const summary = summarizeClusters(clusters, videos);

  return NextResponse.json({ clusters: summary });
}
