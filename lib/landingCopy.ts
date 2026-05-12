/**
 * Landing copy + link inventory for `app/page.tsx`.
 *
 * Extracted into `lib/` so the SEO contract (H1 length, body word count,
 * internal-link breadth, share-intent presence) is unit-testable without
 * a DOM layer. See PRD § 4.1 + § 4.8.
 */

export const LANDING_PAGE_TITLE =
  "YT Studio Analyzer — YouTube Analytics & Creator Studio Tools";

export const LANDING_META_DESCRIPTION =
  "YT Studio Analyzer helps YouTube creators turn channel analytics, thumbnail signals, and packaging insights into the next upload — using your own YouTube Data API and Gemini keys.";

export const LANDING_H1 = "YT Studio Analyzer — Smarter YouTube Channel Insights";

export const LANDING_HERO_TAGLINE =
  "Bring your own YouTube Data API and Gemini keys to analyze any YouTube channel, score thumbnails, and ship the next upload with confidence.";

// Long-form body content. Each entry is a single paragraph rendered as a
// separate <p> so the page hits a healthy paragraph count for SEO crawlers.
export const LANDING_BODY_PARAGRAPHS: readonly string[] = [
  "YT Studio Analyzer is a bring-your-own-API-key creator studio that turns raw YouTube data into clear, decision-grade insights about channel performance, packaging quality, and growth trajectory. Add your own YouTube Data API v3 key and Gemini key, then explore subscriber trends, engagement rates, and the best publish windows for your audience without ever exposing your credentials to a third-party server or shared backend.",
  "Inside YT Studio Analyzer you can analyze any public YouTube channel, compare it side by side against up to four competitors, score thumbnails with Gemini vision, generate ready-to-publish titles, descriptions, and tags, and surface the topical clusters that are quietly driving most of your views. The dashboard converts every metric into plain-language interpretation so creators of every experience level know exactly which lever to pull next.",
  "Start by adding your two API keys on the keys page, look up a channel from a URL, handle, or channel ID, and let the dashboard hydrate with the latest fifty videos. From there, jump into the Creator Studio to ideate the next upload, draft a script outline, pre-publish-check a draft, or run an A/B comparison on competing titles and thumbnails — every Studio tool reuses the same analysis pipeline so the verdict you get in one surface stays consistent everywhere else.",
  "Because YT Studio Analyzer is fully bring-your-own-key, the project stays free for individual creators, keeps YouTube and Gemini usage transparent inside your own Google Cloud billing console, and lets teams self-host the whole experience without trusting a SaaS middleman with their channel data or audience information.",
] as const;

export interface LandingInternalLink {
  href: string;
  label: string;
}

// Public, discoverable routes — mirrors `app/sitemap.ts` so crawlers see a
// consistent internal-link graph between the landing page and the sitemap.
export const LANDING_INTERNAL_LINKS: readonly LandingInternalLink[] = [
  { href: "/getting-started", label: "Getting Started Guide" },
  { href: "/keys", label: "Manage API Keys" },
  { href: "/lookup", label: "Channel Lookup" },
  { href: "/compare", label: "Compare Channels" },
  { href: "/compare/gap", label: "Competitor Gap Analysis" },
  { href: "/history", label: "Recent Channels" },
  { href: "/studio", label: "Creator Studio" },
  { href: "/studio/ideate", label: "Video Ideate" },
  { href: "/studio/titles", label: "Title Lab" },
  { href: "/studio/hook", label: "Hook + Description" },
  { href: "/studio/thumbnails", label: "Thumbnail Generator" },
  { href: "/studio/clusters", label: "Topic Clusters" },
  { href: "/studio/script", label: "Script Doctor" },
  { href: "/studio/ab-title", label: "A/B Title Scorer" },
  { href: "/studio/ab-thumbnail", label: "A/B Thumbnail Comparator" },
  { href: "/studio/prepublish", label: "Pre-Publish Analyzer" },
] as const;

export type ShareIntent = "twitter" | "linkedin" | "facebook" | "reddit";

export interface LandingShareLink {
  id: ShareIntent;
  label: string;
}

export const LANDING_SHARE_LINKS: readonly LandingShareLink[] = [
  { id: "twitter", label: "Share on X" },
  { id: "linkedin", label: "Share on LinkedIn" },
  { id: "facebook", label: "Share on Facebook" },
  { id: "reddit", label: "Share on Reddit" },
] as const;

export const LANDING_SHARE_TEXT =
  "YT Studio Analyzer — bring-your-own-API-key YouTube analytics, thumbnail scoring, and AI creator tools.";

/**
 * Build a social share-intent URL. Pure helper so the page component stays
 * trivial and the URL shape is covered by unit tests instead of a snapshot.
 */
export function buildShareUrl(
  intent: ShareIntent,
  params: { url: string; text: string },
): string {
  const u = encodeURIComponent(params.url);
  const t = encodeURIComponent(params.text);
  switch (intent) {
    case "twitter":
      return `https://twitter.com/intent/tweet?url=${u}&text=${t}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "reddit":
      return `https://www.reddit.com/submit?url=${u}&title=${t}`;
  }
}
