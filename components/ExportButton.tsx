"use client";

import { useState } from "react";
import { videosToCsv } from "@/lib/csv";
import { YouTubeChannel, YouTubeVideo } from "@/types/youtube";

interface ExportButtonProps {
  channel: YouTubeChannel;
  videos: YouTubeVideo[];
}

function safeFilename(value: string): string {
  return value.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 64) || "channel";
}

function triggerDownload(filename: string, mime: string, body: BlobPart) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ExportButton({ channel, videos }: ExportButtonProps) {
  const [open, setOpen] = useState(false);

  function exportCsv() {
    triggerDownload(
      `${safeFilename(channel.title)}-videos.csv`,
      "text/csv;charset=utf-8",
      videosToCsv(videos)
    );
    setOpen(false);
  }

  function exportJson() {
    const payload = {
      channel,
      videoCount: videos.length,
      videos,
      exportedAt: new Date().toISOString(),
    };
    triggerDownload(
      `${safeFilename(channel.title)}-videos.json`,
      "application/json",
      JSON.stringify(payload, null, 2)
    );
    setOpen(false);
  }

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 hover:border-violet-400"
      >
        Export
        <span aria-hidden>▾</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={exportCsv}
            className="block w-full px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
          >
            Videos As CSV
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={exportJson}
            className="block w-full px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
          >
            Snapshot As JSON
          </button>
        </div>
      ) : null}
    </div>
  );
}
