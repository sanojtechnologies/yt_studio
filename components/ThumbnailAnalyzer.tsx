"use client";

import { useEffect, useId, useRef, useState } from "react";
import MetadataAnalysisPanel from "@/components/MetadataAnalysisPanel";
import ThumbnailAnalysisPanel from "@/components/ThumbnailAnalysisPanel";
import { YouTubeVideo } from "@/types/youtube";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type TabId = "thumbnail" | "metadata";

const TABS: { id: TabId; label: string }[] = [
  { id: "thumbnail", label: "Thumbnail" },
  { id: "metadata", label: "Metadata" },
];

interface ThumbnailAnalyzerProps {
  video: YouTubeVideo | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "Video Analyzer" modal. Historically analyzed only the thumbnail, hence
 * the component name; now hosts tabbed panels (thumbnail + metadata) but
 * the import path stays stable so callers don't churn. Each panel owns its
 * own cache, API call, and UI state — this component just wires up the
 * modal shell (focus trap, ESC, backdrop) and the tab switcher.
 */
export default function ThumbnailAnalyzer({ video, isOpen, onClose }: ThumbnailAnalyzerProps) {
  const [activeTab, setActiveTab] = useState<TabId>("thumbnail");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // Reset to the thumbnail tab whenever a new video is opened so the UX is
  // consistent and creators never land on a stale metadata tab from a
  // previous card.
  useEffect(() => {
    if (isOpen) setActiveTab("thumbnail");
  }, [isOpen, video]);

  // ESC closes the dialog; Tab/Shift+Tab cycles focus within the modal so
  // keyboard users aren't marooned behind the underlay.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    closeButtonRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !video) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-700 bg-zinc-950 text-zinc-100 shadow-2xl sm:max-h-[min(90vh,48rem)] sm:max-w-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <h3 id={titleId} className="text-lg font-semibold">
            Video Analyzer
          </h3>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close video analyzer"
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900"
          >
            Close
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Video analyzer sections"
          className="flex gap-1 border-b border-zinc-800 px-5 pt-3"
        >
          {TABS.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`${titleId}-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`${titleId}-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-sm transition ${
                  selected
                    ? "border-violet-400 text-zinc-100"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 line-clamp-2 text-sm text-zinc-300">{video.title}</p>

          <div
            role="tabpanel"
            id={`${titleId}-panel-thumbnail`}
            aria-labelledby={`${titleId}-tab-thumbnail`}
            hidden={activeTab !== "thumbnail"}
          >
            {activeTab === "thumbnail" ? (
              <ThumbnailAnalysisPanel video={video} isActive={activeTab === "thumbnail"} />
            ) : null}
          </div>
          <div
            role="tabpanel"
            id={`${titleId}-panel-metadata`}
            aria-labelledby={`${titleId}-tab-metadata`}
            hidden={activeTab !== "metadata"}
          >
            {activeTab === "metadata" ? (
              <MetadataAnalysisPanel video={video} isActive={activeTab === "metadata"} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
