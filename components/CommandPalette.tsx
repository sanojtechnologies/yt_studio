"use client";

import { useRouter } from "next/navigation";
import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildChannelCommands,
  ChannelLikeEntry,
  Command,
  filterCommands,
  RankedCommand,
  STATIC_COMMANDS,
} from "@/lib/commands";
import { DONATE_URL } from "@/lib/donate";

const STORAGE_KEY = "ytstudio:history";
const THEME_KEY = "ytstudio:theme";

function readHistory(): ChannelLikeEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChannelLikeEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toggleTheme(): void {
  const root = document.documentElement;
  const current = root.classList.contains("dark") ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  root.classList.toggle("dark", next === "dark");
  root.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // private mode / quota — palette toggle still works in-memory
  }
}

function isModKey(event: KeyboardEvent<HTMLElement> | globalThis.KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [history, setHistory] = useState<ChannelLikeEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const allCommands: Command[] = useMemo(
    () => [...STATIC_COMMANDS, ...buildChannelCommands(history)],
    [history]
  );

  const ranked: RankedCommand[] = useMemo(
    () => filterCommands(allCommands, query),
    [allCommands, query]
  );

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "k" && isModKey(event)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    setHistory(readHistory());
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const runCommand = useCallback(
    (command: Command) => {
      setOpen(false);
      if (command.actionId === "toggle-theme") {
        toggleTheme();
        return;
      }
      if (command.actionId === "open-donate") {
        window.open(DONATE_URL, "_blank", "noopener,noreferrer");
        return;
      }
      if (command.href) {
        router.push(command.href);
      }
    },
    [router]
  );

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((idx) => Math.min(ranked.length - 1, idx + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((idx) => Math.max(0, idx - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = ranked[activeIndex];
      if (command) runCommand(command);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/70 px-4 pt-[14vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Search channels, tools, settings…"
          aria-controls={listboxId}
          aria-activedescendant={ranked[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
          className="w-full bg-transparent px-5 py-4 text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        />
        <ul
          id={listboxId}
          role="listbox"
          className="max-h-[50vh] divide-y divide-zinc-800 overflow-y-auto"
        >
          {ranked.length === 0 ? (
            <li className="px-5 py-4 text-sm text-zinc-500">No matches.</li>
          ) : (
            ranked.map((command, idx) => {
              const active = idx === activeIndex;
              return (
                <li
                  key={command.id}
                  id={`${listboxId}-${idx}`}
                  role="option"
                  aria-selected={active}
                >
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => runCommand(command)}
                    className={`flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm transition ${
                      active ? "bg-violet-500/10 text-zinc-50" : "text-zinc-200"
                    }`}
                  >
                    <span className="flex flex-col">
                      <span>{command.title}</span>
                      <span className="text-xs text-zinc-500">{command.group}</span>
                    </span>
                    {command.hint ? (
                      <span className="font-mono text-[11px] text-zinc-500">{command.hint}</span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <p className="border-t border-zinc-800 bg-zinc-950/50 px-5 py-2 text-[11px] text-zinc-500">
          ↑↓ to move · Enter to run · Esc to close · ⌘K to reopen
        </p>
      </div>
    </div>
  );
}
