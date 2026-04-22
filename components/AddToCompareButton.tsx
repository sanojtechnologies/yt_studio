"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface AddToCompareButtonProps {
  channelId: string;
  channelTitle: string;
}

const STORAGE_KEY = "ytstudio:compareDraft";
const MAX = 4;

function readDraft(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

function writeDraft(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

export default function AddToCompareButton({ channelId, channelTitle }: AddToCompareButtonProps) {
  const [draft, setDraft] = useState<string[]>([]);

  useEffect(() => {
    setDraft(readDraft());
  }, []);

  const inDraft = draft.includes(channelId);

  function toggle() {
    const next = inDraft
      ? draft.filter((id) => id !== channelId)
      : [...draft, channelId].slice(-MAX);
    setDraft(next);
    writeDraft(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-label={
          inDraft
            ? `Remove ${channelTitle} from comparison`
            : `Add ${channelTitle} to comparison`
        }
        className={`rounded-lg border px-3 py-1.5 text-xs transition ${
          inDraft
            ? "border-rose-400 bg-rose-500/10 text-rose-200 hover:border-rose-300"
            : "border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-violet-400"
        }`}
      >
        {inDraft ? "In comparison ×" : "Add to compare"}
      </button>
      {draft.length >= 2 ? (
        <Link
          href={`/compare?ids=${encodeURIComponent(draft.join(","))}`}
          className="rounded-lg bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          Compare {draft.length} →
        </Link>
      ) : null}
    </div>
  );
}
