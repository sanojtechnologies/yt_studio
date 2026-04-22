import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AddToCompareButton from "@/components/AddToCompareButton";
import ApiKeyMissing from "@/components/ApiKeyMissing";
import BreakoutList from "@/components/BreakoutList";
import ChannelHeader from "@/components/ChannelHeader";
import ChannelHistoryTracker from "@/components/ChannelHistoryTracker";
import ExportButton from "@/components/ExportButton";
import GrowthSection from "@/components/GrowthSection";
import PerformanceChart from "@/components/PerformanceChart";
import PublishHeatmap from "@/components/PublishHeatmap";
import SnapshotPersister from "@/components/SnapshotPersister";
import StatsCards from "@/components/StatsCards";
import TitleTrends from "@/components/TitleTrends";
import VideoGrid from "@/components/VideoGrid";
import { getYouTubeApiKey } from "@/lib/apiKey";
import { enrichVideosWithShortsProbe } from "@/lib/shortsProbe";
import { calculateStats } from "@/lib/stats";
import { getChannelById, getChannelVideos } from "@/lib/youtube";
import { YouTubeChannel, YouTubeVideo } from "@/types/youtube";

interface DashboardPageProps {
  params: {
    channelId: string;
  };
}

export const metadata: Metadata = {
  title: "Channel Dashboard",
  robots: { index: false, follow: false },
};

function HeaderSkeleton() {
  return <div className="h-28 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/70" />;
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-24 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/70"
        />
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-[370px] animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/70" />;
}

function HeatmapSkeleton() {
  return <div className="h-[260px] animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/70" />;
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-56 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/70"
        />
      ))}
    </div>
  );
}

async function HeaderSection({
  channelPromise,
  videosPromise,
}: {
  channelPromise: Promise<YouTubeChannel | null>;
  videosPromise: Promise<YouTubeVideo[]>;
}) {
  const channel = await channelPromise;
  if (!channel) notFound();
  const videos = await videosPromise;
  return (
    <>
      <ChannelHistoryTracker
        channelId={channel.id}
        channelTitle={channel.title}
        thumbnailUrl={channel.thumbnailUrl}
      />
      <SnapshotPersister channel={channel} videos={videos} />
      <ChannelHeader
        channel={channel}
        actions={
          <>
            <AddToCompareButton channelId={channel.id} channelTitle={channel.title} />
            <ExportButton channel={channel} videos={videos} />
          </>
        }
      />
    </>
  );
}

async function StatsSection({ videosPromise }: { videosPromise: Promise<YouTubeVideo[]> }) {
  const videos = await videosPromise;
  return <StatsCards stats={calculateStats(videos)} videos={videos} />;
}

async function BreakoutSection({
  channelId,
  videosPromise,
}: {
  channelId: string;
  videosPromise: Promise<YouTubeVideo[]>;
}) {
  const videos = await videosPromise;
  return <BreakoutList channelId={channelId} currentVideos={videos} />;
}

async function ChartSection({ videosPromise }: { videosPromise: Promise<YouTubeVideo[]> }) {
  const videos = await videosPromise;
  const chartData = videos
    .slice()
    .reverse()
    .map((video, index) => ({ index: index + 1, views: video.viewCount }));

  return <PerformanceChart data={chartData} />;
}

async function HeatmapSection({ videosPromise }: { videosPromise: Promise<YouTubeVideo[]> }) {
  const videos = await videosPromise;
  return <PublishHeatmap videos={videos} />;
}

async function TitleTrendsSection({ videosPromise }: { videosPromise: Promise<YouTubeVideo[]> }) {
  const videos = await videosPromise;
  return <TitleTrends videos={videos} />;
}

async function GridSection({ videosPromise }: { videosPromise: Promise<YouTubeVideo[]> }) {
  const videos = await videosPromise;
  return <VideoGrid videos={videos} />;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const apiKey = getYouTubeApiKey();
  if (!apiKey) {
    return <ApiKeyMissing />;
  }

  const channelPromise = getChannelById(apiKey, params.channelId);
  // Fetch videos, then enrich ambiguous-duration ones (≤ SHORT_MAX_SECONDS)
  // with YouTube's authoritative isShort signal from `/shorts/{id}`. The
  // resulting promise is shared across all Suspense boundaries so the
  // probe fans out exactly once per page render.
  const videosPromise = getChannelVideos(apiKey, params.channelId, 50).then(
    (videos) => enrichVideosWithShortsProbe(videos)
  );

  return (
    <main id="main" className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <nav className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link
            href="/lookup"
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 text-zinc-200 hover:border-violet-400 hover:text-white"
          >
            <span aria-hidden>←</span>
            Analyze another channel
          </Link>
          <div className="flex items-center gap-3 text-zinc-400">
            <Link href="/studio" className="hover:text-violet-300">
              Studio
            </Link>
            <span aria-hidden className="text-zinc-700">•</span>
            <Link href="/compare" className="hover:text-violet-300">
              Compare
            </Link>
            <span aria-hidden className="text-zinc-700">•</span>
            <Link href="/history" className="hover:text-violet-300">
              Recent
            </Link>
            <span aria-hidden className="text-zinc-700">•</span>
            <Link href="/keys" className="hover:text-violet-300">
              Manage API Keys
            </Link>
          </div>
        </nav>
        <Suspense fallback={<HeaderSkeleton />}>
          <HeaderSection channelPromise={channelPromise} videosPromise={videosPromise} />
        </Suspense>

        <Suspense fallback={<StatsSkeleton />}>
          <StatsSection videosPromise={videosPromise} />
        </Suspense>

        <GrowthSection channelId={params.channelId} />

        <Suspense fallback={null}>
          <BreakoutSection channelId={params.channelId} videosPromise={videosPromise} />
        </Suspense>

        <Suspense fallback={<ChartSkeleton />}>
          <ChartSection videosPromise={videosPromise} />
        </Suspense>

        <Suspense fallback={<HeatmapSkeleton />}>
          <HeatmapSection videosPromise={videosPromise} />
        </Suspense>

        <Suspense fallback={null}>
          <TitleTrendsSection videosPromise={videosPromise} />
        </Suspense>

        <Suspense fallback={<GridSkeleton />}>
          <GridSection videosPromise={videosPromise} />
        </Suspense>
      </div>
    </main>
  );
}
