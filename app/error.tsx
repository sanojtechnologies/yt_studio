"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/telemetry";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    void reportError(error, { boundary: "global", digest: error.digest });
  }, [error]);

  const isQuota = error.message.toLowerCase().includes("quota exceeded");
  const message = isQuota
    ? "YouTube quota exceeded, try again tomorrow."
    : "Something went wrong. Please try again.";

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 text-center">
        <h2 className="text-2xl font-semibold">Unable to load page</h2>
        <p className="mt-2 text-sm text-zinc-300">{message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500"
        >
          Try Again
        </button>
      </div>
    </main>
  );
}
