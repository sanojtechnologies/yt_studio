"use client";

import { useEffect } from "react";
import { buildSnapshot } from "@/lib/dashboardSnapshot";
import { appendSnapshotEntry, pruneStaleSnapshots } from "@/lib/idb";
import { YouTubeChannel, YouTubeVideo } from "@/types/youtube";

interface SnapshotPersisterProps {
  channel: YouTubeChannel;
  videos: YouTubeVideo[];
}

export default function SnapshotPersister({ channel, videos }: SnapshotPersisterProps) {
  useEffect(() => {
    const snapshot = buildSnapshot(channel, videos);
    void appendSnapshotEntry(snapshot).catch(() => {
      // Best-effort cache; storage failures (quota, private mode) are non-fatal.
    });
    void pruneStaleSnapshots().catch(() => {});
  }, [channel, videos]);

  return null;
}
