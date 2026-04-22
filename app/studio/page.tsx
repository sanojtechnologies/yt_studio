import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getGeminiApiKey, getYouTubeApiKey } from "@/lib/apiKey";

export const metadata: Metadata = {
  title: "Creator Studio Tools",
  description:
    "Use AI-powered creator workflows for title ideation, hook writing, thumbnail generation, clustering, script drafting, and A/B testing.",
  alternates: { canonical: "/studio" },
};

const TOOLS = [
  {
    href: "/studio/prepublish",
    title: "Pre-Publish Analyzer",
    description:
      "Save unpublished draft metadata and thumbnail URLs locally, then run pre-publish quality checks before going live.",
  },
  {
    href: "/studio/titles",
    title: "Title Lab",
    description:
      "Generate and score 10 titles for any topic, anchored on this channel's actual top performers.",
  },
  {
    href: "/studio/hook",
    title: "Hook + Description + Chapters",
    description:
      "Three cold-open hooks, an SEO-rich description, search-friendly tags, and chapter markers from one outline.",
  },
  {
    href: "/studio/thumbnails",
    title: "Thumbnail Generator",
    description:
      "Generate 1-3 thumbnail concepts in seconds. Save what works, throw the rest away — nothing is stored on our side.",
  },
  {
    href: "/studio/clusters",
    title: "Topic Clusters",
    description:
      "Embed the channel's recent 50 titles with Gemini and group them into themes ranked by median views. Ideate new videos per cluster.",
  },
  {
    href: "/studio/script",
    title: "Script Doctor",
    description:
      "Stream a structured script outline — cold open, hook, beats, CTA, outro — tuned to your target runtime and audience.",
  },
  {
    href: "/studio/ab-title",
    title: "A/B Title Scorer",
    description:
      "Pit two candidate titles head-to-head across clarity, curiosity, SEO, and clickability axes and get a rationale.",
  },
  {
    href: "/studio/ab-thumbnail",
    title: "A/B Thumbnail Comparator",
    description:
      "Upload two thumbnails (or paste URLs) and compare face impact, readability, contrast, and curiosity gap side by side.",
  },
  {
    href: "/compare/gap",
    title: "Competitor Gap Analysis",
    description:
      "Pick 2-4 channels you've already compared and surface shared topics plus the angles each channel is missing.",
  },
];

export default function StudioIndex() {
  if (!getYouTubeApiKey() || !getGeminiApiKey()) {
    redirect("/keys");
  }

  return (
    <main id="main" className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="space-y-2">
          <h1 className="bg-gradient-to-r from-blue-400 via-violet-400 to-fuchsia-400 bg-clip-text text-3xl font-semibold text-transparent">
            Creator Studio
          </h1>
          <p className="text-sm text-zinc-400">
            AI co-pilot tools for titles, hooks, descriptions, and thumbnails. Each tool runs
            against your own Gemini key — nothing leaves your browser session.
          </p>
        </header>

        <ul className="grid gap-4 md:grid-cols-2">
          {TOOLS.map((tool) => (
            <li key={tool.href}>
              <Link
                href={tool.href}
                className="block h-full rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 transition hover:border-violet-500/60"
              >
                <h2 className="text-lg font-semibold text-zinc-100">{tool.title}</h2>
                <p className="mt-2 text-sm text-zinc-400">{tool.description}</p>
                <span className="mt-3 inline-block text-xs text-violet-300">Open →</span>
              </Link>
            </li>
          ))}
        </ul>

        <nav className="flex items-center gap-3 text-sm text-zinc-400">
          <Link href="/lookup" className="hover:text-violet-300">← Channel lookup</Link>
          <span aria-hidden className="text-zinc-700">•</span>
          <Link href="/keys" className="hover:text-violet-300">Manage keys</Link>
        </nav>
      </div>
    </main>
  );
}
