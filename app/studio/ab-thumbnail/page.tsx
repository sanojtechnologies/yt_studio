import Link from "next/link";
import { redirect } from "next/navigation";
import AbThumbnailLab from "@/components/AbThumbnailLab";
import { getGeminiApiKey } from "@/lib/apiKey";

export default function AbThumbnailPage() {
  if (!getGeminiApiKey()) {
    redirect("/keys");
  }

  return (
    <main id="main" className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <nav className="text-sm text-zinc-400">
          <Link href="/studio" className="hover:text-violet-300">← Creator Studio</Link>
        </nav>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-zinc-100">Thumbnail A/B comparator</h1>
          <p className="text-sm text-zinc-400">
            Pit two thumbnails against each other — upload files or paste image URLs.
          </p>
        </header>
        <AbThumbnailLab />
      </div>
    </main>
  );
}
