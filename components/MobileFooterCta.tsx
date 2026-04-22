"use client";

import { useState } from "react";
import { DONATE_URL } from "@/lib/donate";
import { POWERED_BY_URL } from "@/components/PoweredByLink";

export default function MobileFooterCta() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-3 right-3 z-40 sm:hidden">
      <div className="flex flex-col items-end gap-2">
        {open ? (
          <div className="w-[min(78vw,17rem)] rounded-xl border border-zinc-700 bg-zinc-900/95 p-2 shadow-xl backdrop-blur">
            <a
              href={DONATE_URL}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="flex items-center justify-between rounded-lg px-2 py-2 text-xs font-medium text-zinc-100 hover:bg-zinc-800"
            >
              <span>Support This Project</span>
              <span aria-hidden>♥</span>
            </a>
            <a
              href={POWERED_BY_URL}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="mt-1 flex items-center justify-between rounded-lg px-2 py-2 text-xs font-medium text-zinc-100 hover:bg-zinc-800"
            >
              <span>Powered By: Sanoj Tech</span>
              <span aria-hidden>↗</span>
            </a>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-label={open ? "Close Footer Actions" : "Open Footer Actions"}
          className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/60 bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white shadow-xl shadow-fuchsia-500/25"
        >
          <span aria-hidden>{open ? "×" : "♥"}</span>
          <span>{open ? "Close" : "Support"}</span>
        </button>
      </div>
    </div>
  );
}
