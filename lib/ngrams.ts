import { YouTubeVideo } from "@/types/youtube";

export interface NgramEntry {
  phrase: string;
  count: number;
  /** Sum of view counts for videos whose (normalised) title contains this phrase. */
  weightedViews: number;
}

export interface ExtractOptions {
  /** n-gram length (e.g. 1 = unigrams, 2 = bigrams). */
  n: number;
  /** Override the built-in English stopword list. */
  stopwords?: Iterable<string>;
  /** Drop phrases that appear fewer than this many times. Default 2. */
  minCount?: number;
  /** Cap on how many entries to return (after sorting). Default 20. */
  limit?: number;
}

/**
 * English stopwords deliberately kept small. Exported so tests and callers can
 * build their own filter lists on top.
 */
export const DEFAULT_STOPWORDS: ReadonlySet<string> = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "so", "as", "at",
  "by", "for", "from", "in", "into", "of", "on", "onto", "to", "with",
  "is", "are", "was", "were", "be", "been", "being", "this", "that",
  "these", "those", "it", "its", "i", "you", "your", "we", "our", "they",
  "them", "their", "my", "me", "us", "he", "she", "him", "her", "his",
  "hers", "do", "does", "did", "will", "would", "can", "could", "should",
  "shall", "may", "might", "have", "has", "had", "not", "no", "yes",
  "up", "down", "out", "off", "over", "under", "again", "just", "only",
  "also", "how", "why", "when", "where", "what", "which", "who", "whom",
]);

/** Lowercase + strip anything that isn't a letter/number/space. */
function normaliseTitle(raw: string): string[] {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function ngramsFromTokens(tokens: string[], n: number): string[] {
  if (n <= 0 || tokens.length < n) return [];
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

/**
 * Frequency + view-weighted ranking of phrases pulled from video titles.
 *
 * Pure / deterministic given the inputs. "which phrase actually earned the
 * channel views" wins over pure frequency — we rank first by `weightedViews`,
 * tie-break by `count`, then lexicographically.
 */
export function extractNgrams(
  videos: YouTubeVideo[],
  options: ExtractOptions
): NgramEntry[] {
  const n = options.n;
  if (!Number.isFinite(n) || n <= 0) return [];
  const minCount = options.minCount ?? 2;
  const limit = options.limit ?? 20;
  const stopwords = new Set(
    options.stopwords ? [...options.stopwords] : DEFAULT_STOPWORDS
  );

  const counts = new Map<string, number>();
  const weighted = new Map<string, number>();

  for (const video of videos) {
    const tokens = normaliseTitle(video.title);
    const phrases = ngramsFromTokens(tokens, n);
    if (phrases.length === 0) continue;
    const seenInTitle = new Set<string>();
    for (const phrase of phrases) {
      if (n === 1 && stopwords.has(phrase)) continue;
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
      // weightedViews counts each title once, not each occurrence of the phrase.
      if (!seenInTitle.has(phrase)) {
        seenInTitle.add(phrase);
        weighted.set(phrase, (weighted.get(phrase) ?? 0) + (video.viewCount || 0));
      }
    }
  }

  const entries: NgramEntry[] = [];
  for (const [phrase, count] of counts) {
    if (count < minCount) continue;
    entries.push({
      phrase,
      count,
      // `counts` and `weighted` are populated in lock-step, so a miss here is
      // impossible — cast rather than carry a dead fallback that v8 can't prove.
      weightedViews: weighted.get(phrase) as number,
    });
  }

  entries.sort((a, b) => {
    if (b.weightedViews !== a.weightedViews) return b.weightedViews - a.weightedViews;
    if (b.count !== a.count) return b.count - a.count;
    return a.phrase.localeCompare(b.phrase);
  });

  return entries.slice(0, limit);
}
