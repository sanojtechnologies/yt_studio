import type { Metadata } from "next";
import Link from "next/link";
import { getGeminiApiKey, getYouTubeApiKey } from "@/lib/apiKey";
import {
  LANDING_BODY_PARAGRAPHS,
  LANDING_H1,
  LANDING_HERO_TAGLINE,
  LANDING_INTERNAL_LINKS,
  LANDING_META_DESCRIPTION,
  LANDING_PAGE_TITLE,
  LANDING_SHARE_LINKS,
  LANDING_SHARE_TEXT,
  buildShareUrl,
} from "@/lib/landingCopy";
import { getSiteUrl } from "@/lib/siteUrl";

export const metadata: Metadata = {
  title: LANDING_PAGE_TITLE,
  description: LANDING_META_DESCRIPTION,
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
  const siteUrl = getSiteUrl();
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
    <main
      id="main"
      className="relative min-h-screen overflow-hidden bg-zinc-950 px-4 py-10 text-zinc-100"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.25),transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.25),transparent_45%)]" />

      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-8">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur">
          <h1 className="bg-gradient-to-r from-blue-400 via-violet-400 to-fuchsia-400 bg-clip-text text-3xl font-semibold leading-tight text-transparent md:text-4xl">
            {LANDING_H1}
          </h1>
          <p className="mt-3 text-sm text-zinc-300 md:text-base">
            {LANDING_HERO_TAGLINE}{" "}
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

          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
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

        <section
          aria-labelledby="about-heading"
          className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-xl backdrop-blur"
        >
          <h2
            id="about-heading"
            className="text-xl font-semibold text-zinc-100 md:text-2xl"
          >
            What YT Studio Analyzer does for YouTube creators
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-zinc-300 md:text-base">
            {LANDING_BODY_PARAGRAPHS.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="explore-heading"
          className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-xl backdrop-blur"
        >
          <h2
            id="explore-heading"
            className="text-xl font-semibold text-zinc-100 md:text-2xl"
          >
            Explore every YT Studio Analyzer surface
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Jump directly into any tool — links open inside the same app and
            respect the keys you have already configured.
          </p>
          <ul className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {LANDING_INTERNAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-violet-300 hover:border-violet-400 hover:text-violet-200"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="share-heading"
          className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-xl backdrop-blur"
        >
          <h2
            id="share-heading"
            className="text-lg font-semibold text-zinc-100"
          >
            Share YT Studio Analyzer
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Help another creator find smarter YouTube analytics — open a share
            sheet on your favorite network.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2 text-sm">
            {LANDING_SHARE_LINKS.map((share) => (
              <li key={share.id}>
                <a
                  href={buildShareUrl(share.id, {
                    url: siteUrl,
                    text: LANDING_SHARE_TEXT,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-share-intent={share.id}
                  className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800/70 px-3 py-1.5 text-zinc-100 hover:border-violet-400 hover:text-violet-200"
                >
                  {share.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
