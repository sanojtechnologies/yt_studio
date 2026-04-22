import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import ApiKeyMissing from "@/components/ApiKeyMissing";
import CompareForm from "@/components/CompareForm";
import CompareTable from "@/components/CompareTable";
import { getYouTubeApiKey } from "@/lib/apiKey";
import {
  buildComparisonRow,
  ChannelComparisonRow,
  COMPARE_LIMITS,
  parseCompareIds,
} from "@/lib/compareStats";
import {
  YOUTUBE_INVALID_API_KEY_MESSAGE,
  YOUTUBE_QUOTA_EXCEEDED_MESSAGE,
  YouTubeInvalidApiKeyError,
  YouTubeQuotaExceededError,
} from "@/lib/errors";
import { getChannelById, getChannelVideos } from "@/lib/youtube";

interface ComparePageProps {
  searchParams: { ids?: string };
}

export const metadata: Metadata = {
  title: "Compare Channels",
  description:
    "Compare multiple YouTube channels side-by-side across subscribers, views, cadence, and top-performing videos.",
  alternates: { canonical: "/compare" },
};

async function loadRows(
  apiKey: string,
  ids: string[]
): Promise<{ rows: ChannelComparisonRow[]; error?: string }> {
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
    return { rows: settled.filter((row): row is ChannelComparisonRow => row !== null) };
  } catch (error) {
    if (error instanceof YouTubeQuotaExceededError) {
      return { rows: [], error: YOUTUBE_QUOTA_EXCEEDED_MESSAGE };
    }
    if (error instanceof YouTubeInvalidApiKeyError) {
      return { rows: [], error: YOUTUBE_INVALID_API_KEY_MESSAGE };
    }
    return { rows: [], error: "Failed to load channel comparison." };
  }
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const apiKey = getYouTubeApiKey();
  if (!apiKey) return <ApiKeyMissing />;

  const ids = parseCompareIds(searchParams.ids);

  if (ids.length === 0) {
    return (
      <main id="main" className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100 md:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <Header />
          <CompareForm />
        </div>
      </main>
    );
  }

  if (ids.length < COMPARE_LIMITS.min) {
    redirect("/compare");
  }

  const { rows, error } = await loadRows(apiKey, ids);

  return (
    <main id="main" className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Header />
        {error ? (
          <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        ) : null}
        {rows.length >= COMPARE_LIMITS.min ? (
          <>
            <CompareTable rows={rows} />
            <div className="flex">
              <Link
                href={`/compare/gap?ids=${ids.join(",")}`}
                className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-200 hover:border-violet-400 hover:text-white"
              >
                Run gap analysis →
              </Link>
            </div>
          </>
        ) : (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
            Could not resolve enough channels. Try different ids or open them in the
            dashboard first to verify.
          </p>
        )}
        <CompareForm />
      </div>
    </main>
  );
}

function Header() {
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <Link
        href="/lookup"
        className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 text-zinc-200 hover:border-violet-400 hover:text-white"
      >
        <span aria-hidden>←</span>
        Channel lookup
      </Link>
      <h1 className="text-lg font-semibold text-zinc-100">Channel Comparison</h1>
      <div className="flex items-center gap-3 text-zinc-400">
        <Link href="/history" className="hover:text-violet-300">
          Recent
        </Link>
        <span aria-hidden className="text-zinc-700">•</span>
        <Link href="/keys" className="hover:text-violet-300">
          Manage Keys
        </Link>
      </div>
    </nav>
  );
}
