"use client";

import { useEffect } from "react";

interface ChannelHistoryTrackerProps {
  channelId: string;
  channelTitle?: string;
  thumbnailUrl?: string;
}

interface HistoryItem {
  channelId: string;
  channelTitle?: string;
  thumbnailUrl?: string;
  savedAt: string;
}

const STORAGE_KEY = "ytstudio:history";
const MAX_ITEMS = 12;

export default function ChannelHistoryTracker({
  channelId,
  channelTitle,
  thumbnailUrl,
}: ChannelHistoryTrackerProps) {
  useEffect(() => {
    if (!channelId) return;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const history = raw ? (JSON.parse(raw) as HistoryItem[]) : [];

      const entry: HistoryItem = {
        channelId,
        channelTitle: channelTitle?.trim() || undefined,
        thumbnailUrl: thumbnailUrl?.trim() || undefined,
        savedAt: new Date().toISOString(),
      };

      const next = [entry, ...history.filter((item) => item.channelId !== channelId)].slice(
        0,
        MAX_ITEMS
      );

      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore localStorage read/write failures.
    }
  }, [channelId, channelTitle, thumbnailUrl]);

  return null;
}
