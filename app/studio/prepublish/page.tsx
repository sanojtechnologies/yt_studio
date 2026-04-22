import Link from "next/link";
import { redirect } from "next/navigation";
import PrePublishAnalyzer from "@/components/PrePublishAnalyzer";
import { getGeminiApiKey, getYouTubeApiKey } from "@/lib/apiKey";

export default function PrePublishAnalyzerPage() {
  if (!getYouTubeApiKey() || !getGeminiApiKey()) {
    redirect("/keys");
  }

  return (
    <main id="main" className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <nav className="text-sm text-zinc-400">
          <Link href="/studio" className="hover:text-violet-300">← Creator Studio</Link>
        </nav>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-zinc-100">Pre-Publish Analyzer</h1>
          <p className="text-sm text-zinc-400">
            Analyze draft title, description, tags, and thumbnail before publishing.
          </p>
        </header>
        <PrePublishAnalyzer />
      </div>
    </main>
  );
}
