"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const EXAMPLE_CHANNELS = [
  "@MrBeast",
  "https://www.youtube.com/@GoogleDevelopers",
  "UC-lHJZR3Gqxm24_Vd_AJ5Yw",
];
const STORAGE_KEY = "ytstudio:history";

export default function LookupForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function resolveAndNavigate(rawValue: string) {
    const value = rawValue.trim();
    if (!value) {
      setError("Enter a YouTube channel URL, @handle, or channel ID.");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`/api/channel?q=${encodeURIComponent(value)}`);
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not resolve channel.");
      }

      const payload = (await response.json()) as { channelId?: string };
      if (!payload.channelId) {
        throw new Error("Channel ID not found.");
      }

      try {
        const rawHistory = localStorage.getItem(STORAGE_KEY);
        const history = rawHistory
          ? (JSON.parse(rawHistory) as Array<{ channelId: string; savedAt: string }>)
          : [];
        const nextHistory = [
          { channelId: payload.channelId, savedAt: new Date().toISOString() },
          ...history.filter((item) => item.channelId !== payload.channelId),
        ].slice(0, 12);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));
      } catch {
        // Ignore localStorage read/write failures.
      }

      router.push(`/dashboard/${payload.channelId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not resolve channel.";
      setError(message);
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await resolveAndNavigate(query);
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl backdrop-blur md:p-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-r from-blue-400 via-violet-400 to-fuchsia-400 bg-clip-text text-3xl font-semibold text-transparent md:text-4xl">
            YouTube Channel Lookup
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Paste a channel URL, @handle, or channel ID to open the dashboard.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href="/studio"
            className="rounded-lg border border-violet-400/60 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 hover:border-violet-300 hover:text-white"
          >
            Creator Studio
          </Link>
          <Link
            href="/keys"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:border-violet-400 hover:text-white"
          >
            Manage API Keys
          </Link>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="https://www.youtube.com/@channel or @handle or UC..."
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none ring-blue-400 transition placeholder:text-zinc-500 focus:ring-2"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-xl bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Resolving..." : "Open Dashboard"}
        </button>
      </form>

      {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {EXAMPLE_CHANNELS.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              setQuery(example);
              void resolveAndNavigate(example);
            }}
            className="rounded-full border border-zinc-700 bg-zinc-800/70 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-violet-400 hover:text-white"
          >
            {example}
          </button>
        ))}
      </div>

      <Link
        href="/history"
        className="mt-6 inline-block text-sm text-violet-300 hover:text-violet-200"
      >
        View recent channels
      </Link>
    </section>
  );
}
