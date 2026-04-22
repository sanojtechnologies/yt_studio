import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import CompareGapClient from "@/components/CompareGapClient";
import { getGeminiApiKey, getYouTubeApiKey } from "@/lib/apiKey";
import { parseCompareIds } from "@/lib/compareStats";

interface CompareGapPageProps {
  searchParams: { ids?: string };
}

export const metadata: Metadata = {
  title: "Competitor Gap Analysis",
  description:
    "Find content opportunities by identifying topics your channel is missing compared with competitor channels.",
  alternates: { canonical: "/compare/gap" },
};

export default function CompareGapPage({ searchParams }: CompareGapPageProps) {
  if (!getYouTubeApiKey() || !getGeminiApiKey()) {
    redirect("/keys");
  }
  const ids = parseCompareIds(searchParams.ids);
  return (
    <main id="main" className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <nav className="text-sm text-zinc-400">
          <Link href="/compare" className="hover:text-violet-300">← Channel comparison</Link>
        </nav>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-zinc-100">Competitor gap analysis</h1>
          <p className="text-sm text-zinc-400">
            Find topics that appear across channels and content each channel is missing.
          </p>
        </header>
        <CompareGapClient ids={ids} />
      </div>
    </main>
  );
}
