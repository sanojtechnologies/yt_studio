/**
 * Command palette domain logic. Pure functions only — the actual ⌘K UI lives
 * in `components/CommandPalette.tsx`, which composes these helpers with React
 * state and a router. Keeping the matcher here makes ranking decisions
 * deterministic and unit-testable.
 */

export type CommandGroup = "Navigate" | "Studio" | "Channels" | "Settings";

export interface Command {
  id: string;
  title: string;
  /** Optional alternate words used by the matcher; lower-case recommended. */
  keywords?: string[];
  /** Group label rendered above the command in the palette. */
  group: CommandGroup;
  /** When set, the palette navigates to this href on selection. */
  href?: string;
  /** Optional client-side action; fires before navigation when both set. */
  actionId?: string;
  /** Optional secondary text rendered to the right of the title. */
  hint?: string;
}

export interface RankedCommand extends Command {
  /** Lower is better. */
  score: number;
}

export const STATIC_COMMANDS: Command[] = [
  { id: "nav.getting-started", title: "Getting started guide", group: "Navigate", href: "/getting-started", keywords: ["help", "how", "tutorial", "guide", "docs", "beginner", "onboarding", "setup"] },
  { id: "nav.lookup", title: "Channel lookup", group: "Navigate", href: "/lookup", keywords: ["search", "channel", "find"] },
  { id: "nav.compare", title: "Compare channels", group: "Navigate", href: "/compare", keywords: ["versus", "vs", "side", "diff"] },
  { id: "nav.history", title: "Recent channels", group: "Navigate", href: "/history", keywords: ["history", "previous", "saved"] },
  { id: "nav.studio", title: "Creator Studio", group: "Studio", href: "/studio", keywords: ["ai", "tools"] },
  { id: "studio.prepublish", title: "Pre-publish analyzer", group: "Studio", href: "/studio/prepublish", keywords: ["prepublish", "draft", "unpublished", "metadata", "thumbnail", "before publish"] },
  { id: "studio.titles", title: "Title Lab", group: "Studio", href: "/studio/titles", keywords: ["title", "headline", "name"] },
  { id: "studio.hook", title: "Hooks, description, chapters", group: "Studio", href: "/studio/hook", keywords: ["hook", "description", "chapters", "intro", "open"] },
  { id: "studio.thumbnails", title: "Thumbnail generator", group: "Studio", href: "/studio/thumbnails", keywords: ["thumb", "thumbnail", "image", "art"] },
  { id: "studio.clusters", title: "Topic clusters", group: "Studio", href: "/studio/clusters", keywords: ["topics", "themes", "embeddings", "group"] },
  { id: "studio.script", title: "Script outline generator", group: "Studio", href: "/studio/script", keywords: ["script", "outline", "beats", "write", "draft"] },
  { id: "studio.ab-title", title: "A/B title scorer", group: "Studio", href: "/studio/ab-title", keywords: ["ab", "title", "compare", "score", "versus"] },
  { id: "studio.ab-thumbnail", title: "A/B thumbnail comparator", group: "Studio", href: "/studio/ab-thumbnail", keywords: ["ab", "thumbnail", "compare", "image", "versus"] },
  { id: "compare.gap", title: "Competitor gap analysis", group: "Studio", href: "/compare/gap", keywords: ["gap", "competitor", "missing", "overlap", "topics"] },
  { id: "settings.keys", title: "Manage API keys", group: "Settings", href: "/keys", keywords: ["keys", "api", "tokens", "byok"] },
  { id: "settings.theme", title: "Toggle theme (light / dark)", group: "Settings", actionId: "toggle-theme", keywords: ["dark", "light", "appearance"] },
  { id: "settings.donate", title: "Support this project", group: "Settings", actionId: "open-donate", keywords: ["donate", "tip", "paypal", "support", "contribute", "thanks"], hint: "PayPal" },
];

const PREFIX_BONUS = 0;
const WORD_START_BONUS = 1;
const SUBSTRING_BONUS = 2;
const FUZZY_BONUS = 3;
const NO_MATCH = Number.POSITIVE_INFINITY;

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Score a single command against a normalised query. Lower is better; a
 * sentinel of `+Infinity` means no match. Scoring layers:
 *   - 0  prefix of title
 *   - 1  start of any word in the title or any keyword
 *   - 2  substring anywhere in the title or keywords
 *   - 3  in-order subsequence match in the title (lightweight fuzzy)
 */
export function scoreCommand(command: Command, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const title = command.title.toLowerCase();
  if (title.startsWith(q)) return PREFIX_BONUS;

  const haystacks = [title, ...(command.keywords ?? []).map((k) => k.toLowerCase())];

  for (const hay of haystacks) {
    for (const word of tokenize(hay)) {
      if (word.startsWith(q)) return WORD_START_BONUS;
    }
  }

  for (const hay of haystacks) {
    if (hay.includes(q)) return SUBSTRING_BONUS;
  }

  // Lightweight fuzzy: every char of `q` must appear in `title` in order.
  let i = 0;
  for (const ch of title) {
    if (ch === q[i]) i++;
    if (i === q.length) return FUZZY_BONUS;
  }

  return NO_MATCH;
}

export function filterCommands(
  commands: Command[],
  query: string,
  limit = 20
): RankedCommand[] {
  return commands
    .map((command) => ({ ...command, score: scoreCommand(command, query) }))
    .filter((entry) => entry.score !== NO_MATCH)
    .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export interface ChannelLikeEntry {
  channelId: string;
  channelTitle?: string;
}

/**
 * Promote recently-analysed channels to first-class commands so users can
 * jump back to any of them via the palette.
 */
export function buildChannelCommands(entries: ChannelLikeEntry[]): Command[] {
  return entries
    .filter((entry) => entry?.channelId)
    .map((entry) => ({
      id: `channel:${entry.channelId}`,
      title: entry.channelTitle?.trim() || entry.channelId,
      group: "Channels" as const,
      href: `/dashboard/${entry.channelId}`,
      keywords: [entry.channelId],
      hint: entry.channelId,
    }));
}
