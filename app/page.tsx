import type { Metadata } from "next";
import Link from "next/link";
import { getGeminiApiKey, getYouTubeApiKey } from "@/lib/apiKey";

export const metadata: Metadata = {
  title: "YouTube Analytics & Creator Studio Tools",
  description:
    "YT Studio Analyzer helps creators analyze channel performance and get AI recommendations for thumbnails, titles, descriptions, and tags.",
  alternates: { canonical: "/" },
};

interface StatusRowProps {
  label: string;
  configured: boolean;
}

function StatusRow({ label, configured }: StatusRowProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">
      <span className="text-zinc-100">{label}</span>
      <span
        className={`rounded-full px-2 py-1 text-xs ${
          configured
            ? "bg-emerald-500/20 text-emerald-300"
            : "bg-rose-500/20 text-rose-300"
        }`}
      >
        {configured ? "Configured" : "Missing"}
      </span>
    </div>
  );
}

export default function Home() {
  const youtube = Boolean(getYouTubeApiKey());
  const gemini = Boolean(getGeminiApiKey());
  const ready = youtube && gemini;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "YT Studio Analyzer",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "YouTube analytics and AI creator tooling for thumbnails, titles, descriptions, and tags.",
    url: "/",
  };

  return (
    <main id="main" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-10 text-zinc-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.25),transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.25),transparent_45%)]" />
      <section className="relative w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur">
        <h1 className="bg-gradient-to-r from-blue-400 via-violet-400 to-fuchsia-400 bg-clip-text text-3xl font-semibold text-transparent md:text-4xl">
          YT Studio Analyzer
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Bring your own API keys to analyze any YouTube channel and its thumbnails.{" "}
          <Link
            href="/getting-started"
            className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
          >
            New here? Read the quick guide.
          </Link>
        </p>

        <div className="mt-6 space-y-2">
          <StatusRow label="YouTube Data API v3 Key" configured={youtube} />
          <StatusRow label="Gemini API Key" configured={gemini} />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/keys"
            className="rounded-xl border border-zinc-700 bg-zinc-800/70 px-4 py-2.5 text-sm text-zinc-100 hover:border-violet-400"
          >
            Manage API Keys
          </Link>
          {ready ? (
            <Link
              href="/lookup"
              className="rounded-xl bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              Open Channel Lookup →
            </Link>
          ) : (
            <p className="text-xs text-zinc-500">
              Add and validate both keys to unlock channel lookup.
            </p>
          )}
        </div>

        <div className="mt-6 flex items-center gap-3 text-sm">
          <Link href="/history" className="text-violet-300 hover:text-violet-200">
            View recent channels
          </Link>
          <span aria-hidden className="text-zinc-700">•</span>
          <Link href="/compare" className="text-violet-300 hover:text-violet-200">
            Compare channels
          </Link>
          <span aria-hidden className="text-zinc-700">•</span>
          <Link href="/studio" className="text-violet-300 hover:text-violet-200">
            Creator Studio
          </Link>
        </div>
      </section>
    </main>
  );
}
