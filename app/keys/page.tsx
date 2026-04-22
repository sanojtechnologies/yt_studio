import type { Metadata } from "next";
import Link from "next/link";
import { getGeminiApiKey, getYouTubeApiKey } from "@/lib/apiKey";

export const metadata: Metadata = {
  title: "API Keys",
  description: "Configure and validate your YouTube Data API and Gemini API keys.",
  robots: { index: false, follow: false },
};

interface RowProps {
  href: string;
  label: string;
  description: string;
  configured: boolean;
}

function Row({ href, label, description, configured }: RowProps) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 hover:border-violet-500/60"
    >
      <div>
        <p className="text-sm font-medium text-zinc-100">{label}</p>
        <p className="mt-1 text-xs text-zinc-400">{description}</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-1 text-xs ${
          configured
            ? "bg-emerald-500/20 text-emerald-300"
            : "bg-rose-500/20 text-rose-300"
        }`}
      >
        {configured ? "Configured" : "Missing"}
      </span>
    </Link>
  );
}

export default function KeysOverviewPage() {
  const youtube = Boolean(getYouTubeApiKey());
  const gemini = Boolean(getGeminiApiKey());

  return (
    <main id="main" className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100 md:px-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Your API Keys</h1>
          <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">
            ← Home
          </Link>
        </div>
        <p className="text-sm text-zinc-400">
          Both keys are required to use channel lookup and analysis. Keys are validated
          against their providers before being saved, and live only in this browser. Not sure
          how to get them?{" "}
          <Link
            href="/getting-started"
            className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
          >
            Read the step-by-step guide
          </Link>
          .
        </p>
        <div className="space-y-3">
          <Row
            href="/keys/youtube"
            label="YouTube Data API v3 Key"
            description="Used to fetch channel and video data from Google."
            configured={youtube}
          />
          <Row
            href="/keys/gemini"
            label="Gemini API Key"
            description="Used to power AI content and thumbnail analysis."
            configured={gemini}
          />
        </div>
      </div>
    </main>
  );
}
