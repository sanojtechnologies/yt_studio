"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { COMPARE_LIMITS, parseCompareIds } from "@/lib/compareStats";

const HISTORY_KEY = "ytstudio:history";

interface HistoryEntry {
  channelId: string;
  channelTitle?: string;
  thumbnailUrl?: string;
}

function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function CompareForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = useMemo(
    () => parseCompareIds(searchParams.get("ids")),
    [searchParams]
  );
  const [selected, setSelected] = useState<string[]>(initial);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [manualId, setManualId] = useState("");

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  function toggle(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      if (current.length >= COMPARE_LIMITS.max) return current;
      return [...current, id];
    });
  }

  function addManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = manualId.trim();
    if (!id || selected.includes(id) || selected.length >= COMPARE_LIMITS.max) return;
    setSelected([...selected, id]);
    setManualId("");
  }

  function compare() {
    if (selected.length < COMPARE_LIMITS.min) return;
    const params = new URLSearchParams({ ids: selected.join(",") });
    router.push(`/compare?${params.toString()}`);
  }

  const ready = selected.length >= COMPARE_LIMITS.min;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 md:p-6">
      <h2 className="text-lg font-semibold text-zinc-100">Build a comparison</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Pick {COMPARE_LIMITS.min}–{COMPARE_LIMITS.max} channels. We&apos;ll line up
        their last-50-video stats, cadence, median views, and top hits side by side.
      </p>

      {history.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-xs uppercase tracking-wide text-zinc-500">Pick from history</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {history.map((entry) => {
              const checked = selected.includes(entry.channelId);
              return (
                <li key={entry.channelId}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                      checked
                        ? "border-violet-400 bg-violet-500/10 text-zinc-100"
                        : "border-zinc-800 bg-zinc-950 text-zinc-200 hover:border-violet-500/60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-violet-500"
                      checked={checked}
                      onChange={() => toggle(entry.channelId)}
                    />
                    <span className="flex-1 truncate">
                      {entry.channelTitle || entry.channelId}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <form onSubmit={addManual} className="mt-5 flex gap-2">
        <input
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
          placeholder="Paste a channel ID (UC...)"
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-violet-400 focus:ring-2"
        />
        <button
          type="submit"
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:border-violet-400"
        >
          Add
        </button>
      </form>

      {selected.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-xs uppercase tracking-wide text-zinc-500">
            Selected ({selected.length}/{COMPARE_LIMITS.max})
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {selected.map((id) => {
              const meta = history.find((entry) => entry.channelId === id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-100 hover:border-rose-400 hover:text-rose-300"
                >
                  {meta?.channelTitle || id}
                  <span aria-hidden>×</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={compare}
          disabled={!ready}
          className="rounded-xl bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Compare {selected.length || ""}
        </button>
        <Link href="/lookup" className="text-sm text-violet-300 hover:text-violet-200">
          Add A New Channel First →
        </Link>
      </div>
    </section>
  );
}
