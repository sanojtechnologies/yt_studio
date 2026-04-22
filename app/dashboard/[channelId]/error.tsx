"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/telemetry";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void reportError(error, { boundary: "dashboard", digest: error.digest });
  }, [error]);

  const isQuota = error.message.toLowerCase().includes("quota exceeded");
  const message = isQuota
    ? "YouTube quota exceeded, try again tomorrow."
    : "Could not load this dashboard right now.";

  return (
    <div className="mx-auto w-full max-w-3xl rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 text-zinc-100">
      <h2 className="text-xl font-semibold">Dashboard Error</h2>
      <p className="mt-2 text-sm text-zinc-300">{message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500"
      >
        Retry
      </button>
    </div>
  );
}
