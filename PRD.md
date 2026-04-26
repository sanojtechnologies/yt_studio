# YT Studio Analyzer — Product Requirements Document

> **Status**: Living document. Version 1.0 (2026-04-21).
> **Owner**: Project owner (you).
> **Source of truth**: This file. All other docs (README, tests/README.md, component comments) must stay consistent with it.

---

## 0. Maintenance Protocol (agents & humans, read first)

This PRD is the contract between the product and the implementation. Whenever you change the code, you MUST also keep this document and the test suite in sync.

**Before you finish any change, verify all three legs of the triangle:**

1. **PRD updated** — Add/modify/remove the relevant section in this file. Bump the change log at the bottom with date, author, and one-line summary.
2. **Tests updated** — Every requirement in this PRD must map to at least one automated test (unit, integration, or live). New/changed behavior requires new/changed tests. Removed behavior requires removing the stale tests.
3. **Code updated** — The implementation must match both of the above.

**Non-negotiables:**

- Never ship a feature without a corresponding test. The existing coverage thresholds in `vitest.config.ts` (80% lines / 80% stmts / 80% funcs / 70% branches over `lib/**` + `app/api/**`) are a floor, not a ceiling.
- Never weaken a coverage threshold to make a change land. Add the tests instead.
- Never commit real API keys. Test keys live only in `.env.test.local` (git-ignored).
- Never introduce a new external dependency without noting it here (§ 5 External Integrations) and explaining why a built-in wasn't enough.
- Error messages shipped to the UI must be listed under § 8 "Error Catalogue" with exact strings — tests assert against them.

**When in doubt, update this PRD first, then write failing tests, then implement.**

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Personas & Use Cases](#2-personas--use-cases)
3. [Architecture](#3-architecture)
4. [Feature Specifications](#4-feature-specifications)
5. [External Integrations](#5-external-integrations)
6. [Data Contracts](#6-data-contracts)
7. [Security & Privacy](#7-security--privacy)
8. [Error Catalogue](#8-error-catalogue)
9. [Testing Strategy](#9-testing-strategy)
10. [Performance & Caching](#10-performance--caching)
11. [Dependencies](#11-dependencies)
12. [Glossary](#12-glossary)
13. [Change Log](#13-change-log)

---

## 1. Product Overview

**YT Studio Analyzer** is a public web app that lets anyone analyze any public YouTube channel using their own API keys. It returns content-strategy insights (what works / what doesn't / gaps / best posting schedule) and per-thumbnail packaging analysis (face/emotion, readability, contrast, curiosity gap, improvement suggestions).

### 1.1 Value proposition

- **Zero-setup creators' tool.** No account, no billing on our side, no server-stored data.
- **Powered by the official Google stack.** YouTube Data API v3 for raw data, Google Gemini 2.5 Flash for AI analysis.
- **BYOK (Bring Your Own Key).** Users supply and pay for their own Google keys. The app never holds secrets.

### 1.2 Goals

- G1 Let a creator paste a URL / handle / channel ID and reach a fully-populated dashboard in under 10 seconds (with warm cache).
- G2 Summarize the last 20 videos into actionable content-strategy insights via Gemini.
- G3 Score and critique a specific thumbnail against packaging best practices via Gemini Vision.
- G4 Keep the app deployable as a fully public website without exposing the owner's quota.

### 1.3 Non-goals (v1)

- No scheduled reporting, email digests, or notifications.
- No auth, accounts, or server-side persistence.
- No support for private/unlisted videos.
- No write actions back to YouTube (this is read-only analytics).

---

## 2. Personas & Use Cases

### 2.1 Persona — "Solo creator"

Runs a mid-size YouTube channel. Wants quick, honest feedback on what's working and what their next 5 videos should be about.

**Primary journeys:**

1. Lands on `/`, sees BYOK status, clicks through to `/keys`, saves both keys.
2. Navigates to `/lookup`, pastes their own channel URL, lands on `/dashboard/[id]`.
3. Scans stats + chart, clicks a few underperforming videos to see thumbnail critique.
4. Comes back a week later via `/history` without re-typing the channel.

### 2.2 Persona — "Strategist / consultant"

Analyzes several clients' channels back-to-back. Needs the app to cache aggressively so 2nd/3rd pass is instant, and to surface clear error messages when keys/quota misbehave.

---

## 3. Architecture

### 3.1 Runtime & frameworks

- **Next.js 14 App Router** (`next@14.2.5`), React 18, TypeScript 5, Tailwind CSS.
- **All rendering is dynamic.** No SSG / no ISR for user data. Pages are server components; they read BYOK cookies at request time.
- **API routes** live under `app/api/*/route.ts` and are pure request → response handlers (no global state beyond an in-memory cache).

### 3.2 Directory map

```
app/                      # Next.js pages & route handlers
  page.tsx                # Landing (/) — key status + CTA
  robots.ts               # Crawler policy (allow public pages, block private/API paths)
  sitemap.ts              # Public-route sitemap.xml generator
  manifest.ts             # Web app manifest
  getting-started/page.tsx # Beginner walkthrough (/getting-started)
  lookup/page.tsx         # Channel search (/lookup)
  keys/page.tsx           # API-key overview (/keys)
  keys/youtube/page.tsx   # Edit YouTube key
  keys/gemini/page.tsx    # Edit Gemini key
  dashboard/[channelId]/page.tsx  # Main analytics dashboard
  history/page.tsx        # Recent channels (localStorage)
  history/layout.tsx      # noindex metadata wrapper for /history
  compare/page.tsx        # Side-by-side multi-channel comparison
  studio/page.tsx         # Creator Studio index
  studio/titles/page.tsx  # Title Lab
  studio/hook/page.tsx    # Hook + description + chapters generator
  studio/thumbnails/page.tsx # Thumbnail generator
  studio/clusters/page.tsx   # Topic clusters (+ inline "Ideate" per cluster)
  studio/script/page.tsx     # Script doctor — streaming script outline
  studio/ab-title/page.tsx   # A/B title scorer
  studio/ab-thumbnail/page.tsx # A/B thumbnail comparator (upload or URL pair)
  compare/gap/page.tsx       # Competitor gap analysis on already-compared ids
  og/route.tsx            # Open Graph image endpoint
  api/
    channel/route.ts      # Resolve URL/@handle/UC-id → channel
    videos/route.ts       # Placeholder endpoint (reserved)
    analyze/route.ts      # POST Gemini content analysis (streams NDJSON)
    thumbnail/route.ts    # POST Gemini vision on a thumbnail
    video-metadata/route.ts # POST Gemini review of a video's title + description + tags
    validate-key/route.ts # POST probe YouTube or Gemini for key validity
    compare/route.ts      # GET aggregate stats + top videos for N channels
    compare/gap/route.ts  # GET YouTube rows → Gemini gap analysis
    studio/titles/route.ts     # POST Gemini title candidates
    studio/hook/route.ts       # POST Gemini hook/description/tags/chapters
    studio/clusters/route.ts   # POST embed + agglomerative cluster of titles
    studio/clusters/ideas/route.ts # POST Gemini ideas for a single cluster
    studio/thumbnails/route.ts # POST Gemini Imagen thumbnail variants
    studio/script/route.ts     # POST Gemini script outline (NDJSON stream)
    studio/ab-title/route.ts   # POST Gemini title A/B scoring
    studio/ab-thumbnail/route.ts # POST Gemini vision A/B (multipart OR JSON URLs)
components/               # React UI (client & server)
lib/                      # Pure business logic (unit-testable, no Next imports)
  youtube.ts              # Google YouTube Data API v3 client + cache
  gemini.ts               # Google Gen AI client + response helpers
  embeddings.ts           # Thin adapter for `text-embedding-004`
  stats.ts                # Dashboard stats math (pure)
  channelResolver.ts      # parseChannelInput (pure)
  analyzePrompt.ts        # summarize + buildAnalyzePrompt + ANALYZE_SCHEMA
  thumbnailPrompt.ts      # isValidHttpUrl + buildThumbnailPrompt + THUMBNAIL_SCHEMA
  metadataPrompt.ts       # buildMetadataPrompt + METADATA_SCHEMA + METADATA_LIMITS + normaliseTags + isMetadataAnalysis
  titleLabPrompt.ts       # buildTitleLabPrompt + TITLE_LAB_SCHEMA
  hookPrompt.ts           # buildHookPrompt + HOOK_SCHEMA + isValidTimestamp
  thumbnailGenPrompt.ts   # buildThumbnailGenPrompt
  cluster.ts              # cosineSimilarity + clusterByEmbedding + summarizeClusters
  csv.ts                  # videosToCsv (CSV escaping + UTF-8 BOM)
  outliers.ts             # computeOutliers (view-count outliers; delegates to robustStats)
  robustStats.ts          # median + computeRobustStats + robustZScore (MAD-based primitives)
  engagement.ts           # computeEngagementReport (format-aware, channel-relative buckets)
  analysisCache.ts        # Generic createAnalysisCache<T> factory (shared by thumbnail + metadata caches)
  thumbnailCache.ts       # Per-video localStorage cache for Gemini thumbnail analyses (24h TTL)
  metadataCache.ts        # Per-video localStorage cache for Gemini metadata analyses (24h TTL)
  heatmap.ts              # buildPublishHeatmap (day×hour grid, configurable timezone)
  timezone.ts             # localDayHour + browser timezone helpers
  compareStats.ts         # buildComparisonRow + parseCompareIds
  commands.ts             # Command palette domain logic (filterCommands etc.)
  dashboardSnapshot.ts    # Snapshot + DashboardHistory (v2) + migration + cap/dedupe
  idb.ts                  # Browser-only IndexedDB adapter for history (+ compat wrappers)
  timeSeries.ts           # summarizeHistory → GrowthPoint[] + latestDelta
  breakout.ts             # detectBreakouts (min-views + delta-pct ranking)
  duration.ts             # parseIso8601DurationSeconds + classifyVideoFormat (short/long)
  shortsProbe.ts          # Server-side /shorts/{id} probe → isShort (24h TTL cache)
  ngrams.ts               # extractNgrams (stopwords + weightedViews)
  scriptPrompt.ts         # buildScriptPrompt + SCRIPT_SCHEMA + SCRIPT_LIMITS
  abTitlePrompt.ts        # buildAbTitlePrompt + AB_TITLE_SCHEMA + AB_TITLE_LIMITS
  abThumbnailPrompt.ts    # buildAbThumbnailPrompt + AB_THUMBNAIL_SCHEMA + image helpers
  compareGapPrompt.ts     # buildCompareGapPrompt + selectGapChannels + COMPARE_GAP_SCHEMA
  clusterIdeasPrompt.ts   # buildClusterIdeasPrompt + CLUSTER_IDEAS_SCHEMA + clampIdeaCount
  donate.ts               # resolveDonateUrl + DONATE_URL (env-aware, https-only)
  telemetry.ts            # serializeError + reportError seam
  siteUrl.ts              # Canonical NEXT_PUBLIC_SITE_URL parser + fallback
  apiKey.ts               # Server-side cookie readers (BYOK)
  clientApiKey.ts         # Client-side key storage + UI helpers
  errors.ts               # YouTube error classes + classifiers
types/youtube.ts          # Public domain types
tests/                    # See § 9 Testing Strategy
  e2e/                    # Playwright browser flows (BYOK gating, palette, navigation)
```

### 3.3 Separation of concerns

- **`lib/` must remain free of `next/*` imports** (except `apiKey.ts` and `clientApiKey.ts`, which are by design the I/O boundary). This is what makes `lib/` unit-testable without Next runtime.
- **Prompt strings and JSON schemas** live in `lib/analyzePrompt.ts` / `lib/thumbnailPrompt.ts`. Routes import and compose; they don't construct prompts inline.
- **Cache** lives in `lib/youtube.ts` as a module-level `Map`, keyed by a SHA-256 prefix of the API key so one visitor never sees another visitor's cached data in a multi-tenant deployment.

---

## 4. Feature Specifications

Every feature below MUST be backed by at least one test. The "Tests" line is the binding contract — if you change the feature, you change those tests (and vice versa).

---

### 4.1 Landing page — `/` (`app/page.tsx`)

**Purpose**: Show BYOK status and guard access to the rest of the app until both keys are present.

**Requirements:**

- R1 Read the YouTube key cookie (`yt_api_key`) and Gemini key cookie (`gemini_api_key`) on the server.
- R2 Render two status rows: "YouTube Data API v3 Key — Configured/Missing" and "Gemini API Key — Configured/Missing".
- R3 The "Open Channel Lookup" CTA (linking to `/lookup`) is **only visible when both keys are configured**. Otherwise show the helper copy "Add and validate both keys to unlock channel lookup."
- R4 A "Manage API Keys" link (to `/keys`) is always visible.
- R5 A "View recent channels" link (to `/history`) is always visible.
- R6 A "Compare channels" link (to `/compare`) and a "Creator Studio" link (to `/studio`) are always visible in the landing quick-links row.
- R7 A "New here? Read the quick guide" link points to `/getting-started` (see § 4.14) from the hero copy so first-time users can bail out to the walkthrough before hitting the keys page.

**Tests**: Manual verification; copy strings are asserted via the landing integration flow on CI when a UI test layer is added. (Currently uncovered by automated tests — see § 9.5 Known Gaps.)

---

### 4.2 API key management

#### 4.2.1 Overview page — `/keys` (`app/keys/page.tsx`)

- R1 Server-side read the two cookies and render two rows, each with configured state and a link to the dedicated edit page.
- R2 Back link to `/`.

#### 4.2.2 Edit pages — `/keys/youtube` and `/keys/gemini`

Implemented via the shared `components/KeyEditor.tsx` with an `id` prop.

- R1 On mount, read the key (if any) from `localStorage` (`ytstudio:ytKey` / `ytstudio:geminiKey`) and show it masked (`maskKey`).
- R2 Offer Edit, Delete, and Save actions.
- R3 **Save flow:**
  1. Client-side format check — must match `/^AIza[0-9A-Za-z_-]{20,}$/`. If not, show the inline error "Expected a Google API key starting with AIza."
  2. POST to `/api/validate-key` with `{ id, key }` — must return `{ ok: true }` (or `{ ok: true, warning }` for quota-exhausted YouTube keys).
  3. On success, write to `localStorage` AND set the cookie (`Path=/; Max-Age=31536000; SameSite=Lax; Secure` on https).
  4. Dispatch a `CustomEvent('ytstudio:apikey-change', { detail: { id, present: true } })`.
  5. Show success copy; if a warning is present, also show it in amber.
  6. `router.refresh()` so server components see the new cookie.
- R4 **Delete flow:** remove from `localStorage`, clear cookie, emit the change event with `present: false`, refresh.

**Tests**: `tests/integration/api-validate-key.test.ts` covers the server side (see also § 4.3 for validate-key). The `KeyEditor` component itself is not yet covered by DOM tests (§ 9.5).

#### 4.2.3 Validate endpoint — `POST /api/validate-key`

Implemented in `app/api/validate-key/route.ts`.

**Request body**: `{ id: "youtube" | "gemini", key: string }`.
**Response**: `{ ok: boolean, warning?: string, error?: string }`.

| Scenario                                          | Response (status 200)                                                      |
|---------------------------------------------------|----------------------------------------------------------------------------|
| `id === "youtube"`, key accepted                  | `{ ok: true }`                                                             |
| `id === "youtube"`, key accepted but quota = 0    | `{ ok: true, warning: "Key authenticates, but the project's daily quota is currently exhausted. Lookups may fail until it resets." }` |
| `id === "youtube"`, any other failure             | `{ ok: false, error: "YouTube rejected this key. Double-check the value and that YouTube Data API v3 is enabled." }` |
| `id === "gemini"`, `generativelanguage` 200       | `{ ok: true }`                                                             |
| `id === "gemini"`, 400/401/403                    | `{ ok: false, error: "Gemini rejected this key." }`                        |
| `id === "gemini"`, 5xx                            | `{ ok: false, error: "Gemini responded with HTTP <code>." }`               |
| `id === "gemini"`, network fails                  | `{ ok: false, error: "Could not reach Gemini to validate the key." }`      |
| Missing/empty body key                            | 400 `{ ok: false, error: "Key is required" }`                              |
| Unknown `id`                                      | 400 `{ ok: false, error: "Unknown key id" }`                               |
| Invalid JSON                                      | 400 `{ ok: false, error: "Invalid JSON body" }`                            |

**Tests**: `tests/integration/api-validate-key.test.ts` (11 scenarios — all of the above).

---

### 4.3 Channel lookup — `/lookup` + `GET /api/channel`

**Page** (`app/lookup/page.tsx`): server-side guard that redirects to `/keys` if either cookie is missing. Renders `components/LookupForm.tsx`.

**Form requirements:**

- R1 Accept a URL, `@handle`, or channel ID as input.
- R2 Show 3 example channels as clickable chips.
- R3 On submit, call `GET /api/channel?q=<input>`; on 200 navigate to `/dashboard/<channelId>`; on error show the provider message.
- R4 "Manage API Keys" link to `/keys` is visible on the page.

**API** (`app/api/channel/route.ts`):

- R5 Read the YouTube key from cookie; **401** with `"Add your YouTube Data API v3 key in the API Keys panel to continue."` if missing.
- R6 Parse input via `parseChannelInput` (`lib/channelResolver.ts`):
  - Strings starting with `@` → `{ handle }`.
  - URLs with `/@name` or `/channel/UC…` → handle / channel id.
  - Raw `UC[\w-]{20,}` → channel id.
  - Bare `[\w.-]+` → handle.
  - Otherwise `{}`.
- R7 If neither `channelId` nor `handle` resolved → 400 `"Invalid channel input"`.
- R8 If handle input: first try `fetch https://www.youtube.com/@{handle}` and regex for `"channelId":"(UC…)"`. If that fails (network error, non-200, or no match), fall back to `getChannelByHandle`.
- R9 Any `YouTubeQuotaExceededError` → 429 with the canonical quota message (§ 8).
- R10 Any `YouTubeInvalidApiKeyError` → 400 with the canonical invalid-key message (§ 8).
- R11 Any other thrown error → 500 `"Failed to resolve channel"`.
- R12 No channel resolved → 404 `"Channel not found"`.

**Tests**:
- `tests/unit/channelResolver.test.ts` — 7 cases covering every branch of `parseChannelInput`.
- `tests/integration/api-channel.test.ts` — 10 scenarios including HTML scrape fallback, HTML non-OK fallback, HTML no-match fallback, all error codes.
- `tests/live/learnwithmanoj.test.ts` — resolves `@LearnwithManoj` end-to-end.

---

### 4.4 Dashboard — `/dashboard/[channelId]` (`app/dashboard/[channelId]/page.tsx`)

Server component that fetches channel + videos in parallel and streams UI sections into Suspense boundaries.

- R1 If the YouTube key cookie is missing, render `<ApiKeyMissing />` (a prompt linking to `/keys`).
- R2 Fetch the channel via `getChannelById(apiKey, channelId)` and the latest 50 videos via `getChannelVideos(apiKey, channelId, 50)` **in parallel**. If channel is null, call `notFound()`.
- R3 Top nav row:
  - Left: `← Analyze another channel` link to `/lookup`.
  - Right: `Recent` link to `/history`, `Manage API Keys` link to `/keys`.
- R4 Sections rendered in order, each in its own `<Suspense>` with a skeleton fallback:
  1. `ChannelHeader` — avatar, title, compact subscriber count, compact total view count.
  2. `StatsCards` — 4 cards: avg views, engagement rate, uploads/week, best day of week. Math is in `lib/stats.ts`. The card is a client component: it renders the server-computed UTC `bestDay` on first paint to match SSR, then re-buckets publish dates in the browser's resolved IANA timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone` and swaps in the local-timezone result after hydration. No visible "UTC" label is shown to the user.
  3. `PerformanceChart` — 50-point line chart of view counts, oldest → newest, self-measured size via `ResizeObserver` (no `ResponsiveContainer`).
  4. `VideoGrid` — thumbnail, title, views, engagement badge (channel-relative; see § 4.10 "Engagement classification"). Clicking a card opens `ThumbnailAnalyzer`.
- R5 `ChannelHistoryTracker` runs inside `HeaderSection` once the channel resolves and writes `{ channelId, channelTitle, thumbnailUrl, savedAt }` to `localStorage['ytstudio:history']` (capped at 12 entries, most-recent first, de-duped by `channelId`).

**Stats contract (`DashboardStats`)**:

```ts
{
  avgViews: number;               // sum(viewCount) / count
  engagementRate: number;         // (sum(likes+comments) / sum(views)) * 100; 0 when sum(views) === 0
  uploadFrequencyPerWeek: number; // Recent cadence; see "Upload frequency formula" below. 0 when < 2 valid dates in the sample.
  bestDay: "Sunday"..."Saturday" | "N/A"; // Weekday with highest summed views; bucketed in the caller-supplied IANA `timeZone` (defaults to UTC for server renders). "N/A" when empty.
}
```

**Upload frequency formula — design notes:**

- Goal: reflect the creator's **recent cadence** (what they're doing right now), not a lifetime average over the 50-video fetch window. Mixing a daily-poster's last month with a decade-old back catalogue collapses the metric to near zero and was the v1 failure mode reported on 2026-04-21.
- Algorithm (`recentCadencePerWeek` in `lib/stats.ts`):
  1. Drop videos with unparseable `publishedAt`, sort the rest chronologically.
  2. Anchor "now" at the **newest** remaining date (keeps the function pure — no `Date.now()` coupling, tests stay deterministic).
  3. Take the trailing **`RECENT_CADENCE_WINDOW_DAYS = 90`** window relative to that anchor. 90 days is the de-facto standard in creator analytics (matches YouTube Studio / Social Blade) — long enough to smooth over a few posting cycles, short enough that a long tail can't crush the denominator.
  4. If that window has < 2 videos, fall back to the last **`RECENT_CADENCE_FALLBACK_SAMPLE = 10`** uploads (or all of them if fewer). This keeps the number honest for returning-from-hiatus creators instead of silently rendering 0.
  5. Apply `(N − 1) / spanDays × 7`. N publishes form N − 1 intervals; `spanDays` is floored at 1 so a same-day burst doesn't divide by zero (the rate becomes `(N − 1) × 7` per week — honest about the burst but not predictive).
- Invalid dates are excluded from both the span and the interval count so a single bad row can't inflate the rate.
- The `StatsCards` UI exposes the window in a `title` tooltip on the "Upload Frequency" card so the number is self-explaining.
- Uses the newest-sample anchor rather than `Date.now()` so snapshot history (PRD § 4.15) can reconstruct past cadence deterministically from stored `DashboardHistory` entries.

**Tests**:
- `tests/unit/stats.test.ts` — cases incl. empty input, zero-views, invalid dates filter, best-day tie-break, and a timezone override case that proves the same UTC instant yields a different `bestDay` when bucketed in a non-UTC zone.
- `tests/unit/timezone.test.ts` — covers the `localDayHour` fast path (UTC), the Intl-based path (half-hour offsets, DST), the '24' midnight clamp, and the `getBrowserTimeZone` / `formatTimeZoneLabel` fallbacks (empty zone, Intl throws).
- Dashboard server component itself (React tree) is not unit tested; its math is covered via `stats.ts` and its data via `lib/youtube.ts` + live tests.

---

### 4.5 Video analyzer — `components/ThumbnailAnalyzer.tsx` + `POST /api/thumbnail` + `POST /api/video-metadata`

The component is still named `ThumbnailAnalyzer` for import compatibility, but it now hosts **two tabs**: `Thumbnail` (default) and `Metadata`. The modal shell owns focus trap, ESC-to-close, backdrop click, and the tab switcher; each tab delegates to its own panel component (`ThumbnailAnalysisPanel`, `MetadataAnalysisPanel`) so the panels, caches, and API calls are independent.

**Client modal** (`components/ThumbnailAnalyzer.tsx`):

- R1 Opens from a click on any card in `VideoGrid`. Receives the selected `YouTubeVideo`. **Opening the modal does NOT run any analysis** — each tab has its own primary action so Gemini calls are always intentional.
- R2 Always mounts with the Thumbnail tab active; switching tabs unmounts the inactive panel so no stale state leaks between videos.
- R3 Keyboard: ESC closes; Tab / Shift-Tab cycles focus inside the dialog; tabs are `role="tab"` with `aria-selected` and panels are `role="tabpanel"` linked by `aria-labelledby`.
- R4 Layout: sticky header with title + Close; tab bar below the header; scrollable body capped at `min(90vh, 48rem)`. Long outputs scroll — they never overflow the viewport.

**Thumbnail panel** (`components/ThumbnailAnalysisPanel.tsx`):

- R5 On activation, hydrate from `localStorage` via `readCachedAnalysis`. If a fresh (< 24 h) entry exists for `videoId`, render it immediately and show a "Cached <relative time> ago" hint; the primary action becomes "Re-analyze thumbnail". Cache misses leave the user in the idle state with a short explainer.
- R6 The "Analyze thumbnail" button POSTs to `/api/thumbnail` with `{ videoId, thumbnailUrl, title }`. On success, the result is written to `localStorage` via `writeCachedAnalysis` (24 h TTL) and rendered. The button is disabled while the request is in flight and when the video has no thumbnail.
- R7 If the video has no thumbnail, the button is disabled and clicking it surfaces `"This video does not have a thumbnail available."` — the API is never called.
- R8 Loading state shows `"Analyzing thumbnail with Gemini…"`.

**Metadata panel** (`components/MetadataAnalysisPanel.tsx`):

- R9 On activation, hydrate from `localStorage` via `readCachedMetadata`. Fresh entries render instantly with a "Cached <relative time> ago" hint and flip the button label to "Re-analyze metadata".
- R10 Displays the current title (with character count), description (truncated visually, not in the request), and tag list so the creator can see exactly what Gemini will review.
- R11 The "Analyze metadata" button POSTs to `/api/video-metadata` with `{ videoId, title, description, tags }`. Successful responses are cached (24 h, `ytstudio:meta:<videoId>`).
- R12 Results panel renders: an overall 1–10 packaging score with a colour-coded badge, paragraph feedback + 3 alternative titles, paragraph feedback + 3 concrete description edits, paragraph feedback + 5 suggested additional tags, and a highlighted "Top Recommendations" list of 3 prioritised action items.
- R13 Loading state shows `"Reviewing title, description and tags with Gemini…"`.

**Thumbnail API** (`app/api/thumbnail/route.ts`):

- R6 Read Gemini key cookie; 401 if missing with `"Add your Gemini API key in the API Keys panel to analyze thumbnails."`.
- R7 Body parse failure → 400 `"Invalid JSON body"`.
- R8 Missing `videoId | thumbnailUrl | title` → 400 `"videoId, thumbnailUrl, and title are required"`.
- R9 Non-http(s) `thumbnailUrl` → 400 `"Invalid thumbnailUrl"`.
- R10 Image fetch non-OK → 400 `"Failed to fetch thumbnail image"`.
- R11 Content-type not in `SUPPORTED_IMAGE_TYPES` (`image/jpeg | png | webp | heic | heif`) → 400 `"Unsupported image type: <value>"`.
- R12 Base64-encode the image and call Gemini `generateContent` with:
  - Model `gemini-2.5-flash`.
  - `temperature: 0.2`, `maxOutputTokens: 2048`.
  - `responseMimeType: "application/json"`.
  - `responseSchema: THUMBNAIL_SCHEMA`.
  - `thinkingConfig: { thinkingBudget: 0 }` (required — without this the model eats the entire output budget on thinking and returns empty text).
- R13 Extract text via `extractResponseText` (falls back to candidate parts).
- R14 Empty response → 502 `{ error: "Gemini returned an empty response", debug }`.
- R15 Unparseable JSON → 502 `{ error: "Gemini did not return valid JSON", raw, debug }`.
- R16 Success → 200 with `ThumbnailAnalysis` shape.

**Response schema `ThumbnailAnalysis`**:

```ts
{
  faceEmotionDetection: string;          // non-empty; plain language
  textReadabilityScore: number;          // integer 1..10
  colorContrastAssessment: string;       // non-empty
  titleCuriosityGapScore: number;        // integer 1..10
  improvementSuggestions: string[];      // length 3 preferred; validator requires ≥1
}
```

**Metadata API** (`app/api/video-metadata/route.ts`):

- R20 Read Gemini key cookie; 401 if missing with `"Add your Gemini API key in the API Keys panel to analyze video metadata."`.
- R21 Body parse failure → 400 `"Invalid JSON body"`.
- R22 Missing `videoId | title | description` → 400 `"videoId, title, and description are required"`. Empty description is allowed (Shorts often have none) — the `description` field must merely be present.
- R23 `title` longer than `METADATA_LIMITS.maxTitleLength` (500 chars) → 400 `"title exceeds maximum length of 500 characters"`.
- R24 `description` is trimmed and clamped to `METADATA_LIMITS.maxDescriptionLength` (10 000 chars) before being embedded in the prompt.
- R25 `tags` is optional; `normaliseTags` trims each entry, drops non-strings and empties, caps each tag at 100 chars, and truncates the list at 100 entries.
- R26 Call Gemini `generateContent` with model `gemini-2.5-flash`, `temperature: 0.3`, `maxOutputTokens: 2048`, `responseMimeType: "application/json"`, `responseSchema: METADATA_SCHEMA`, `thinkingConfig: { thinkingBudget: 0 }`.
- R27 Empty response → 502 `{ error: "Gemini returned an empty response", debug }`. Unparseable JSON → 502 `{ error: "Gemini did not return valid JSON", raw, debug }`. Success → 200 with `MetadataAnalysis` shape.

**Response schema `MetadataAnalysis`**:

```ts
{
  overallScore: number;              // integer 1..10 (composite packaging/SEO score)
  titleFeedback: string;             // 2-4 sentences, plain prose
  titleSuggestions: string[];        // exactly 3 alternative titles
  descriptionFeedback: string;       // 2-4 sentences
  descriptionSuggestions: string[];  // exactly 3 copy-pasteable edits
  tagsFeedback: string;              // 2-4 sentences
  suggestedTags: string[];           // exactly 5 additional tags (no duplicates)
  topRecommendations: string[];      // exactly 3 prioritised action items
}
```

**Shared cache factory** (`lib/analysisCache.ts`):

- Both caches below are produced by a generic `createAnalysisCache<T>({ prefix, ttlMs, isValidShape })` factory so the read / write / clear / key surface is identical across analysis kinds.
- Factory guarantees: `read` returns `null` for missing / stale / malformed entries and proactively removes dead rows; `write` is best-effort (quota + security errors swallowed); both accept `null | undefined` storage (SSR + Safari private mode) as a no-op.

**Thumbnail cache** (`lib/thumbnailCache.ts`):

- Purpose: a published video's thumbnail + title are immutable, so every re-open should hit cache instead of re-billing Gemini. Per-video, per-browser (no server-side store — BYOK means there's no shared tenant).
- Exports: `THUMBNAIL_CACHE_TTL_MS = 24 h`, `THUMBNAIL_CACHE_KEY_PREFIX = "ytstudio:thumb:"`, `thumbnailCacheKey(id)`, `readCachedAnalysis(storage, id, now)`, `writeCachedAnalysis(storage, id, analysis, now)`, `clearCachedAnalysis(storage, id)`, plus a narrow `KeyValueStorage` interface.
- Validation: the shape guard checks all 5 `ThumbnailAnalysis` fields (string prose, integer scores, string-array suggestions). Malformed JSON, wrong shape, unparseable `savedAt`, and expired rows are treated as misses **and** removed from storage so quota isn't wasted on dead entries.

**Metadata cache** (`lib/metadataCache.ts`):

- Purpose: parallel to the thumbnail cache, but keyed under `"ytstudio:meta:"` with its own `MetadataAnalysis` shape validator. 24 h TTL (title / description / tags change rarely; explicit "Re-analyze metadata" is the cache-busting escape hatch).
- Exports: `METADATA_CACHE_TTL_MS`, `METADATA_CACHE_KEY_PREFIX`, `metadataCacheKey(id)`, `readCachedMetadata(storage, id, now)`, `writeCachedMetadata(storage, id, analysis, now)`, `clearCachedMetadata(storage, id)`.

**Tests**:
- `tests/unit/thumbnailCache.test.ts` — round-trip, TTL expiry (inclusive boundary + drop on expiry), malformed JSON, shape validation (all 5 fields + non-object roots + mixed-type arrays), unparseable `savedAt`, storage unavailability (`null`, `undefined`, empty videoId), `setItem` throws, `getItem` throws, `removeItem` throws, explicit clear. These also cover every branch of the shared `lib/analysisCache.ts` factory.
- `tests/unit/thumbnailPrompt.test.ts` — validator, mime whitelist, prompt content.
- `tests/unit/metadataPrompt.test.ts` — `normaliseTags` (undefined, non-array, trim/drop/clamp/cap), `buildMetadataPrompt` (embeds fields, placeholders for empty description / tags, exact-count rules), `METADATA_SCHEMA` required fields, `isMetadataAnalysis` (scalar type checks + string-array guards).
- `tests/unit/metadataCache.test.ts` — round-trip, TTL expiry, shape rejection, explicit clear, null-storage no-op.
- `tests/integration/api-thumbnail.test.ts` — 9 scenarios incl. all error paths and successful parse.
- `tests/integration/api-video-metadata.test.ts` — 9 scenarios incl. 401 missing key, 400 malformed body / missing fields / oversize title, 200 with empty description, description truncation, optional `tags`, 502 empty + malformed Gemini responses.
- `tests/live/learnwithmanoj.test.ts` — real Gemini call with a real thumbnail + schema assertion.

---

### 4.6 Channel analysis — `POST /api/analyze`

Streams NDJSON events so the UI can render tokens as they arrive.

- R1 401 if YouTube key missing (`"Add your YouTube Data API v3 key in the API Keys panel to run analysis."`).
- R2 401 if Gemini key missing (`"Add your Gemini API key in the API Keys panel to run analysis."`).
- R3 400 on malformed JSON body.
- R4 400 if `channelId` is empty.
- R5 Fetch last 20 videos via `getChannelVideos(key, id, 20)`. Translate errors per § 8.
- R6 Summarize via `summarizeVideos(videos)` (title, views, likes, comments, duration, publishedAt, `dayOfWeek`).
- R7 Call Gemini `generateContentStream` with:
  - Model `gemini-2.5-flash`, `temperature: 0.2`, `maxOutputTokens: 2048`.
  - `responseMimeType: "application/json"`, `responseSchema: ANALYZE_SCHEMA`, `thinkingConfig: { thinkingBudget: 0 }`.
- R8 Stream output as NDJSON lines (`application/x-ndjson`):
  - `{ type: "meta", channelId }` — emitted first.
  - `{ type: "chunk", text }` — one per non-empty stream chunk.
  - `{ type: "final", data }` — after the stream closes, `data` is the parsed JSON (or `{ raw: <text> }` if it couldn't be parsed).
  - `{ type: "error", error: <message> }` — if the iterator throws.

**Response schema `AnalyzeResponse`**:

```ts
{
  topPatternsThatWork: string[];           // exactly 3 in the prompt contract
  topUnderperformingPatterns: string[];    // exactly 3
  contentGapSuggestions: string[];         // exactly 5
  optimalPostingSchedule: {
    bestDays: string[];                    // e.g. ["Tuesday", "Thursday"]
    bestTimeWindows: string[];             // e.g. ["17:00-20:00 UTC"]
    recommendedFrequency: string;
    rationale: string;
  };
}
```

**Tests**:
- `tests/unit/analyzePrompt.test.ts` — summarize, day-of-week, prompt content, schema shape.
- `tests/integration/api-analyze.test.ts` — 10 scenarios incl. all error paths, streaming happy path, malformed JSON, iterator error.
- `tests/live/learnwithmanoj.test.ts` — real Gemini stream + schema assertion against `@LearnwithManoj`.

---

### 4.7 History — `/history` (`app/history/page.tsx`)

- R1 Client component; reads `localStorage['ytstudio:history']` on mount.
- R2 Render each entry as a row with: channel thumbnail (fallback: initial letter), channel title (fallback: channel ID), optional channel ID line + `savedAt`, and `→` affordance.
- R3 Entries link to `/dashboard/<channelId>`.
- R4 `Clear` button empties localStorage; `New analysis` link to `/lookup`.
- R5 Storage capped at 12 entries, newest first, de-duped by `channelId`; revisiting a dashboard rewrites its entry with fresh `savedAt` and the latest title/thumbnail.
- R6 Entries written before title/thumbnail were tracked MUST continue to render (fallback to ID and letter-avatar).

**Tests**: not yet covered by automated tests (§ 9.5). Logic is minimal and localStorage-bound; candidate for jsdom coverage.

---

### 4.8 SEO / OG

- R1 Global metadata is defined in `app/layout.tsx`: title template, description, keywords, canonical baseline (`alternates.canonical = "/"`), OG/Twitter cards, and social image (`/og`).
- R2 `metadataBase` must be derived from `NEXT_PUBLIC_SITE_URL` via `lib/siteUrl.ts` (`getSiteUrlObject()`), with safe fallback to `https://ytstudio.local` when unset or malformed.
- R3 `app/og/route.tsx` serves a dynamic OG image via `next/og`'s `ImageResponse`. Size is set inside the constructor options, not as a named export.
- R4 `app/robots.ts` allows only public discoverable pages and disallows private/API areas:
  - disallow: `/api/`, `/dashboard/`, `/keys`, `/keys/`, `/history`
  - includes `sitemap: <siteUrl>/sitemap.xml`
- R5 `app/sitemap.ts` publishes only discoverable pages (`/`, `/lookup`, `/getting-started`, `/compare`, `/compare/gap`, `/studio`, and all `/studio/*` tool pages). Private routes are intentionally excluded.
- R6 `app/manifest.ts` exposes Web App Manifest metadata (`name`, `short_name`, `description`, `start_url`, `display`, colors, icons).
- R7 Sensitive pages are marked `robots: { index: false, follow: false }`:
  - `/keys`, `/keys/youtube`, `/keys/gemini`
  - `/dashboard/[channelId]`
  - `/history` (via `app/history/layout.tsx`)
- R8 Public discoverable pages define route-specific `metadata` with unique title/description + canonical alternates (`/`, `/lookup`, `/compare`, `/compare/gap`, `/studio`, `/getting-started`).
- R9 Landing page emits a JSON-LD `WebApplication` block (`application/ld+json`) to improve rich-result eligibility.
- R10 `viewport` metadata in `app/layout.tsx` sets `colorScheme` and dual `themeColor` entries for dark/light browser chrome.

**Tests**:
- `tests/unit/siteUrl.test.ts` — env parsing/normalization, invalid-value fallback, http+https support.
- `tests/unit/seoRoutes.test.ts` — robots disallow + sitemap URL, sitemap public-route inclusion/exclusion, manifest basics.

---

### 4.9 Channel comparison — `/compare` + `GET /api/compare`

Compare 2-4 channels side by side without leaving the BYOK envelope.

**Page** (`app/compare/page.tsx`): server-side guards on both keys; renders `CompareForm` if `?ids` is missing/insufficient, otherwise renders `CompareTable`.

**Form** (`CompareForm.tsx`): client component that lets the user pick channels from history (or paste channel IDs), then redirects to `/compare?ids=A,B[,C[,D]]`.

**Table** (`CompareTable.tsx`): server component that fetches the data via `lib/youtube.ts` + `lib/compareStats.ts` and renders a side-by-side grid (subscribers, total views, recent average views, median, top videos).

**API** (`app/api/compare/route.ts`):

- R1 401 if YouTube key cookie missing.
- R2 400 if `ids` is missing or after `parseCompareIds` produces fewer than `COMPARE_LIMITS.min` entries (deduped, trimmed).
- R3 Cap at `COMPARE_LIMITS.max` ids (extra ids are dropped silently with the cap pinned in `lib/compareStats.ts`).
- R4 For each id, run `getChannelById` + `getChannelVideos` in parallel and assemble a `ChannelComparisonRow`.
- R5 Translate `YouTubeQuotaExceededError` → 429 and `YouTubeInvalidApiKeyError` → 400 with the canonical messages.
- R6 Any other error → 500 `"Failed to load channels for comparison"` (telemetry-reported via `reportError`).

**`ChannelComparisonRow` shape:**

```ts
{
  channelId: string;
  channelTitle: string;
  thumbnailUrl?: string;
  subscriberCount: number;
  viewCount: number;
  recentVideoCount: number;
  avgRecentViews: number;
  medianRecentViews: number;
  topVideos: Array<{ id: string; title: string; viewCount: number; thumbnailUrl?: string }>;
}
```

**Tests**:
- `tests/unit/compareStats.test.ts` — id parsing, dedupe, clamping, row construction.
- `tests/integration/api-compare.test.ts` — auth gates, id parsing, error propagation, success path.

---

### 4.10 Outliers, heatmap, exports, theme — dashboard enhancements

**Robust statistics primitives** (`lib/robustStats.ts`):

- Shared module for median + MAD-based classification. Exposes `median(values)`, `computeRobustStats(values) → { median, mad }`, `robustZScore(value, stats) → number`, and `MAD_SCALE = 1.4826`.
- Used by both `lib/outliers.ts` (view counts) and `lib/engagement.ts` (engagement rates). Median + MAD is outlier-resistant by design; see each consumer for threshold justification.
- `robustZScore` returns `0` when `mad === 0` so callers can apply a single-branch threshold without a separate guard.

**Outlier badges** (`lib/outliers.ts` + `components/VideoGrid.tsx`):

- `computeOutliers(videos, threshold = 1.5)` returns a per-video annotation (`over` / `under` / `normal`) and aggregate stats (`median`, `mad`). The threshold is a multiple of MAD; defaults to 1.5 (mildly aggressive but visually useful at n=50). Internally delegates the math to `lib/robustStats.ts`.
- `VideoGrid` renders an "Overperformer" / "Underperformer" badge on the card and a chip filter that hides anything labelled `normal`.
- `filterByOutlierKind(videos, report, kinds)` is the pure helper the chip uses.

**Engagement classification** (`lib/engagement.ts` + `components/VideoGrid.tsx`):

- `computeEngagementReport(videos, threshold = 1.0)` computes a per-video `EngagementAnnotation` (`high` / `normal` / `below` / `na`) plus `shorts` and `long` aggregate stats (`{ median, mad, count }`).
- Contract: the annotation carries `bucket`, `rate` (`(likes + comments) / views * 100`, `0` for `na`), `score` (robust z-score within the video's format bucket), `format` (`short` / `long`), and `medianForFormat` (the format's channel median rate, surfaced in the UI tooltip).
- Algorithm — **channel-relative and format-aware**:
  1. Per video, compute `rate`. Return `na` when `viewCount <= 0` or **both** `likeCount` and `commentCount` are `0` (brand-new upload, or comments/ratings disabled — lumping these in would distort the bucket's median and MAD).
  2. Bucket the remaining videos by `classifyVideoFormat` (probe-aware; see § 4.15.4). Shorts and long-form engage at very different rates; a Short at 3% may be "below" for Shorts even though it would rank "high" against the creator's long-form.
  3. Compute `{ median, mad }` per bucket via `lib/robustStats`.
  4. Apply the z-score cutoff: `score > threshold → high`, `score < −threshold → below`, else `normal`. When `mad === 0` (single-video bucket or identical rates), every bucket member is `normal` with `score = 0`.
- Why z-score (± MAD) instead of fixed thresholds (the v1 approach): fixed "High ≥ 6%, Medium ≥ 3%, Low otherwise" cut-offs were too aggressive for long-form (where 2% is healthy), too lenient for Shorts (where 10% is baseline), ignored channel size, moralised low engagement with red, and hid the distinction between "0 real signal" and "disabled comments". The z-score approach is self-calibrating — every creator is compared to their own baseline, split by format — and uses the same robust-statistics machinery as view-outlier detection for consistency.
- `VideoGrid`:
  - Renders badges "High engagement" (emerald) / "Normal engagement" (neutral zinc) / "Below average" (amber — caution, not red) / "Engagement N/A" (outline).
  - Tooltip on the badge shows the raw rate (`X.XX%`), the channel's format median, and an explanation of the relative baseline.
  - The report is computed over the **full** `videos` list (not `formatFiltered`) so a video's badge doesn't shift when the user toggles the Shorts / long-form filter.
- Default threshold is `1.0` (versus `1.5` for view outliers) because engagement distributions are tighter and we want to surface signal without waiting for a viral outlier to exist first.

**Publish heatmap** (`lib/heatmap.ts` + `lib/timezone.ts` + `components/PublishHeatmap.tsx`):

- `buildPublishHeatmap(videos, timeZone = "UTC")` produces a 7×24 grid of day × hour cells in the caller-supplied IANA timezone, each with `medianViews` and `count`. Empty cells are zeros, not nulls, so the renderer never has to branch.
- `lib/timezone.ts` centralises the bucketing primitives: `localDayHour(date, tz)` (Intl-based, DST- and half-hour-offset safe), `getBrowserTimeZone()` (resolves the browser zone with a UTC fallback), and `formatTimeZoneLabel(date, tz)` (short label like `IST` / `PDT`, falling back to the IANA id).
- `PublishHeatmap` is a client component. It renders the UTC bucketing on first paint (to match the server snapshot), then after mount resolves the browser timezone and re-buckets — so the grid and the "strongest slot" callout always speak the viewer's local weekday and hour. The header and cell titles display the resolved timezone label (e.g. "Weekday × hour (IST).").

**CSV / JSON export** (`lib/csv.ts` + `components/ExportButton.tsx`):

- `videosToCsv(videos)` returns a UTF-8 string with a BOM (Excel-friendly), proper escaping of `"`, `,`, `\n`, `\r`, and the headers listed in `VIDEO_CSV_HEADERS`.
- `ExportButton` exposes two actions: download the CSV of the current 50-video sample, or download a JSON snapshot of `{ channel, videos, generatedAt }`.

**Theme toggle** (`components/ThemeToggle.tsx` + `app/layout.tsx`):

- The layout includes an inline pre-hydration script that reads `localStorage.theme` (or system preference fallback) and toggles the `dark` class on `<html>` to avoid FOUC.
- The toggle sets `localStorage.theme` to `"light"` / `"dark"` / `null` (system) and updates the class.

**Tests**:
- `tests/unit/robustStats.test.ts` — median (empty, odd, even, non-mutating), `computeRobustStats` (empty, constant, varied), `robustZScore` (MAD=0 short-circuit, scaling against `MAD_SCALE`).
- `tests/unit/outliers.test.ts` — median, MAD, classification at the threshold boundary, filter helper.
- `tests/unit/engagement.test.ts` — empty input, single-video normal, format-split independence (Shorts vs long-form baselines), N/A guards (0 views, 0 likes AND 0 comments), N/A exclusion from stats, constant-bucket → all-normal, custom thresholds, `medianForFormat` exposure for tooltips.
- `tests/unit/heatmap.test.ts` — grouping, median per cell, "best slot" pick, and a non-UTC timezone case that verifies the same UTC instant lands on a different weekday/hour cell in `America/Los_Angeles`.
- `tests/unit/csv.test.ts` — escape, header, full row dump, BOM, RFC-4180 edge cases.

---

### 4.11 Telemetry seam — `lib/telemetry.ts`

Pluggable error reporter used by error boundaries and uncaught route paths.

- `serializeError(error, context?)` redacts secrets (any cookie or env value matching `/AIza[\w-]{20,}/`) before serialising.
- `reportError(error, context?)` resolves `true` when the configured `TELEMETRY_ENDPOINT` accepts the payload, `false` otherwise. With no endpoint configured, the function returns `false` immediately and never calls `fetch`.
- `app/error.tsx`, `app/dashboard/[channelId]/error.tsx`, `app/api/channel/route.ts`, `app/api/analyze/route.ts`, `app/api/compare/route.ts`, and the four `app/api/studio/*` routes all call `reportError` on uncaught failures.

**Tests**: `tests/unit/telemetry.test.ts` — context scrubbing, error serialisation across `Error` / non-`Error` shapes, `reportError` with and without endpoint.

---

### 4.12 Creator Studio — `/studio`

AI co-pilot tools that turn the analyzer into a creative partner. Index page lives at `/studio` and lists the four tools below; all four require both API keys (server redirects to `/keys` otherwise).

#### 4.12.1 Title Lab — `/studio/titles` + `POST /api/studio/titles`

Generate 10 ranked title candidates anchored on the channel's actual top performers.

- R1 401s when YouTube or Gemini key cookies are missing.
- R2 400 on malformed JSON, empty `channelId`, empty `topic`, or `topic.length > TITLE_LAB_LIMITS.maxTopicLength` (280).
- R3 Loads `getChannelVideos(key, channelId, 50)` and feeds the top 10 by `viewCount` into the prompt via `pickTopPerformers`.
- R4 Calls Gemini `generateContent` with `responseSchema: TITLE_LAB_SCHEMA`, `responseMimeType: "application/json"`, `temperature: 0.5`, `thinkingConfig: { thinkingBudget: 0 }`.
- R5 502 if Gemini returns empty text (`"empty response"`) or unparseable JSON (`"Gemini did not return valid JSON"`).
- R6 200 returns the parsed `TitleLabResponse`.

**`TitleLabResponse` shape:**

```ts
{
  channelStyleSummary: string;
  candidates: Array<{
    title: string;
    rationale: string;
    curiosityGapScore: number;       // 1..10
    keywordStrengthScore: number;    // 1..10
    alignmentWithChannelScore: number; // 1..10
    characterCount: number;
    warnings: string[];
  }>;
}
```

**Tests**: `tests/unit/titleLabPrompt.test.ts` (prompt + top-performers helper); `tests/integration/api-studio-titles.test.ts` (12 scenarios incl. all error paths and the success path).

#### 4.12.2 Hook + Description + Chapters — `/studio/hook` + `POST /api/studio/hook`

One outline in, three hooks + an SEO description + 3-7 tags + chapter markers out.

- R1 401 if Gemini key is missing.
- R2 400 on malformed JSON, missing `title`, missing `outline`, or oversize input (`HOOK_LIMITS.maxTitleLength` = 200, `HOOK_LIMITS.maxOutlineLength` = 4000).
- R3 Calls Gemini with `responseSchema: HOOK_SCHEMA`, schema-enforced JSON.
- R4 Validates each chapter timestamp via `isValidTimestamp` (matches `HH:MM:SS` or `MM:SS`); 502 if any timestamp fails.
- R5 502 on empty / invalid JSON.

**Tests**: `tests/unit/hookPrompt.test.ts` (prompt + timestamp validator); `tests/integration/api-studio-hook.test.ts`.

#### 4.12.3 Topic Clusters — `/studio/clusters` + `POST /api/studio/clusters`

Embed the channel's last 50 titles via `text-embedding-004` and run agglomerative clustering with cosine similarity.

- R1 401 on missing keys; 400 on malformed JSON or empty `channelId`.
- R2 422 if fewer than 2 videos have non-empty titles.
- R3 502 if the embedding service throws OR returns no usable vectors.
- R4 Default `desiredClusters = 5`, clamped to `[2, 8]`.
- R5 200 returns `{ clusters: AggregateClusterStats[] }` sorted by `totalVideos` descending.

**`AggregateClusterStats` shape:**

```ts
{
  clusterId: number;
  totalVideos: number;
  avgViews: number;
  medianViews: number;
  representativeTitles: string[];   // top-N closest to centroid
}
```

**Notes:**

- `clusterByEmbedding` refuses to run for `items.length > 500` to keep its O(n² log n) cost honest if a future caller forgets the 50-video cap.
- `cosineSimilarity` returns 0 for any zero-norm vector so clustering never receives `NaN` (which would silently corrupt the merge ordering).

**Tests**: `tests/unit/cluster.test.ts` + `tests/unit/embeddings.test.ts`; `tests/integration/api-studio-clusters.test.ts`.

#### 4.12.4 Thumbnail Generator — `/studio/thumbnails` + `POST /api/studio/thumbnails`

Generate up to 3 thumbnail concept images via `gemini-2.5-flash-image-preview`.

- R1 401 if Gemini key is missing.
- R2 400 on malformed JSON, missing prompt, or `prompt.length > THUMBNAIL_GEN_LIMITS.maxPromptLength` (500).
- R3 `variantCount` is clamped to `[1, THUMBNAIL_GEN_LIMITS.variantCount]` (default and max = 3).
- R4 Each variant is a separate `generateContent` call (the model does not return multiple images per call).
- R5 502 if any individual call throws OR if zero inline images come back across all variants.
- R6 200 returns `{ variants: Array<{ dataUrl, mimeType }>, promptUsed }`. Images are encoded as `data:image/<mime>;base64,<...>`; nothing is uploaded or stored server-side.

**Tests**: `tests/unit/thumbnailGenPrompt.test.ts`; `tests/integration/api-studio-thumbnails.test.ts`.

### 4.13 Power UX & resilience (Phase 3)

#### 4.13.1 Dashboard cache — `lib/dashboardSnapshot.ts` + `lib/idb.ts`

After the dashboard renders, `components/SnapshotPersister.tsx` writes the channel + last 50 videos to IndexedDB store `dashboardSnapshots` (keyPath: `channelId`).

- R1 Snapshots carry `schemaVersion` (currently `1`) and a UTC `savedAt`. `isSnapshot` returns `false` on schema mismatch so old payloads are treated as a cache miss instead of crashing.
- R2 `isSnapshotFresh` uses a 24-hour TTL by default; `summarizeSnapshot` exposes `videoCount`, `avgViews`, `newestVideoAt`, `ageMs`, and `isFresh` for UI consumption.
- R3 `pruneStaleSnapshots` runs from `SnapshotPersister` and silently best-effort deletes any entry older than the TTL.
- R4 `/history` reads `getAllDashboardSnapshots()` and renders a "N videos · avg X views · fresh|stale · Yh ago" line per channel. Failures (private mode, no IDB) are swallowed and the page still renders the basic localStorage history.
- R5 The IDB module is browser-only and excluded from coverage in `vitest.config.ts`. Pure logic in `dashboardSnapshot.ts` is fully covered.

**Tests**: `tests/unit/dashboardSnapshot.test.ts` (snapshot building, freshness, summary stats, age formatter).

#### 4.13.2 Command palette — `lib/commands.ts` + `components/CommandPalette.tsx`

Global ⌘K / Ctrl+K palette for keyboard-first navigation.

- R1 The palette toggles on Meta+K or Ctrl+K and closes on Escape or backdrop click.
- R2 Static commands cover `/lookup`, `/compare`, `/history`, the four Studio tools, `/keys`, and a theme toggle (which mirrors `ThemeToggle`).
- R3 Channel history is loaded from `localStorage:ytstudio:history` on each open and exposed as commands of group `Channels`, navigating to `/dashboard/<id>`.
- R4 Ranking (`scoreCommand`): title-prefix (0) > word-start (1) > substring (2) > in-order fuzzy (3). Ties are broken alphabetically. Non-matches are dropped.
- R5 The dialog is `role="dialog" aria-modal="true"` with `aria-controls` on the input and `aria-activedescendant` tracking the highlighted option; Up/Down/Enter handle keyboard selection.

**Tests**: `tests/unit/commands.test.ts` (scoring across all 4 layers + keyword fallback, sort stability, channel command construction); `tests/e2e/command-palette.spec.ts` (open / filter / close).

#### 4.13.3 Accessibility pass

- A skip link in `app/layout.tsx` jumps to `#main`; every page-level `<main>` has `id="main"`.
- `:focus-visible` ring (violet-400, 2px, 2px offset) applied via `app/globals.css` so any keyboard-focused control is visible against both palettes.
- `prefers-reduced-motion: reduce` collapses animations and transitions to ~0ms via a global CSS media query.
- `ThumbnailAnalyzer` traps focus, restores focus to the close button on open, closes on Escape, and exposes `aria-labelledby` pointing at the dialog title; backdrop clicks close.

#### 4.13.4 Performance & observability

- `next.config.mjs` ships `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`, and `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`. `poweredByHeader` is disabled.
- `app/layout.tsx` adds `preconnect` + `dns-prefetch` for `https://i.ytimg.com` to shave a roundtrip off thumbnail-heavy first paints.
- `NEXT_PUBLIC_TELEMETRY_ENDPOINT` (documented in `.env.local`) opts the deployment into POST-based error reporting. When unset (the default) `reportError` returns `false` immediately. Secrets are scrubbed from the context (`scrubContext`) before transmission.

#### 4.13.5 Playwright E2E — `tests/e2e/`

Browser-flow tests that complement unit + integration suites. Run with `npm run test:e2e`; the runner boots `next dev` on port `PLAYWRIGHT_PORT` (default `3100`).

- `keys-gating.spec.ts` — landing without keys hides the Channel Lookup CTA; `/studio` redirects to `/keys`; setting both cookies unlocks the CTA and renders the Studio index.
- `lookup.spec.ts` — `/lookup`, `/history` (empty state), `/compare` (form state) render under a primed keys cookie.
- `command-palette.spec.ts` — ⌘K opens the dialog, typing filters the list, Escape closes it.

E2E tests intentionally do not exercise live YouTube/Gemini calls (those live in `tests/live/`). Coverage thresholds in `vitest.config.ts` are unaffected.

---

### 4.14 Getting started guide — `/getting-started` (`app/getting-started/page.tsx`)

**Purpose**: A beginner-friendly, one-page walkthrough that takes a brand-new visitor from "what is this?" to a first dashboard render without leaving the site. This is the primary onboarding surface and is linked directly from the landing page and `/keys`.

**Requirements:**

- R1 Server component only — no client runtime. Reads the YouTube + Gemini cookies so the hero banner can tell the user whether they still need to configure keys; the CTA button at the bottom flips between "Add your keys" and "Analyze a channel" based on readiness.
- R2 Structured as numbered `Step` cards (1..7) covering: what BYOK means, how to obtain a YouTube Data API v3 key in Google Cloud Console, how to obtain a Gemini key from AI Studio, how to save both keys in `/keys`, how channel lookup accepts URL/handle/id, how to read the dashboard sections, and a tour of the four Creator Studio tools.
- R3 Three supporting sections after the steps: a metric glossary (avg views, engagement rate, uploads/week, best day, outliers, heatmap strongest slot), a troubleshooting list (invalid key, quota exceeded, channel not found, Gemini errors), and a privacy / data-handling summary.
- R4 External links (Google Cloud Console, AI Studio) open in a new tab with `rel="noreferrer"`.
- R5 Discoverable from the command palette via `nav.getting-started` (group `Navigate`) with keywords `help`, `how`, `tutorial`, `guide`, `docs`, `beginner`, `onboarding`, `setup`. The landing page links from its hero copy; the `/keys` overview page links from its intro paragraph.
- R6 Uses the standard `id="main"` so the global skip link lands here, and falls back gracefully when only one of the two keys is configured (banner reads "You still need a Gemini API key." / "a YouTube API key." / "both …").

**Tests**: `tests/unit/commands.test.ts` pins the command's href + keyword discoverability. The page itself is prose; copy is covered by the manual landing / keys QA flow in § 9.5 Known Gaps.

---

### 4.15 Longitudinal analytics (Phase 4 Bucket A)

Four dashboard features driven by a v2 `DashboardHistory` snapshot store. All storage is client-only (IndexedDB) and survives refreshes without any server round-trip.

#### 4.15.1 Snapshot schema v2 (A0)

`lib/dashboardSnapshot.ts` now stores a `DashboardHistory` per channel:

- `schemaVersion: 2`, `channelId`, `channelTitle`, `entries: DashboardSnapshot[]` (capped at `HISTORY_CAP = 30`, oldest pruned).
- `migrateSnapshot(v1) -> v2` wraps any existing v1 blob into a single-entry history so existing users don't lose data on first open.
- `isHistory` validates v2; `isSnapshot` still accepts v1 payloads for read paths.
- `appendEntry` / `upsertHistory` dedupe when the new snapshot is within `HISTORY_DEDUPE_WINDOW_MS` (5 min) **and** materially identical video list (`videosMaterialChange` hashes ids + viewCount + publishedAt), so refresh mashing never pollutes the timeline.
- `lib/idb.ts` exposes `getDashboardHistory(channelId)`, `getAllDashboardHistories()`, `appendSnapshotEntry(snapshot)`, `deleteDashboardHistory`, and `pruneStaleSnapshots()`. `getDashboardSnapshot` / `putDashboardSnapshot` / `deleteDashboardSnapshot` are retained as thin wrappers that operate on `latestEntry(history)` for backward compatibility.
- `components/SnapshotPersister.tsx` calls `appendSnapshotEntry` (idempotent, best-effort, never blocks UI).

**Tests**: `tests/unit/dashboardSnapshot.test.ts` covers v1 + v2 validators, migration, dedupe window, material-change detection, and cap enforcement.

#### 4.15.2 Growth over time (A1)

- `lib/timeSeries.ts` → `summarizeHistory(history): { points: GrowthPoint[], latestDelta: DeltaRow | null }`. `GrowthPoint = { savedAt, subCount, totalViews, avgViews, uploadsPerWeek }`. Deterministic: sorts entries chronologically by `savedAt`.
- `components/GrowthChart.tsx` (client, recharts, self-measured) renders four toggleable series.
- `components/GrowthDeltaCard.tsx` shows the most-recent-vs-previous deltas with tone (up/down/flat) and a human-readable span label.
- `components/GrowthSection.tsx` loads the history from IndexedDB (with a small `setTimeout` defer so `SnapshotPersister` can append the current run first). Renders the chart + delta when `points.length >= 2`, otherwise a one-line "Come back tomorrow" hint. Integrated into `app/dashboard/[channelId]/page.tsx` immediately after the stats cards.

**Tests**: `tests/unit/timeSeries.test.ts`.

#### 4.15.3 Breakout detector (A2)

- `lib/breakout.ts` → `detectBreakouts(previous, current, opts)` returns `BreakoutEntry[]` sorted by `deltaPct` desc. Defaults: skip videos missing from `previous`; `minPreviousViews = 100`; `limit = 10`; percentage growth must be > 0.
- `components/BreakoutList.tsx` pulls the history from IndexedDB, picks the latest two entries, and renders a compact list (thumbnail, title, previous vs current views, `deltaPct`). Hides gracefully when no breakouts.
- Wired into the dashboard as `<BreakoutSection />` after `GrowthSection`. `/history` surfaces the breakout count per channel card.

**Tests**: `tests/unit/breakout.test.ts`.

#### 4.15.4 Shorts vs long-form split (A3)

- `lib/duration.ts` → `parseIso8601DurationSeconds(raw)` returns `NaN` for bad inputs (including overflow to `Infinity`); `classifyVideoFormat(video)` prefers the authoritative `video.isShort` flag (populated by the server-side probe below) and only falls back to the duration heuristic — `"short"` for 0 < seconds ≤ `SHORT_MAX_SECONDS = 180`, else `"long"` — when `isShort` is absent or inconclusive.
- `SHORT_MAX_SECONDS` mirrors YouTube's own rule as of 2024-10-15: vertical/square videos up to 3 min are auto-classified as Shorts. The v3 Data API does **not** expose aspect ratio (`contentDetails` only gives `duration`, `dimension`, `definition`, `caption`, `projection`), so a duration-only heuristic can't distinguish a 2-min vertical Short from a 2-min horizontal trailer. That's what the probe in `lib/shortsProbe.ts` fixes.
- `lib/shortsProbe.ts` → `probeShort(id)` and `enrichVideosWithShortsProbe(videos)` run server-side and hit `https://www.youtube.com/shorts/{id}` with `redirect: "manual"`. HTTP `200` → `isShort=true` (YouTube serves the Shorts player), `3xx` → `isShort=false` (redirects to `/watch?v=…`), anything else → `undefined` (inconclusive; caller falls back to duration). Successful probes are memoised in-process with a 24 h TTL (Short/long-form status is immutable once uploaded); inconclusive results aren't cached so transient glitches don't freeze a wrong answer. Each probe has a 4 s timeout enforced via `AbortController` and the response body is cancelled in a `finally` block to avoid leaking streams in undici. `enrichVideosWithShortsProbe` only probes videos whose duration lies in the ambiguous `(0, SHORT_MAX_SECONDS]` window — anything longer can't be a Short per YouTube's rule, so we save a round trip. Concurrency is bounded (default 8 workers) to stay polite to YouTube's edge. The dashboard server component (`app/dashboard/[channelId]/page.tsx`) chains `.then(enrichVideosWithShortsProbe)` after `getChannelVideos`, so every Suspense boundary sees probed data from a single shared promise.
- **Privacy / quota notes**: the probe hits public youtube.com, not the YouTube Data API, so it consumes none of the user's BYOK quota; no request body is sent; the outgoing User-Agent is a descriptive server tag (`YtStudioShortsProbe/1.0`). The probe cache is in-process memory only — no persistence.
- `components/VideoGrid.tsx` adds a three-way filter (`All / Shorts / Long-form`) alongside the existing outlier toggle. The toggle's `title` tooltip explains the probe-first / duration-fallback logic. Outlier report recomputes against the format-filtered subset so "outliers among Shorts" makes sense.
- `lib/stats.ts` and `lib/heatmap.ts` need no signature change; callers pass filtered arrays as already supported.

**Tests**: `tests/unit/duration.test.ts`.

#### 4.15.5 Title n-gram / keyword frequency (A4)

- `lib/ngrams.ts` → `extractNgrams(videos, { n, stopwords?, minCount?, limit? })` returns `NgramEntry[]` ranked by `weightedViews` desc (sum of view counts of titles containing the phrase, one credit per title), tie-break by `count`, then lexicographically. Defaults: `minCount = 2`, `limit = 20`, built-in English stopword list (`DEFAULT_STOPWORDS`). Unigram mode filters stopwords; higher-order n-grams do not.
- `components/TitleTrends.tsx` renders top 12 unigrams + top 12 bigrams as pills with hover-revealed count + weighted views. Placed on the dashboard next to the heatmap.

**Tests**: `tests/unit/ngrams.test.ts`.

#### 4.15.6 Idea Opportunity Engine

- `lib/dashboardIdeaEngine.ts` adds deterministic, dashboard-local idea synthesis from existing signals (no automatic Gemini spend): title n-gram winners, format medians, cadence/engagement context, and heatmap strongest slot.
- `components/DashboardIdeaEngine.tsx` renders one high-impact dashboard widget answering "what to make next, and why now":
  - `Top Opportunity Angle`
  - `Why Now` evidence bullets
  - `Best Format` + confidence
  - `Best Publish Window` in the viewer's browser-local timezone (same timezone posture as heatmap)
- Widget actions:
  - `Generate 3 Data-Grounded Ideas` triggers a click-only call to `POST /api/studio/ideate` using computed seed keywords (`ideaCount = 3`).
  - `Open Video Ideate` deep-links to `/studio/ideate?keywords=<seed>` for full ideation flow.
- Sparse-signal behavior is explicit: low confidence, conservative opportunity framing, and guidance to validate with small tests.
- Dashboard composition: widget is inserted after `Key Insights` in `app/dashboard/[channelId]/page.tsx`.

**Tests**: `tests/unit/dashboardIdeaEngine.test.ts`.

---

### 4.16 Creator Studio II (Phase 4 Bucket B)

Five new AI tools. Each follows the `lib/<tool>Prompt.ts` + `app/api/studio/<tool>/route.ts` + `app/studio/<tool>/page.tsx` triad so schemas, validation, and streaming behaviour mirror Phase 2.

#### 4.16.1 Script Doctor — `/studio/script` (B1)

- `lib/scriptPrompt.ts` → `buildScriptPrompt({ title, targetMinutes, audience?, channelContext? })`, `SCRIPT_LIMITS`, `suggestedBeatCount(targetMinutes)`, `SCRIPT_SCHEMA`.
- `POST /api/studio/script` validates title (required, length), `targetMinutes` (1–30 integer), optional `audience` / `channelContext` (length-capped). Streams NDJSON with `meta`, `chunk`, `final` (or `error`) lines.
- `components/ScriptLab.tsx` provides the UI: title + target minutes slider + optional audience/channel context. Streams live text preview; replaces with structured `ScriptView` on the `final` event.

**Tests**: `tests/unit/scriptPrompt.test.ts` + `tests/integration/api-studio-script.test.ts`.

#### 4.16.2 Title A/B Scorer — `/studio/ab-title` (B2)

- `lib/abTitlePrompt.ts` → `buildAbTitlePrompt`, `AB_TITLE_SCHEMA`. Four axes: clarity, curiosity, seo, clickability. Output includes `winnerIndex`, per-axis integer scores 1–10, and 2–4 short reasons.
- `POST /api/studio/ab-title` validates both titles (required, distinct, length-capped), optional audience / channel context. Single-shot `generateContent` call (not streamed). Returns the parsed JSON on success; `502` for empty or unparseable Gemini output.

**Tests**: `tests/unit/abTitlePrompt.test.ts` + `tests/integration/api-studio-abtitle.test.ts`.

#### 4.16.3 Thumbnail A/B Comparator — `/studio/ab-thumbnail` (B3)

- `lib/abThumbnailPrompt.ts` → `buildAbThumbnailPrompt(title?)`, `AB_THUMBNAIL_SCHEMA` (`{ winnerIndex, verdict, axisScores: [{axis, a, b}], improvements: string[] }`), and helpers `fetchImageFromUrl(url, fetchImpl?)` + `decodeUploadedImage(file)`. Both helpers enforce `SUPPORTED_IMAGE_TYPES` (image/jpeg, image/png, image/webp) and `AB_THUMBNAIL_LIMITS.maxBytes = 5 MiB`.
- `POST /api/studio/ab-thumbnail` accepts either `multipart/form-data` (fields `imageA`, `imageB`, optional `title`) **or** `application/json` (`imageUrlA`, `imageUrlB`, optional `title`). Anything else → 400. Sends both images as `inlineData` parts to Gemini 2.5 Flash with `thinkingBudget = 0`.
- `components/AbThumbnailLab.tsx` toggles between "Upload" and "URL pair" modes, uploads via `FormData`, and renders axis scores + improvements on success.

**Tests**: `tests/unit/abThumbnailPrompt.test.ts` + `tests/integration/api-studio-abthumbnail.test.ts`.

#### 4.16.4 Competitor gap analysis — `/compare/gap` (B4)

- `lib/compareGapPrompt.ts` → `selectGapChannels(rows, topN?)`, `buildCompareGapPrompt`, `COMPARE_GAP_SCHEMA` (`{ sharedTopics: string[], perChannelGaps: [{channelId, missingTopics, notes}] }`), `COMPARE_GAP_LIMITS` (min 2, max 4, max 8 top titles, max 300-char focus).
- `GET /api/compare/gap?ids=...&focus=...` requires both the YouTube and Gemini keys. It reuses `buildComparisonRow` from `lib/compareStats.ts` and the uploads-playlist path from `lib/youtube.ts` to build per-channel rows, then composes a single `generateContent` call. Produces 401 if either key is missing, 400 for <2 ids / overlong focus, 404 when fewer than 2 channels resolve, 429/400 on YouTube quota / invalid-key errors, 502 on Gemini failure or unparseable output.
- `app/compare/page.tsx` gains a "Run gap analysis →" button that deep-links to `/compare/gap?ids=…`. `components/CompareGapClient.tsx` renders the `sharedTopics` pills and per-channel missing-topics cards.

**Tests**: `tests/unit/compareGapPrompt.test.ts` + `tests/integration/api-compare-gap.test.ts`.

#### 4.16.5 Cluster-aware content ideas — inline on `/studio/clusters` (B5)

- `lib/clusterIdeasPrompt.ts` → `clampIdeaCount`, `clusterIdeasInputFromStats`, `buildClusterIdeasPrompt`, `CLUSTER_IDEAS_SCHEMA` (`{ ideas: [{title, hook, why}] }`). Defaults to 5 ideas per call; clamps to `[3, 8]`.
- `POST /api/studio/clusters/ideas` validates `label` (required, length-capped), `sampleTitles` (non-empty array of strings), `medianViews` (non-negative number), and optional `channelContext` / `ideaCount`. Filters whitespace-only titles before prompting, so tiny clusters still produce ideas.
- `components/TopicClusters.tsx` gains an "Ideate for this cluster" button on every cluster card. Ideas render inline beneath the cluster's representative titles.

**Tests**: `tests/unit/clusterIdeasPrompt.test.ts` + `tests/integration/api-studio-cluster-ideas.test.ts`.

---

### 4.17 Global Donate link

A lightweight outbound link that lets visitors tip the project maintainer. There is **no** payment flow inside the app — we only surface an `<a>` pointing at PayPal — so the `Permissions-Policy: payment=()` ban still holds.

- R1 `lib/donate.ts` exposes `DONATE_URL = resolveDonateUrl(process.env.NEXT_PUBLIC_DONATE_URL)`. The default target is `https://paypal.me/sanojtechnologies`.
- R2 `resolveDonateUrl` rejects anything that isn't a parseable `https://` URL and falls back to the default. This means a misconfigured or malicious env override cannot turn the button into an `http://`, `javascript:`, or `data:` target.
- R3 `components/DonateLink.tsx` renders a fixed bottom-right pill on every page (mounted by `app/layout.tsx`). The anchor uses `target="_blank"`, `rel="noopener noreferrer"`, and `referrerPolicy="no-referrer"` so the destination never learns which page the user came from and cannot reach back via `window.opener`.
- R4 The command palette surfaces a **Settings → Support this project** entry (`settings.donate`, `actionId=open-donate`). Activating it calls `window.open(DONATE_URL, "_blank", "noopener,noreferrer")` — same posture as the pill.
- R5 Forks / self-hosters override the target by setting `NEXT_PUBLIC_DONATE_URL` at build time; the value is inlined into the client bundle.

**Tests**: `tests/unit/donate.test.ts` covers the resolver (empty / whitespace / https / non-https / malformed / env-override round trip). `tests/unit/commands.test.ts` pins the palette entry's `actionId`, hint, and keyword discoverability (donate, tip, paypal, support, contribute).

---

#### 4.16.6 Cross-cutting

- Command palette (`lib/commands.ts`) adds: `studio.script`, `studio.ab-title`, `studio.ab-thumbnail`, `compare.gap`. `tests/unit/commands.test.ts` pins their discoverability.
- `app/studio/page.tsx` lists 4 new tool cards (Script Doctor, A/B Title Scorer, A/B Thumbnail Comparator, Competitor Gap Analysis). Cluster tile description updated to mention ideation.
- `app/getting-started/page.tsx` Step 6 now mentions the local growth history; Step 7 grid adds cards for all four new tools.
- E2E: `tests/e2e/command-palette.spec.ts` asserts each new palette entry surfaces under a human-typed query.

---

#### 4.16.7 Video Ideate — `/studio/ideate` (V1)

- `lib/videoIdeate.ts` adds a YouTube-only evidence pipeline for last-30-days niche ideation. Inputs are user-provided keyword seeds; output is deterministic evidence (`topPhrases`, keyword momentum, engagement-weighted performance, format mix, top videos, and compact opportunity signals).
- `fetchVideosForIdeation(...)` uses YouTube `search.list` per seed (bounded) + `videos.list` detail hydration, then `buildVideoIdeateEvidence(...)` computes ranked trend signals before any Gemini synthesis.
- `lib/videoIdeatePrompt.ts` defines strict contract + schema (`VIDEO_IDEATE_SCHEMA`) for structured idea output: `title`, `hook`, `whyNow`, `keywordAngle`, `format`, `confidence`, `supportingSignals[]`, plus top-level `summary`.
- `POST /api/studio/ideate` enforces BYOK for YouTube + Gemini, validates seeds/count bounds, builds evidence, requests schema-constrained Gemini synthesis, and returns `{ summary, ideas[], evidence }`. Error handling follows existing studio conventions (`400` body validation, `401` missing keys, `502` upstream/model failures).
- `components/VideoIdeate.tsx` + `app/studio/ideate/page.tsx` deliver the Studio UX: keyword-seed input, bounded idea count, loading/empty/error states, evidence-first result cards with confidence + why-now rationale, and `Download As PDF` for exporting the current ideation result bundle (summary + evidence + ideas) for offline reference.
- Discoverability: Studio index card + command palette entry `studio.ideate`; Getting Started Step 7 now includes Video Ideate.

**Tests**: `tests/unit/videoIdeate.test.ts` + `tests/unit/videoIdeatePrompt.test.ts` + `tests/unit/videoIdeateExport.test.ts` + `tests/integration/api-studio-ideate.test.ts` + command discoverability pin in `tests/unit/commands.test.ts`.

---

## 5. External Integrations

### 5.1 YouTube Data API v3

- **Access**: user-supplied API key (no OAuth).
- **Scopes used**: `channels.list`, `playlistItems.list`, `videos.list`, `i18nLanguages.list` (validation only).
- **Strategy**: dashboard/channel analytics avoid `search.list` (100 quota units) by using the uploads-playlist pattern (`channels.list(contentDetails) → playlistItems.list → videos.list`, totalling ≤3 units for 50 videos). `Video Ideate` is the explicit exception: it uses bounded `search.list` keyword sampling for niche trend discovery across channels.
- **Rate-limit handling**: 403 with a reason containing `quota`/`rateLimit`/`dailyLimit`/`userRateLimit` → `YouTubeQuotaExceededError` → HTTP 429 to the caller.
- **Invalid key handling**: 400 with message containing `api key not valid` OR reason `keyInvalid` → `YouTubeInvalidApiKeyError` → HTTP 400.

### 5.2 Google Gemini API

- **Package**: `@google/genai`.
- **Models**:
  - `gemini-2.5-flash` — analyze, thumbnail vision, title lab, hook generator (constant `GEMINI_MODEL` in `lib/gemini.ts`).
  - `text-embedding-004` — topic clustering (constant `EMBEDDING_MODEL` in `lib/embeddings.ts`).
  - `gemini-2.5-flash-image-preview` — thumbnail generator (constant in the studio thumbnails route).
  - Changing any model requires updating this PRD.
- **Thinking budget**: **MUST** be set to `0` for structured extraction calls (analyze, thumbnail, title lab, hook). The model otherwise consumes the entire output budget on internal thinking and returns empty text.
- **Response schema**: ALWAYS pass `responseSchema` for structured calls. Without it the model occasionally omits required fields.
- **Validation endpoint**: `https://generativelanguage.googleapis.com/v1beta/models?key=<key>` — cheap unauthenticated probe.

---

## 6. Data Contracts

Source of truth for types: `types/youtube.ts` and the schema helpers in `lib/analyzePrompt.ts` / `lib/thumbnailPrompt.ts`. Any change to these files MUST be reflected below and in `tests/utils/schemas.ts` (the test-side validators).

```ts
// types/youtube.ts
interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  subscriberCount: number;
  viewCount: number;
}

interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  publishedAt: string;       // ISO-8601 UTC
  duration: string;          // ISO-8601 (e.g. PT5M12S)
  thumbnailUrl?: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  isShort?: boolean;         // authoritative Shorts classification (see § 4.10)
  tags?: string[];           // snippet.tags[] — absent when creator set no tags
}
```

Cookies (server ↔ client):

| Name             | Purpose             | Scope  | Lifetime |
|------------------|---------------------|--------|----------|
| `yt_api_key`     | YouTube Data key    | `/`    | 1 year   |
| `gemini_api_key` | Gemini key          | `/`    | 1 year   |

localStorage:

| Key                       | Purpose                                                |
|---------------------------|--------------------------------------------------------|
| `ytstudio:ytKey`          | Mirror of the YouTube cookie, for UI display           |
| `ytstudio:geminiKey`      | Mirror of the Gemini cookie, for UI display            |
| `ytstudio:history`        | Array of up to 12 `HistoryItem`                        |
| `ytstudio:compareDraft`   | Channel ids the user is queueing for `/compare`        |
| `ytstudio:theme`          | `"light"` / `"dark"` (system preference if absent)     |
| `ytstudio:thumb:<videoId>`| `{ analysis, savedAt }` — Gemini thumbnail analysis, 24 h TTL |
| `ytstudio:meta:<videoId>` | `{ analysis, savedAt }` — Gemini metadata (title/description/tags) analysis, 24 h TTL |

IndexedDB:

| Database  | Object store          | Key path    | Purpose                                                                                                                                                |
|-----------|-----------------------|-------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ytstudio`| `dashboardSnapshots`  | `channelId` | Cached channel + last-50 video payload. v1: `DashboardSnapshot`. v2: `DashboardHistory` (entries[] capped at 30, dedupe window 5 min, 24h per-entry TTL). Migrates automatically on read. |

Phase 4 additions — `lib/dashboardSnapshot.ts`, `lib/timeSeries.ts`, `lib/breakout.ts`, `lib/ngrams.ts`:

```ts
interface DashboardHistory {
  schemaVersion: 2;
  channelId: string;
  channelTitle: string;
  entries: DashboardSnapshot[]; // chronological; capped at HISTORY_CAP = 30
}

interface GrowthPoint {
  savedAt: string;        // ISO-8601
  subCount: number;
  totalViews: number;
  avgViews: number;
  uploadsPerWeek: number;
}

interface DeltaRow {
  fromSavedAt: string;
  toSavedAt: string;
  spanDays: number;
  subCountDelta: number;
  totalViewsDelta: number;
  avgViewsDelta: number;
  uploadsPerWeekDelta: number;
}

interface BreakoutEntry {
  id: string;
  title: string;
  thumbnailUrl?: string;
  previousViews: number;
  currentViews: number;
  deltaAbs: number;
  deltaPct: number;
}

interface NgramEntry {
  phrase: string;
  count: number;          // # titles containing the phrase
  weightedViews: number;  // sum of viewCount per matching title
}
```

Phase 4 Gemini response schemas (see § 4.16 for semantics):

```ts
// SCRIPT_SCHEMA
interface ScriptOutline {
  coldOpen: string;
  hook: string;
  beats: { heading: string; bullets: string[] }[];
  callToAction: string;
  outro: string;
}

// AB_TITLE_SCHEMA
interface AbTitleResult {
  winnerIndex: 0 | 1;
  axes: { axis: "clarity" | "curiosity" | "seo" | "clickability"; a: number; b: number }[];
  reasons: string[];
}

// AB_THUMBNAIL_SCHEMA
interface AbThumbnailResult {
  winnerIndex: 0 | 1;
  verdict: string;
  axisScores: { axis: "faceImpact" | "readability" | "contrast" | "curiosityGap"; a: number; b: number }[];
  improvements: string[];
}

// COMPARE_GAP_SCHEMA
interface CompareGapResult {
  sharedTopics: string[];
  perChannelGaps: { channelId: string; missingTopics: string[]; notes: string }[];
}

// CLUSTER_IDEAS_SCHEMA
interface ClusterIdeasResult {
  ideas: { title: string; hook: string; why: string }[];
}
```

---

## 7. Security & Privacy

- **BYOK only.** No server-side API keys. `.env.local` is documentation and must contain no secrets.
- **Keys in cookies.** Set `Path=/; Max-Age=31536000; SameSite=Lax`; add `Secure` on https.
- **Keys in localStorage.** Only for UI display (to let the user see a masked value without re-entering).
- **No server persistence.** Every server action is stateless except for the process-local `lib/youtube.ts` cache.
- **Cache isolation.** Cache keys are prefixed with the first 16 hex chars of `sha256(apiKey)` so concurrent visitors in a multi-tenant deployment never share cached data.
- **Never log secrets.** No console.log of keys. Validation failures log the finish reason / safety ratings but never the key material.
- **Sanitize inputs.** `parseChannelInput` is regex-constrained; `thumbnailUrl` is restricted to http/https via `isValidHttpUrl`; image MIME is whitelisted.
- **Local-only longitudinal history.** `DashboardHistory` snapshots never leave the browser. Each channel's history is capped at `HISTORY_CAP = 30` entries and de-duplicated within a 5-minute window, so refreshing a page can't inflate the series and no stale data grows unbounded. Users can clear all history by deleting the `ytstudio` IndexedDB database in their browser dev tools.
- **A/B thumbnail uploads.** Uploaded images are streamed straight into the Gemini request as `inlineData` parts and never written to disk on the server. Maximum 5 MiB per image and MIME must be jpeg/png/webp; anything else is rejected with an actionable error.
- **Donate button.** Pure outbound link (see § 4.17). No payment SDKs are loaded; `Permissions-Policy: payment=()` keeps the Payment Request API disabled. `resolveDonateUrl` enforces `https://` so an env misconfiguration cannot mint an `http:` / `javascript:` target.
- **Production security headers.** Shipped by `next.config.mjs` on every response:
  - `Content-Security-Policy`: `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, `base-uri 'self'`, `img-src` whitelisted to YouTube's three image CDNs plus `data:` / `blob:` for local previews, `connect-src 'self'` (all Gemini/YouTube traffic is server-side only — the browser never calls Google directly), `upgrade-insecure-requests` in prod. `script-src` keeps `'unsafe-inline'` (the pre-hydration theme bootstrap in `app/layout.tsx` and Next's hydration payload rely on it); dev mode also allows `'unsafe-eval'` for React Fast Refresh. `style-src 'unsafe-inline'` is required by `next/font` and Tailwind JIT.
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
  - `Permissions-Policy` disables camera, microphone, geolocation, payment, USB, magnetometer, accelerometer, gyroscope.
  - `Cross-Origin-Opener-Policy: same-origin-allow-popups` so the Support button's `window.open` still works while blocking cross-origin window access.
- **Telemetry CSP pinning.** `NEXT_PUBLIC_TELEMETRY_ENDPOINT`, if set, has its origin added to `connect-src` at build time so the error reporter can `fetch()` it without loosening the policy for other hosts.

---

## 8. Error Catalogue

All user-facing error strings shipped by the app. Changing one here requires updating the matching test assertion. Tests that reference these strings:

| Error constant / string                                                     | Location                  | Status | Test(s)                                    |
|-----------------------------------------------------------------------------|---------------------------|--------|--------------------------------------------|
| `"Add your YouTube Data API v3 key in the API Keys panel to continue."`     | `/api/channel`            | 401    | `api-channel.test.ts`                      |
| `"Add your YouTube Data API v3 key in the API Keys panel to run analysis."` | `/api/analyze`            | 401    | `api-analyze.test.ts`                      |
| `"Add your Gemini API key in the API Keys panel to run analysis."`          | `/api/analyze`            | 401    | `api-analyze.test.ts`                      |
| `"Add your Gemini API key in the API Keys panel to analyze thumbnails."`    | `/api/thumbnail`          | 401    | `api-thumbnail.test.ts`                    |
| `YOUTUBE_QUOTA_EXCEEDED_MESSAGE` = `"YouTube quota exceeded, try again tomorrow."` | `lib/errors.ts`      | 429    | `errors.test.ts`, `api-channel.test.ts`    |
| `YOUTUBE_INVALID_API_KEY_MESSAGE` = `"Your YouTube API key was rejected. Update it in the API Keys panel and try again."` | `lib/errors.ts` | 400 | `errors.test.ts`, `api-channel.test.ts`, `api-analyze.test.ts` |
| `"Invalid channel input"`                                                   | `/api/channel`            | 400    | `api-channel.test.ts`                      |
| `"Channel not found"`                                                       | `/api/channel`            | 404    | `api-channel.test.ts`                      |
| `"Failed to resolve channel"`                                               | `/api/channel`            | 500    | `api-channel.test.ts`                      |
| `"Failed to fetch videos for analysis"`                                     | `/api/analyze`            | 500    | `api-analyze.test.ts`                      |
| `"Invalid JSON body"`                                                       | analyze / thumbnail / validate-key | 400 | each route's test                 |
| `"channelId is required"`                                                   | `/api/analyze`            | 400    | `api-analyze.test.ts`                      |
| `"videoId, thumbnailUrl, and title are required"`                           | `/api/thumbnail`          | 400    | `api-thumbnail.test.ts`                    |
| `"Invalid thumbnailUrl"`                                                    | `/api/thumbnail`          | 400    | `api-thumbnail.test.ts`                    |
| `"Failed to fetch thumbnail image"`                                         | `/api/thumbnail`          | 400    | `api-thumbnail.test.ts`                    |
| `"Unsupported image type: <mime>"`                                          | `/api/thumbnail`          | 400    | `api-thumbnail.test.ts`                    |
| `"Gemini returned an empty response"`                                       | `/api/thumbnail`          | 502    | `api-thumbnail.test.ts`                    |
| `"Gemini did not return valid JSON"`                                        | `/api/thumbnail`          | 502    | `api-thumbnail.test.ts`                    |
| `"Key is required"`                                                         | `/api/validate-key`       | 400    | `api-validate-key.test.ts`                 |
| `"Unknown key id"`                                                          | `/api/validate-key`       | 400    | `api-validate-key.test.ts`                 |
| `"Failed to load channel comparison."`                                      | `/api/compare`            | 500    | `api-compare.test.ts`                      |
| `"Add your YouTube Data API v3 key in the API Keys panel to compare channels."` | `/api/compare`        | 401    | `api-compare.test.ts`                      |
| `"Provide at least 2 channel ids (max 4)."`                                 | `/api/compare`            | 400    | `api-compare.test.ts`                      |
| `"Could not resolve enough channels to compare."`                           | `/api/compare`            | 404    | `api-compare.test.ts`                      |
| `"Add your YouTube Data API v3 key in the API Keys panel to generate titles."` | `/api/studio/titles`   | 401    | `api-studio-titles.test.ts`                |
| `"Add your Gemini API key in the API Keys panel to generate titles."`       | `/api/studio/titles`      | 401    | `api-studio-titles.test.ts`                |
| `"channelId is required"`                                                   | `/api/studio/titles`, `/api/studio/clusters` | 400 | each route's test         |
| `"topic is required"`                                                       | `/api/studio/titles`      | 400    | `api-studio-titles.test.ts`                |
| `"topic must be 280 characters or fewer"`                                   | `/api/studio/titles`      | 400    | `api-studio-titles.test.ts`                |
| `"Failed to load channel videos for title generation"`                      | `/api/studio/titles`      | 500    | `api-studio-titles.test.ts`                |
| `"Add your Gemini API key in the API Keys panel to generate hooks."`        | `/api/studio/hook`        | 401    | `api-studio-hook.test.ts`                  |
| `"title and outline are required"`                                          | `/api/studio/hook`        | 400    | `api-studio-hook.test.ts`                  |
| `"title must be 200 characters or fewer"`                                   | `/api/studio/hook`        | 400    | `api-studio-hook.test.ts`                  |
| `"outline must be 4000 characters or fewer"`                                | `/api/studio/hook`        | 400    | `api-studio-hook.test.ts`                  |
| `"Add your YouTube Data API v3 key in the API Keys panel to cluster topics."` | `/api/studio/clusters` | 401    | `api-studio-clusters.test.ts`              |
| `"Add your Gemini API key in the API Keys panel to cluster topics."`        | `/api/studio/clusters`    | 401    | `api-studio-clusters.test.ts`              |
| `"Not enough videos with titles to cluster (need at least 2)."`             | `/api/studio/clusters`    | 422    | `api-studio-clusters.test.ts`              |
| `"Failed to embed titles"`                                                  | `/api/studio/clusters`    | 502    | `api-studio-clusters.test.ts`              |
| `"Embedding service returned no usable vectors."`                           | `/api/studio/clusters`    | 502    | `api-studio-clusters.test.ts`              |
| `"Failed to load channel videos for clustering"`                            | `/api/studio/clusters`    | 500    | `api-studio-clusters.test.ts`              |
| `"Add your Gemini API key in the API Keys panel to generate thumbnails."`   | `/api/studio/thumbnails`  | 401    | `api-studio-thumbnails.test.ts`            |
| `"prompt is required"`                                                      | `/api/studio/thumbnails`  | 400    | `api-studio-thumbnails.test.ts`            |
| `"prompt must be 500 characters or fewer"`                                  | `/api/studio/thumbnails`  | 400    | `api-studio-thumbnails.test.ts`            |
| `"Image generation failed"`                                                 | `/api/studio/thumbnails`  | 502    | `api-studio-thumbnails.test.ts`            |
| `"Image model returned no inline image data"`                               | `/api/studio/thumbnails`  | 502    | `api-studio-thumbnails.test.ts`            |
| `"Add your Gemini API key in the API Keys panel to generate scripts."`      | `/api/studio/script`      | 401    | `api-studio-script.test.ts`                |
| `"title is required"`                                                       | `/api/studio/script`      | 400    | `api-studio-script.test.ts`                |
| `"title must be <N> characters or fewer"` (script, ab-title, cluster ideas) | studio routes             | 400    | per-route tests                            |
| `targetMinutes must be an integer between <min> and <max>`                  | `/api/studio/script`      | 400    | `api-studio-script.test.ts`                |
| `"audience is too long"` / `"channelContext is too long"`                   | `/api/studio/script`, `/api/studio/ab-title`, `/api/studio/clusters/ideas` | 400 | per-route tests |
| `"Add your Gemini API key in the API Keys panel to score titles."`          | `/api/studio/ab-title`    | 401    | `api-studio-abtitle.test.ts`               |
| `"titleA is required"` / `"titleB is required"` / `"titleA and titleB must differ"` | `/api/studio/ab-title` | 400 | `api-studio-abtitle.test.ts`               |
| `"titleA is too long"` / `"titleB is too long"`                             | `/api/studio/ab-title`    | 400    | `api-studio-abtitle.test.ts`               |
| `"Add your Gemini API key in the API Keys panel to compare thumbnails."`    | `/api/studio/ab-thumbnail`| 401    | `api-studio-abthumbnail.test.ts`           |
| `"Use multipart/form-data with imageA/imageB or JSON with imageUrlA/imageUrlB"` | `/api/studio/ab-thumbnail` | 400 | `api-studio-abthumbnail.test.ts`           |
| `"imageA and imageB file parts are required"`                               | `/api/studio/ab-thumbnail`| 400    | `api-studio-abthumbnail.test.ts`           |
| `"imageUrlA and imageUrlB are required"`                                    | `/api/studio/ab-thumbnail`| 400    | `api-studio-abthumbnail.test.ts`           |
| `"Unsupported image type: <mime>"` / `"Image exceeds 5 MB limit"` / `"Invalid image URL"` | `/api/studio/ab-thumbnail` | 400 | `api-studio-abthumbnail.test.ts` |
| `"Gemini call failed"`                                                      | `/api/studio/ab-thumbnail`, `/api/compare/gap`, `/api/studio/clusters/ideas` | 502 | per-route tests |
| `"Add your YouTube Data API v3 key in the API Keys panel to compare channels."` | `/api/compare/gap`    | 401    | `api-compare-gap.test.ts`                  |
| `"Add your Gemini API key in the API Keys panel to run gap analysis."`      | `/api/compare/gap`        | 401    | `api-compare-gap.test.ts`                  |
| `"Provide at least 2 channel ids (max 4)."` / `"focus is too long"`         | `/api/compare/gap`        | 400    | `api-compare-gap.test.ts`                  |
| `"Could not resolve enough channels for gap analysis."`                     | `/api/compare/gap`        | 404    | `api-compare-gap.test.ts`                  |
| `"Add your Gemini API key in the API Keys panel to ideate for clusters."`   | `/api/studio/clusters/ideas` | 401 | `api-studio-cluster-ideas.test.ts`         |
| `"label is required"` / `"label is too long"` / `"sampleTitles must be an array"` / `"sampleTitles must not be empty"` / `"sampleTitles must be strings"` / `"medianViews must be a non-negative number"` | `/api/studio/clusters/ideas` | 400 | `api-studio-cluster-ideas.test.ts` |
| `"Add your YouTube API key in the API Keys panel to generate data-grounded ideas."` | `/api/studio/ideate` | 401 | `api-studio-ideate.test.ts` |
| `"Add your Gemini API key in the API Keys panel to generate data-grounded ideas."` | `/api/studio/ideate` | 401 | `api-studio-ideate.test.ts` |
| `"keywords must include at least one seed term"` / `"Invalid JSON body"` | `/api/studio/ideate` | 400 | `api-studio-ideate.test.ts` |
| `"YouTube fetch failed"` / `"Gemini call failed"` / `"Gemini returned an empty response"` / `"Gemini did not return valid JSON"` | `/api/studio/ideate` | 502 | `api-studio-ideate.test.ts` |
| `"Failed to generate PDF. Try again."` | `/studio/ideate` client export action | client | `components/VideoIdeate.tsx` |
| `"Failed to generate ideas. Try again."` | dashboard idea widget client action | client | `components/DashboardIdeaEngine.tsx` |

---

## 9. Testing Strategy

Three layers, configured in `vitest.config.ts`. Full docs in `tests/README.md`.

### 9.1 Unit (`tests/unit/`)

Pure logic, no network. Must stay fast (< 1s total).

- Core: `stats.test.ts` · `channelResolver.test.ts` · `analyzePrompt.test.ts` · `thumbnailPrompt.test.ts` · `errors.test.ts` · `gemini.test.ts` · `youtube.test.ts` (with `googleapis` mocked).
- Phase 1: `csv.test.ts` · `outliers.test.ts` · `heatmap.test.ts` · `compareStats.test.ts` · `telemetry.test.ts`.
- Phase 2 (Studio): `titleLabPrompt.test.ts` · `hookPrompt.test.ts` · `cluster.test.ts` · `embeddings.test.ts` · `thumbnailGenPrompt.test.ts`.
- Phase 3: `dashboardSnapshot.test.ts` · `commands.test.ts`.
- Phase 4 (Longitudinal): `timeSeries.test.ts` · `breakout.test.ts` · `duration.test.ts` · `ngrams.test.ts` · `dashboardIdeaEngine.test.ts`. `dashboardSnapshot.test.ts` extended with v1→v2 migration + dedupe + cap cases.
- Phase 4 (Studio II): `scriptPrompt.test.ts` · `abTitlePrompt.test.ts` · `abThumbnailPrompt.test.ts` · `compareGapPrompt.test.ts` · `clusterIdeasPrompt.test.ts`.
- Video Ideate V1: `videoIdeate.test.ts` · `videoIdeatePrompt.test.ts`.
- Production hardening: `donate.test.ts` (resolver + env-override round trip). Palette discoverability for `settings.donate` is pinned in `commands.test.ts`.

### 9.2 Integration (`tests/integration/`)

Route handlers end-to-end with `@/lib/*` and global `fetch` mocked.

- Core: `api-channel.test.ts` · `api-analyze.test.ts` (streaming asserted line-by-line) · `api-thumbnail.test.ts` · `api-validate-key.test.ts` · `api-videos.test.ts`.
- Phase 1: `api-compare.test.ts`.
- Phase 2 (Studio): `api-studio-titles.test.ts` · `api-studio-hook.test.ts` · `api-studio-clusters.test.ts` · `api-studio-thumbnails.test.ts`.
- Phase 4: `api-studio-script.test.ts` (NDJSON streamed meta/chunk/final/error) · `api-studio-abtitle.test.ts` · `api-studio-abthumbnail.test.ts` (multipart + URL inputs, plus missing `content-type` branch) · `api-compare-gap.test.ts` · `api-studio-cluster-ideas.test.ts`.
- Video Ideate V1: `api-studio-ideate.test.ts`.

### 9.3 Live (`tests/live/`)

Real YouTube + Gemini against `@LearnwithManoj`. Auto-skip via `describe.runIf(...)` when `.env.test.local` is absent.

Keys live ONLY in `.env.test.local` (git-ignored). Loaded by `tests/vitest.setup.ts`.

### 9.3.1 E2E (`tests/e2e/`)

Playwright Chromium runs the dev server (`npx next dev --port $PLAYWRIGHT_PORT`, default 3100) and exercises browser flows that don't require live external APIs:

- BYOK gating (landing CTA visibility, `/studio` redirect)
- Lookup / history / compare page shells
- Command palette open / filter / close — now also asserts the Phase 4 entries (`studio.script`, `studio.ab-title`, `studio.ab-thumbnail`, `compare.gap`) surface under their keywords.

Run via `npm run test:e2e` (or `npm run test:e2e:ui` for the inspector). First-time setup: `npx playwright install chromium`. E2E results don't feed coverage thresholds.

### 9.4 Coverage thresholds (enforced)

```
Statements 100 · Branches 100 · Functions 100 · Lines 100
```

Scope: `lib/**/*.ts` + `app/api/**/*.ts` (excluding `lib/clientApiKey.ts` and `lib/idb.ts`, both DOM-only modules). 286 unit + integration tests pass with 0 skipped.

**Rules for keeping the floor at 100%:**

- New code under `lib/**` or `app/api/**` MUST land with tests that exercise every branch.
- If a branch is genuinely unreachable (e.g. a defensive default that exists for type safety but the type system already proves the alternative is impossible), use `/* v8 ignore next */` with a one-line comment explaining why. Do NOT lower the threshold.
- Coverage is run via `npm run coverage`. The same command runs in CI; failing coverage fails the build.
- Release verification is run via `npm run verify:strict` (coverage + lint + typecheck + PRD sync check). `npm run build` is hard-gated through this command.
- `npm run prd:check` fails when any code path (`app/**`, `components/**`, `lib/**`, `tests/**`, `types/**`) changes without a matching `PRD.md` update. Temporary bypass is possible only with explicit `SKIP_PRD_CHECK=1`.

### 9.5 Known gaps & limitations (intentional, tracked)

- **No jsdom / React Testing Library layer.** UI components (`components/*.tsx`, page components under `app/`) are exercised only via the data they consume. Adding RTL is on the backlog; when added, landing-page gating, `KeyEditor`, `LookupForm`, and `/history` render tests should be the first wave. These files are outside the coverage scope (see § 9.4).
- **Negative-cache memoization in `lib/youtube.ts` is broken.** `getCached` uses `null` as the cache-miss sentinel, so when a function caches an explicit `null` (e.g. `getChannelByHandle` for an unknown handle, or `getChannelUploadsPlaylistId` for a channel without uploads), the next call sees `cached === null` and re-fetches. Tests cover the immediate return values but not memoization of `null`. Fix would require switching `cache.get(key)` to `cache.has(key)`-based detection or a `Symbol("MISS")` sentinel; treat as a separate, scoped change with its own tests.

---

## 10. Performance & Caching

- **In-process cache** in `lib/youtube.ts`. TTL 24 hours (`CACHE_TTL_MS = 24*60*60*1000`). Keyed by `sha256(apiKey).slice(0,16) + :resource:id`.
- **Dashboard refresh policy**: reads from cache by default, shows `Last refreshed` in the dashboard nav, auto-bypasses cache when cached channel/videos age exceeds 24 hours, and still supports explicit one-shot bypass via `?refresh=1`.
- **No Redis / external cache.** If deployed to multi-instance serverless, each instance has its own cache; that's acceptable (soft warm-up). If this changes, update this section and the cache key strategy.
- **Client caches** `localStorage` history (≤ 12 channels) and an IndexedDB snapshot store (`ytstudio` → `dashboardSnapshots`) with a 24-hour TTL; both are best-effort and never block UI.
- **Suspense streaming** on the dashboard so each section (`Header`, `Stats`, `Chart`, `Grid`) renders as soon as its data resolves.
- **No `search.list` on YouTube** — uploads-playlist pattern keeps per-channel cost at ~3 quota units.
- **Network priming**: `app/layout.tsx` adds `preconnect` + `dns-prefetch` for `i.ytimg.com` to overlap TLS with HTML parsing on the first dashboard load.
- **Security headers** — see § 7 for the full list (CSP, HSTS, COOP, Permissions-Policy, X-Frame-Options: DENY, etc.). `poweredByHeader` is disabled so the response never advertises the Next version.
- **Production build hardening** (`next.config.mjs`):
  - `productionBrowserSourceMaps: false` — never ship sourcemaps for client bundles.
  - `compiler.removeConsole: { exclude: ["warn", "error"] }` — strips `console.log/debug/info` from prod builds while preserving genuine failure paths.
  - `compress: true` + `images.formats: ["image/avif", "image/webp"]` for faster transfer of the (rare) statically-served assets.
  - Dev-only CSP relaxation (`'unsafe-eval'` for Fast Refresh, `ws:`/`wss:` for HMR) is gated on `NODE_ENV === "production"` so prod gets the strictest policy automatically.

---

## 11. Dependencies

Runtime (from `package.json`):

| Package          | Purpose                                        |
|------------------|------------------------------------------------|
| `next`           | Framework (App Router, server components)      |
| `react`/`-dom`   | UI                                             |
| `@google/genai`  | Gemini client (text + vision + streaming)      |
| `googleapis`     | YouTube Data API v3 client                     |
| `jspdf`          | Client-side PDF generation for Video Ideate export |
| `recharts`       | Performance chart                              |

Dev:

| Package                  | Purpose                                |
|--------------------------|----------------------------------------|
| `typescript`             | Type checking                          |
| `eslint` + `eslint-config-next` | Linting                         |
| `tailwindcss` + `postcss` | Styling                                |
| `vitest`                 | Test runner                            |
| `@vitest/coverage-v8`    | Coverage provider                      |
| `@playwright/test`       | E2E browser flows in `tests/e2e/`. Justified because no Vitest-only solution can realistically cover BYOK gating, cookie-aware redirects, or ⌘K interaction. Local-only by default; `npx playwright install chromium` once. |

Any new dependency MUST be justified here (why a built-in / existing utility was insufficient).

---

## 12. Glossary

- **BYOK** — Bring Your Own Key. User provides Google API credentials; the app holds nothing.
- **Uploads playlist** — Every YouTube channel has an auto-maintained playlist with every public upload. Using it costs far less quota than `search.list`.
- **Thinking budget** — Gemini 2.5 Flash's internal reasoning allowance. We set it to 0 for structured extraction to avoid empty responses.
- **Response schema** — JSON-Schema-like structure passed to Gemini to constrain its output.
- **NDJSON** — Newline-delimited JSON; one parseable JSON object per line. Used for `/api/analyze` streaming.
- **Live tests** — Tests that hit real external APIs with real keys. Gated, opt-in.

---

## 13. Change Log

| Date       | Author        | Change                                                                                 |
|------------|---------------|----------------------------------------------------------------------------------------|
| 2026-04-26 | Getting-started dashboard update | Updated `/getting-started` Step 6 ("Read the dashboard with context") to explicitly document the new `Idea Opportunity Engine` block, including why-now evidence, best format/window guidance, and one-click data-grounded idea generation. |
| 2026-04-26 | Idea engine timezone alignment | Updated `DashboardIdeaEngine` to always compute and display `Best Publish Window` in browser-local timezone (with timezone label), matching the dashboard heatmap behavior and avoiding UTC ambiguity. |
| 2026-04-26 | Dashboard idea engine | Added a new single-widget dashboard feature, `Idea Opportunity Engine`, that converts current channel signals into an actionable next-content direction with confidence and evidence bullets. Added click-triggered inline ideation (`Generate 3 Data-Grounded Ideas`) via `/api/studio/ideate`, deep-link handoff to `/studio/ideate?keywords=...`, deterministic helper logic in `lib/dashboardIdeaEngine.ts`, and unit coverage in `tests/unit/dashboardIdeaEngine.test.ts`. |
| 2026-04-26 | Landing quick-link update | Added a direct `Creator Studio` quick link to the landing page (`/`) alongside `View recent channels` and `Compare channels` for faster access to Studio tools after key setup. |
| 2026-04-26 | Video Ideate PDF export | Added one-click `Download As PDF` to `/studio/ideate` so creators can save generated idea suggestions for future reference. Added `lib/videoIdeateExport.ts` for deterministic PDF layout + safe filename generation and unit coverage in `tests/unit/videoIdeateExport.test.ts`. Added `jspdf` runtime dependency and documented the new client-facing export error string in the Error Catalogue. |
| 2026-04-26 | Video Ideate V1 | Added `Video Ideate` end-to-end (`/studio/ideate`, `/api/studio/ideate`, `lib/videoIdeate.ts`, `lib/videoIdeatePrompt.ts`) to generate last-30-days, YouTube-data-grounded niche ideas from user keyword seeds. Added Studio + command palette discoverability (`studio.ideate`), Getting Started mention, new ideate unit/integration suites, and updated error catalogue + integration docs. Coverage remains 100/100/100/100. |
| 2026-04-23 | Thumbnail score parity completion | Extended per-variant thumbnail scoring to `ThumbnailStudio` so generated variants across all regeneration/generation surfaces now display `Readability` and `Curiosity` metrics (with graceful N/A fallback when scoring fails). This completes score-display parity for Video Analyzer, Pre-Publish Analyzer, and Thumbnail Generator workflows. |
| 2026-04-23 | Thumbnail regeneration score parity | Standardized generated-thumbnail scoring display across recommendation-driven flows. `ThumbnailAnalysisPanel` (Video Analyzer) now scores each generated variant via `/api/thumbnail/file` and displays per-variant `Readability`, `Curiosity`, and composite score, matching Pre-Publish behavior. |
| 2026-04-23 | Pre-publish one-click workflow | Simplified `/studio/prepublish` actions to a single end-to-end button: `Analyze + Generate Recommendations`. One run now executes metadata analysis, thumbnail analysis, metadata regeneration, thumbnail generation (3 variants), and per-variant thumbnail scoring. Generated recommendation bundles (analysis + regenerated metadata + scored variants) are now persisted into draft records when `Update Draft` is saved for future reference. |
| 2026-04-23 | Getting-started refresh | Rewrote `/getting-started` to be the authoritative first-stop onboarding guide for new users. Updated setup and dashboard sections to cover the interpretation layer (Key Insights, confidence, explainability), reliability-based heatmap ranking and calendar drafts, snapshot-history consolidation behavior, the new `Pre-Publish Analyzer` workflow (including recommendation-based metadata/thumbnail regeneration), command palette discoverability, and current BYOK limitations for scheduled/private videos. |
| 2026-04-23 | Pre-publish regeneration actions | Extended `/studio/prepublish` to mirror `Video Analyzer` post-analysis workflows. After draft metadata analysis, users can now run `Generate Metadata` (via `/api/video-metadata/generate`) to produce a publish-ready metadata pack. After thumbnail analysis, users can run `Generate 3 Thumbnails` (via `/api/studio/thumbnails`) from improvement suggestions, preview variants, and download assets. |
| 2026-04-23 | Draft thumbnail persistence fix | Improved `/studio/prepublish` draft UX by persisting uploaded thumbnail bytes (`thumbnailMimeType` + `thumbnailBase64`) with the draft so thumbnail analysis works after reopening saved drafts without forced re-upload. Added a 2MB upload cap for local-storage safety and simplified fallback error messaging. |
| 2026-04-23 | Pre-publish thumbnail UX fix | Fixed confusing pre-publish thumbnail validation flow. Saved drafts now clearly indicate that thumbnail file bytes are not persisted and re-upload is required for analysis. `PrePublishAnalyzer` now supports fallback to legacy stored `thumbnailUrl` drafts when present, while preferring uploaded file analysis via `/api/thumbnail/file`. |
| 2026-04-23 | Pre-publish thumbnail upload | Updated `/studio/prepublish` draft workflow to use thumbnail **file upload** instead of URL input. Added new route `POST /api/thumbnail/file` that analyzes uploaded image bytes (`mimeType` + `imageBase64`) with existing Gemini thumbnail schema/prompt. Draft records now store `thumbnailFileName` metadata (not remote URLs) and require re-upload for analysis sessions. Added integration suite `tests/integration/api-thumbnail-file.test.ts` covering auth, validation, unsupported mime types, success path, empty model output, and malformed JSON handling. |
| 2026-04-23 | Pre-publish drafts analyzer | Added a new Creator Studio section for unpublished-video prep: `/studio/prepublish` with `PrePublishAnalyzer`. Creators can save local draft metadata (title, description, tags, thumbnail URL), review/edit drafts from browser storage, and run existing Gemini-powered metadata + thumbnail analysis before publish. Includes explicit BYOK constraint note that API-key mode cannot auto-fetch YouTube private/draft videos (OAuth required). Added Studio index card and command-palette entry `studio.prepublish`. |
| 2026-04-23 | Coverage hardening cleanup | Removed the previously ignored unreachable branch in snapshot day-comparison logic. Refactored `appendEntry` to parse timestamps once (`newestMs`, `snapMs`) and compare day boundaries via `isSameUtcDayFromMs(...)`, eliminating dead defensive checks while preserving behavior. Strict gate now passes at 100/100/100/100 without `v8 ignore` for this path. |
| 2026-04-23 | Coverage gate fix | Restored strict 100% coverage after snapshot-history hardening by marking an unreachable defensive branch in `isSameUtcDay` (`lib/dashboardSnapshot.ts`) with a justified `/* v8 ignore next */`. The branch is unreachable in production flow because `appendEntry` now guards the call behind finite parsed timestamps. |
| 2026-04-22 | History logo fallback fix | Fixed broken channel-logo rendering in `/history` recent-analysis cards. Added resilient avatar rendering that falls back to an initial badge when thumbnail loading fails (`onError`), preventing broken-image glyphs and preserving layout stability. |
| 2026-04-22 | Snapshot noise reduction | Reduced same-day dashboard snapshot churn. `appendEntry` now updates the latest entry in place (instead of appending) when the incoming snapshot lands on the same UTC day, is outside the short dedupe window, and the video lineup is structurally unchanged (same IDs/count). This preserves day-level history signal while preventing repeated opens from inflating "snapshots tracked". Added `videosStructuralChange` and expanded unit coverage in `tests/unit/dashboardSnapshot.test.ts`. |
| 2026-04-22 | Heatmap explainability UX | Added a dedicated `Why this slot?` explanation block in `PublishHeatmap` for the selected strongest window. It now surfaces the exact ranking inputs (`median views`, `sample count`, and computed reliability score) and includes a reusable help hint describing the formula (`medianViews × ln(1 + count)`). |
| 2026-04-22 | Heatmap best-practice refinement | Refined publish-time recommendations away from peak-only ranking to a reliability-adjusted model. `Strongest slot` and `Top Windows To Test` now rank by `recommendationScore = medianViews * ln(1 + count)` with a best-practice preference for slots having at least 2 uploads (fallback to any populated slot when data is sparse). This prevents one-off viral spikes from dominating scheduling guidance while still surfacing peak context in tooltips. |
| 2026-04-22 | Heatmap suggestion logic update | Updated publish-time recommendation logic to use peak performance by slot. `Strongest slot` and `Top Windows To Test` are now ranked by `maxViews` (highest observed view count in each day/hour bucket), while heatmap colour intensity remains median-based for visual stability. Added `maxViews` to `HeatmapCell` and `maxPeakViews` to `HeatmapResult`; updated unit tests in `tests/unit/heatmap.test.ts`. |
| 2026-04-22 | Timing CTA enhancement | Extended `PublishHeatmap` scheduling CTA to match "next 2 uploads" guidance. `Create 2 Calendar Drafts` now generates a single `.ics` file containing two VEVENT entries for the next two weekly occurrences of the strongest publish slot (1-hour blocks), replacing the single-event draft. |
| 2026-04-22 | Timing CTA refinement | Replaced non-actionable heatmap CTA behavior (clipboard copy) with a concrete scheduling action. `PublishHeatmap` CTA is now `Create Calendar Draft`, which downloads an `.ics` event for the next occurrence of the strongest publish slot (1-hour block) so creators can apply timing recommendations directly in their calendar workflow. |
| 2026-04-22 | Apply-this CTA | Added direct "Apply This" CTAs in interpretation sections. `PublishHeatmap` now includes `Apply This Timing` (copies the generated scheduling recommendation to clipboard with inline success/failure feedback). `TitleTrends` now includes `Apply This Title Pattern` linking directly to `Title Lab` (`/studio/titles`) with a forward-compatible `seed` query based on the top phrase/keyword. |
| 2026-04-22 | Insight depth upgrade | Upgraded `PublishHeatmap` and `TitleTrends` from descriptive widgets into decision-focused guidance. Both sections now include interpretation cards, confidence indicators, reusable `?` explainability hints (`InfoHint`), and concrete next actions. Heatmap adds "Top Windows To Test" chips plus confidence derived from publish-time sample depth; Title Trends adds winning-pattern narration and executable title-template guidance based on top weighted phrases/keywords. |
| 2026-04-22 | Dashboard insights | Implemented dashboard interpretation phases 1-3. Added a top `Key Insights` strip with channel-relative summaries, confidence badges, and explainability hints; introduced a channel-health composite score (`0-100`) with action cards; and upgraded `StatsCards` with interpretation lines and reusable `?` tooltip help UX. Added `components/InfoHint.tsx` and `components/DashboardInsights.tsx`; wired into `app/dashboard/[channelId]/page.tsx`. |
| 2026-04-22 | Mobile CTA pattern | Implemented a mobile-only compact footer CTA pattern (`components/MobileFooterCta.tsx`) replacing dual fixed badges on small screens. Mobile now shows one compact `Support` pill that toggles an action sheet with `Support This Project` and `Powered By: Sanoj Tech` links. Desktop keeps separate persistent badges (`DonateLink` bottom-right, `PoweredByLink` bottom-left). |
| 2026-04-22 | Mobile UX pass | Improved small-screen usability across core flows. Video Analyzer now opens as a mobile-friendly bottom sheet (`items-end`, `rounded-t-2xl`, `max-h-[92vh]`) while preserving desktop modal behavior. Analyzer action rows now stack full-width on mobile for better tap targets (`Analyze*`, `Generate*`) and revert to inline layout on larger breakpoints. Dashboard nav now shifts to a column-first mobile layout with wrapped utility links to prevent overflow. Global floating CTAs were rebalanced for phones: Donate pill reduced in mobile size and Powered-By badge moves above it on mobile (`bottom-14 right-3`) with compact label, then returns to bottom-left desktop placement. Added global bottom padding (`body pb-24`) to avoid content being hidden behind fixed mobile badges. |
| 2026-04-22 | Cache refresh fix | Fixed dashboard refresh-state caching bug where `Last Refreshed` stayed on `Just Now`. Root cause: bypassed fetches skipped both cache reads and writes, so auto-refresh paths never re-seeded cache. Updated YouTube data fetchers to treat `bypassCache` as read-bypass only and always write fresh responses back into cache. Added unit coverage for cache re-seeding after bypass calls. |
| 2026-04-22 | Branding + CTA visibility | Added a global `Powered By: Sanoj Technologies` badge (`components/PoweredByLink.tsx`) fixed at bottom-left linking to `https://sanojtechnologies.com/`. Increased donate CTA prominence by redesigning `DonateLink` to a stronger gradient pill (`Support This Project`) with larger size and higher-contrast styling while preserving secure outbound link attributes (`noopener`, `noreferrer`, `referrerPolicy=no-referrer`). |
| 2026-04-22 | UX polish 7   | Completed follow-up init-caps cleanup for remaining button-like action labels in navigation/CTA links: `Analyze Another Channel`, `Refresh Data`, `Channel Lookup`, `Add A New Channel First →`, and Getting Started footer CTA variants (`Analyze A Channel →`, `Add Your Keys →`). |
| 2026-04-22 | UX polish 6   | Completed app-wide init-caps sweep for action controls. Standardized remaining non-init-caps button/action labels including `Cluster Topics`, `Ideate For This Cluster`, `Generate N Thumbnails`, `URL Pair`, `Compare Thumbnails`, `Run Gap Analysis`, `Score Titles`, `Generate Outline`, `Generate Hooks + Description`, `Generate 10 Titles`, `Add To Compare`, `In Comparison ×`, `Videos As CSV`, `Snapshot As JSON`, and global error action `Try Again`. |
| 2026-04-22 | UX polish 5   | Applied init-caps consistency pass to remaining Video Analyzer action labels: `Analyze Thumbnail`, `Re-Analyze Thumbnail`, `Analyze Metadata`, `Re-Analyze Metadata`, and `Copy All`. |
| 2026-04-22 | UX polish 4   | Shortened Video Analyzer post-analysis action button labels and switched them to Init Caps (`Generate 3 Thumbnails`, `Generate Metadata`) with concise loading states (`Generating 3 Thumbnails…`, `Generating Metadata…`). Added tooltips preserving full action context. |
| 2026-04-22 | UX polish 3   | Refined Video Analyzer post-analysis action button styling for better visual hierarchy: reduced size/padding to a compact control and switched to a subtler violet-tint outline style (`border-violet-500/40`, `bg-violet-500/10`, `text-violet-200`) with lighter hover states. Applied to both "Generate 3 thumbnails from suggestions" and "Generate metadata from recommendations". |
| 2026-04-22 | Metadata scoring fix | Generated metadata pack now carries its own `overallScore` from `POST /api/video-metadata/generate` and the UI displays this generated-pack score instead of reusing the original analysis score. Route schema + runtime validation now require `overallScore` (int 1-10), ensuring the value reflects newly generated title/description/tags quality. |
| 2026-04-22 | Thumbnail UX fix | Fixed `Generate 3 thumbnails from suggestions` failure on long recommendation text by compacting and hard-clamping the synthesized generation prompt to the thumbnail API limit (500 chars) before calling `/api/studio/thumbnails`. |
| 2026-04-22 | UX polish 2   | Added `Overall SEO / Packaging Score` to the `Generated metadata pack` block in Video Analyzer metadata tab so final copy output retains score context alongside generated title/description/tags. |
| 2026-04-22 | Metadata generation redesign | Reworked Video Analyzer metadata-pack generation to use a dedicated server rewrite route (`POST /api/video-metadata/generate`) instead of client-side string assembly. The route consumes current metadata + recommended title + top recommendations + suggestions, prompts Gemini for a coherent publish-ready `{ title, description, tags }` pack with strict JSON schema, and returns sanitized tags (deduped/trimmed/capped). This ensures description logic is genuinely title-aligned and free of recommendation-note artifacts. Added integration suite `tests/integration/api-video-metadata-generate.test.ts` covering auth, validation, empty/malformed/shape-invalid provider responses, fallback title behavior, and prompt shaping for missing optional guidance. |
| 2026-04-22 | Metadata fix 2 | Updated metadata-pack generation so the produced description is aligned to the newly recommended title. Any explicit old-title mentions in generated description text are replaced with the selected new title before rendering/copying. |
| 2026-04-22 | Metadata fix  | Corrected generated metadata pack behavior to output publish-ready content only. Removed accidental inclusion of recommendation prose blocks (e.g., `Prioritized improvements`) from generated descriptions and added defensive stripping for recommendation-note leakage in `MetadataAnalysisPanel`. |
| 2026-04-22 | UX polish     | Added copy actions to the generated metadata pack in Video Analyzer metadata tab: per-field copy buttons (`Title`, `Description`, `Tags`) plus `Copy all`, with inline success/failure feedback. |
| 2026-04-22 | Video Analyzer | Added post-analysis action generators inside Video Analyzer modal. Thumbnail tab now shows "Generate 3 thumbnails from suggestions" after a successful thumbnail analysis and renders downloadable variants by calling `/api/studio/thumbnails` with a prompt synthesized from `improvementSuggestions`. Metadata tab now shows "Generate metadata from recommendations" after successful metadata analysis and produces a ready-to-use package (title, description, merged tags) derived from `titleSuggestions`, `descriptionSuggestions`, `suggestedTags`, and `topRecommendations`. |
| 2026-04-22 | Dev stability | Added `npm run dev:reset` (`rm -rf .next && WATCHPACK_POLLING=true next dev`) for local recovery when Next.js dev runtime cache corruption or duplicate dev servers cause transient hard-refresh overlays (e.g., `Cannot read properties of undefined (reading 'call')`). |
| 2026-04-22 | Deploy guard  | Added `vercel.json` with `buildCommand: "npm run build"` to explicitly route Vercel deployments through the strict gate. Since `build` already runs `verify:strict` (`coverage + lint + typecheck + prd:check`), any rule failure now blocks deployment on Vercel. |
| 2026-04-22 | Reliability   | Restored global 100% coverage after regression by adding targeted branch tests for studio thumbnail/clusters error-detail extraction and embedding fallback/rethrow paths (`tests/integration/api-studio-thumbnails.test.ts`, `tests/integration/api-studio-clusters.test.ts`, `tests/unit/embeddings.test.ts`). Added strict release gate scripts: `npm run verify:strict` (coverage + lint + typecheck + PRD sync) and `npm run prd:check` (`scripts/check-prd-sync.mjs`) to fail if code changes without `PRD.md` updates; `npm run build` now enforces this gate. Updated dashboard data freshness behavior to include a visible `Last refreshed` indicator and automatic cache bypass when data age exceeds 24h (`lib/youtube.ts`, `app/dashboard/[channelId]/page.tsx`) and documented cache TTL as 24h. |
| 2026-04-22 | SEO           | SEO hardening pass for public hosting: `metadataBase` now derives from `NEXT_PUBLIC_SITE_URL` via new `lib/siteUrl.ts` (safe fallback to `https://ytstudio.local`), global metadata expanded (keywords, canonical baseline, formatDetection, viewport themeColor), and landing page now emits JSON-LD `WebApplication`. Added `app/robots.ts` (allow public routes, disallow `/api/`, `/dashboard/`, `/keys*`, `/history`), `app/sitemap.ts` (public discoverable pages only), and `app/manifest.ts`. Added route-level metadata for public pages (`/`, `/lookup`, `/compare`, `/compare/gap`, `/studio`) and explicit `noindex,nofollow` on sensitive routes (`/keys*`, `/dashboard/[channelId]`, `/history` via `history/layout.tsx`). Added tests: `tests/unit/siteUrl.test.ts` + `tests/unit/seoRoutes.test.ts`. |
| 2026-04-21 | Initial v1.0  | PRD created. Captured current state of all features, contracts, errors, and tests.     |
| 2026-04-21 | Refactor      | Rewrote `YOUTUBE_INVALID_API_KEY_MESSAGE` for BYOK — now points to the API Keys panel instead of the removed `.env.local` flow. |
| 2026-04-21 | Coverage      | Closed every uncovered branch in `lib/**` + `app/api/**` (cache TTL expiry, all-invalid-date stats, reason-less error entries, missing `q`/`content-type` headers, empty/non-Error stream chunks, uploads-playlist cache reuse, etc.). Removed the 2 inverse-gated `describe.skipIf` placeholders in the live suite. Raised vitest thresholds from 80/70/80/80 to 100/100/100/100. Documented the negative-cache limitation in § 9.5. |
| 2026-04-21 | Bugfix        | `uploadFrequencyPerWeek` now uses `(validDateCount − 1) / spanDays × 7` instead of `videos.length / spanDays × 7`. The previous formula counted videos as densities rather than intervals and over-reported cadence by `N/(N−1)` (e.g. "2 videos a week apart" used to read 2/week, now correctly reads 1/week). Invalid `publishedAt` rows are now also excluded from the interval count. Stats contract in § 4.4 + tests in `tests/unit/stats.test.ts` updated to pin the corrected math. |
| 2026-04-21 | Bugfix        | `uploadFrequencyPerWeek` now reports **recent** cadence instead of the lifetime average over the 50-video window. Root cause: for creators who ramped up recently, the sample mixed ~30 fresh daily uploads with ~20 multi-year-old uploads, stretching `spanDays` to thousands of days and collapsing the metric to ~0.2/week. New `recentCadencePerWeek` helper (exported constants `RECENT_CADENCE_WINDOW_DAYS = 90` + `RECENT_CADENCE_FALLBACK_SAMPLE = 10`) anchors the window at the newest sample date (keeps the function pure — no `Date.now()` coupling) and falls back to the last 10 uploads when the 90-day window is sparse. `StatsCards` card gains a tooltip (`title`) explaining the window. § 4.4 design notes rewritten; 4 new regression cases added to `tests/unit/stats.test.ts` (ramp-up, straggler exclusion, sparse fallback, fallback cap). Coverage held at 100/100/100/100. |
| 2026-04-21 | Bugfix        | `SHORT_MAX_SECONDS` raised from **60 → 180** to match YouTube's post-2024-10-15 Shorts rule. Previously, vertical Shorts in the 1–3 min range (now the dominant length on modern channels, e.g. `UCLXMi-fsdb3GaJuoVvX8mMg`) were mis-bucketed as Long-form, inflating long-form counts and hiding real Shorts from the Shorts filter. `lib/duration.ts` docstring now documents the duration-only heuristic + known false-positive edge (no aspect-ratio signal in YouTube Data API v3 `contentDetails`); `components/VideoGrid.tsx` format toggle gains a `title` tooltip explaining this. § 4.15.4 rewritten; `tests/unit/duration.test.ts` boundary cases updated (30 s, 60 s, 90 s, 2 m 30 s, 3 m → short; 3 m 1 s, 181 s, 5 m → long) plus a pin on `SHORT_MAX_SECONDS === 180`. Coverage held at 100/100/100/100. |
| 2026-04-21 | Fix           | Purely-duration classification was still wrong in the other direction: 1–3 min **horizontal** trailers/intros were getting lumped into Shorts. Since the YouTube Data API v3 doesn't expose aspect ratio, the only authoritative signal is YouTube itself. Added `lib/shortsProbe.ts` — a server-side probe of `https://www.youtube.com/shorts/{id}` with `redirect: "manual"`. `200` → Short, `3xx` → regular video, anything else → inconclusive (falls back to duration). Results are memoised in-process for 24 h (a video's Shorts status is immutable once uploaded), probes time out after 4 s via `AbortController`, and concurrency is bounded at 8 to stay polite to YouTube's edge. `enrichVideosWithShortsProbe` only probes videos whose duration ≤ `SHORT_MAX_SECONDS` so > 3 min videos skip the round trip. Dashboard server component chains `.then(enrichVideosWithShortsProbe)` after `getChannelVideos` so every Suspense boundary sees the same probed data. `types/youtube.ts` `YouTubeVideo` gains optional `isShort?: boolean`; `classifyVideoFormat` now prefers that flag over the duration heuristic. New `tests/unit/shortsProbe.test.ts` (19 cases: status mapping, empty-id guards, URL encoding, manual-redirect/method/UA assertions, cache-on-success vs no-cache-on-failure, body.cancel leak guard + rejection tolerance, fake-timer timeout path, ambiguous-range-only probing, concurrency bound, clamp, no-op short-circuit). § 4.15.4 rewritten; directory map gains `shortsProbe.ts`. Coverage held at 100/100/100/100 across `lib/**` + `app/api/**`. |
| 2026-04-21 | Phase 1       | Added compare mode (`/compare` + `/api/compare` + `lib/compareStats.ts`), outlier detection (`lib/outliers.ts`), publish-time heatmap (`lib/heatmap.ts`), CSV/JSON export (`lib/csv.ts` + `components/ExportButton.tsx`), dark/light theme toggle (`components/ThemeToggle.tsx` + pre-hydration script in `app/layout.tsx`), and a pluggable telemetry seam (`lib/telemetry.ts`) wired into all error boundaries and uncaught route paths. Removed the "no channel comparison" non-goal. New error catalogue rows + 5 new unit suites + 1 new integration suite, all at 100% coverage. |
| 2026-04-21 | Phase 2       | Added Creator Studio: Title Lab (`/studio/titles` + `/api/studio/titles`), Hook + Description + Chapters (`/studio/hook` + `/api/studio/hook`), Topic Clusters (`/studio/clusters` + `/api/studio/clusters` powered by `text-embedding-004` + agglomerative cosine clustering in `lib/cluster.ts`), and Thumbnail Generator (`/studio/thumbnails` + `/api/studio/thumbnails` powered by `gemini-2.5-flash-image-preview`). Studio index at `/studio`, linked from the dashboard top nav and the lookup page. New libs: `lib/titleLabPrompt.ts`, `lib/hookPrompt.ts`, `lib/cluster.ts`, `lib/embeddings.ts`, `lib/thumbnailGenPrompt.ts`. 5 new unit suites + 4 new integration suites. Coverage held at 100/100/100/100. |
| 2026-04-21 | Phase 3       | Added IndexedDB dashboard cache (`lib/dashboardSnapshot.ts` + `lib/idb.ts` + `components/SnapshotPersister.tsx`) with snapshot summaries surfaced on `/history`. Added a global ⌘K / Ctrl+K command palette (`lib/commands.ts` + `components/CommandPalette.tsx`) covering navigation, studio tools, channel history, key management, and theme toggle. Accessibility pass: skip link, visible focus rings, `prefers-reduced-motion` honor, ARIA + focus trap on `ThumbnailAnalyzer`, `id="main"` on every page region. Perf + observability: documented `NEXT_PUBLIC_TELEMETRY_ENDPOINT` in `.env.local`, added security headers + `i.ytimg.com` preconnect via `next.config.mjs` and `app/layout.tsx`. Playwright E2E suite under `tests/e2e/` (BYOK gating, lookup/history/compare shells, command palette interaction). 2 new unit suites; coverage held at 100/100/100/100. Shareable dashboards intentionally skipped — no server-side persistence. |
| 2026-04-21 | Onboarding    | Added a beginner-friendly walkthrough page at `/getting-started` (`app/getting-started/page.tsx`) covering BYOK, YouTube + Gemini key procurement, channel lookup, dashboard anatomy, Creator Studio tools, a metric glossary, troubleshooting, privacy, and keyboard shortcuts. The hero copy of `/` and the intro paragraph of `/keys` now link to it; the command palette exposes it under "Getting started guide" with help/guide/how/tutorial/onboarding keywords. New test case in `tests/unit/commands.test.ts` pins the palette entry's href + discoverability. Coverage held at 100/100/100/100. |
| 2026-04-21 | Prod hardening | Added global "Support" donate link (`lib/donate.ts` + `components/DonateLink.tsx` + `app/layout.tsx`) defaulting to `https://paypal.me/sanojtechnologies` with env override via `NEXT_PUBLIC_DONATE_URL` (https-only, falls back on malformed values). Command palette gains `settings.donate` (`actionId=open-donate`) that opens the link with `noopener,noreferrer`. **Security hardening** for public deployment: strict `Content-Security-Policy` shipped from `next.config.mjs` (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, `connect-src 'self'` + optional telemetry origin, `img-src` locked to YouTube image CDNs + `data:`/`blob:`, `upgrade-insecure-requests` in prod, dev-only `'unsafe-eval'` + `ws:`/`wss:` for HMR). Added `Cross-Origin-Opener-Policy: same-origin-allow-popups` and expanded `Permissions-Policy` to also deny usb/magnetometer/accelerometer/gyroscope. **Prod build optimisation**: `productionBrowserSourceMaps: false`, `compiler.removeConsole` strips log/debug/info in prod (keeps warn/error), `images.formats` prefers avif/webp, `compress: true`. New unit suite `donate.test.ts` + extended `commands.test.ts`. Full gate: `npm run build` succeeds (36 pages, First Load JS shared 87.1 kB), 482/482 tests pass, coverage held at 100/100/100/100. |
| 2026-04-21 | Phase 4       | "Time & depth" — Bucket A (longitudinal analytics) + Bucket B (Creator Studio II). **A0**: `DashboardSnapshot` schema bumped to v2 (`DashboardHistory` with capped `entries[]`, dedupe window, `migrateSnapshot` for v1 data); `lib/idb.ts` gains history-aware helpers. **A1**: `lib/timeSeries.ts` + `components/GrowthChart.tsx` + `GrowthDeltaCard.tsx` + dashboard `GrowthSection`. **A2**: `lib/breakout.ts` + `components/BreakoutList.tsx` (dashboard + `/history`). **A3**: `lib/duration.ts` + Shorts/Long-form toggle in `components/VideoGrid.tsx` (filtered stats + heatmap). **A4**: `lib/ngrams.ts` + `components/TitleTrends.tsx`. **B1**: Script Doctor (`/studio/script` + NDJSON route + `lib/scriptPrompt.ts`). **B2**: A/B Title Scorer (`/studio/ab-title` + route + `lib/abTitlePrompt.ts`). **B3**: A/B Thumbnail Comparator (`/studio/ab-thumbnail` + route that accepts multipart files OR JSON URL pairs + `lib/abThumbnailPrompt.ts`). **B4**: Competitor Gap Analysis (`/compare/gap` + route + `lib/compareGapPrompt.ts`, Run-gap-analysis button on `/compare`). **B5**: Cluster-aware Content Ideas (`/api/studio/clusters/ideas` + inline "Ideate" button on `/studio/clusters` + `lib/clusterIdeasPrompt.ts`). **Cross-cutting**: 4 new command-palette entries (`studio.script`, `studio.ab-title`, `studio.ab-thumbnail`, `compare.gap`), 4 new studio tool cards, Getting-started step 6 growth-tracking paragraph + step 7 cards. 9 new unit suites + 5 new integration suites + E2E palette extension. `tsconfig` target bumped to `es2020` (required by `lib/ngrams.ts`). Coverage held at 100/100/100/100 across `lib/**` + `app/api/**`. No server-side store added — history and A/B uploads stay client-only. |
| 2026-04-21 | Localisation  | Heatmap + `StatsCards` "Best Day" now bucket in the viewer's browser timezone instead of UTC. New `lib/timezone.ts` centralises `localDayHour` (Intl-based, DST + half-hour-offset safe), `getBrowserTimeZone`, and `formatTimeZoneLabel`. `buildPublishHeatmap` and `calculateStats` accept an optional `timeZone` arg (defaults to `"UTC"` so server renders and existing tests stay deterministic). `PublishHeatmap` / `StatsCards` are now client components that render the UTC baseline on first paint and swap to the local-zone result after hydration, so no text labelled "UTC" is shown to users. New `tests/unit/timezone.test.ts` + timezone override cases added to stats/heatmap suites. Coverage held at 100/100/100/100. |
| 2026-04-21 | UX + Cost     | Thumbnail analyzer no longer fires Gemini on modal open — a click on a video card just opens the modal. Users must click the new primary "Analyze thumbnail" button to spend a Gemini call, avoiding accidental billing when browsing the grid. Added a 24 h per-video cache (`lib/thumbnailCache.ts`) keyed on `ytstudio:thumb:<videoId>` in `localStorage`. Cache module is pure — takes an injected `KeyValueStorage` (`null`-safe for SSR / Safari private mode) and an explicit `now` — validates every field defensively, auto-removes malformed / expired / shape-wrong rows, and swallows `setItem` quota errors. Modal re-opens hydrate from cache instantly and display a "Cached <relative time> ago" hint; the button label switches to "Re-analyze thumbnail" so a manual refresh is always one click away. `components/ThumbnailAnalyzer.tsx` rewritten around a `status: "idle" | "loading" | "ready" | "error"` state machine and a `useCallback` trigger. New suite `tests/unit/thumbnailCache.test.ts` (22 cases: round-trip, TTL expiry + inclusive boundary, malformed JSON, 5 field-validation paths, non-object roots, mixed-type arrays, unparseable `savedAt`, `null`/`undefined`/empty-id storage no-ops, `setItem`/`getItem`/`removeItem` throw paths, explicit clear). § 4.5 + directory map + localStorage table updated. Coverage held at 100/100/100/100. |
| 2026-04-21 | Feature       | Video metadata analyzer added alongside the thumbnail analyzer. The modal opened from a `VideoGrid` card is now a tabbed "Video Analyzer" with two tabs — **Thumbnail** (existing behaviour, preserved) and **Metadata** (title + description + tags). Each tab has its own explicit "Analyze …" / "Re-analyze …" button and its own 24 h `localStorage` cache (`ytstudio:thumb:<videoId>` and `ytstudio:meta:<videoId>`), so Gemini calls stay intentional and cheap. **Schema (`MetadataAnalysis`)** — composite 1–10 packaging score, paragraph feedback for title / description / tags, exactly 3 alternative titles, 3 concrete description edits, 5 suggested additional tags, and 3 prioritised top recommendations. **API (`POST /api/video-metadata`)** — defensive input caps (`METADATA_LIMITS`: title ≤ 500 chars → 400, description trimmed + clamped to 10 000 chars, tags normalised to ≤ 100 entries × ≤ 100 chars), Gemini `gemini-2.5-flash` with structured `responseSchema` and `thinkingConfig.thinkingBudget = 0`, 502 on empty / malformed responses with debug info. **Shared cache factory** — both caches now come from a generic `createAnalysisCache<T>({ prefix, ttlMs, isValidShape })` in `lib/analysisCache.ts`; `lib/thumbnailCache.ts` refactored to use it, preserving its public API so existing callers are unchanged. **Types** — `YouTubeVideo` gains optional `tags?: string[]`; `lib/youtube.ts` `toVideo` maps `snippet.tags` with a defensive string-only filter. **UI** — `ThumbnailAnalyzer` decomposed into a tabbed modal + two independent panels (`ThumbnailAnalysisPanel`, `MetadataAnalysisPanel`) sharing `components/analysisPanelShared.ts`; metadata panel shows current title / description / tag list (with character counts) so creators see exactly what Gemini will review, plus colour-coded score badge, tag chips, and highlighted Top Recommendations block. New suites: `tests/unit/metadataPrompt.test.ts` (17 cases — `normaliseTags` trim/drop/clamp/cap, prompt placeholders + rule embedding, schema required fields, `isMetadataAnalysis` scalar + string-array guards, non-object roots), `tests/unit/metadataCache.test.ts` (5 cases — round-trip, expiry, shape rejection, clear, null-storage), `tests/integration/api-video-metadata.test.ts` (9 cases — 401 missing key, 400 malformed body / missing fields / oversize title, 200 with empty description, truncation of oversize description, optional tags default, 502 empty + malformed). `tests/utils/schemas.ts` gains `assertMetadataAnalysis`. PRD § 4.5, directory map, localStorage table, and `YouTubeVideo` type updated. Coverage held at 100/100/100/100 across `lib/**` + `app/api/**` (596 tests total). |
| 2026-04-21 | Fix           | Engagement classification rebuilt from fixed thresholds ("High ≥ 6%, Medium ≥ 3%, Low") into a **channel-relative, format-aware** robust z-score approach. Root cause: hard-coded cut-offs were too aggressive for long-form (2% is healthy), too lenient for Shorts (10% is baseline), ignored channel size, moralised low engagement with red, and couldn't distinguish "no signal yet" from "genuinely low". New `lib/engagement.ts` (`computeEngagementReport`) computes each video's rate, splits the sample by Shorts / long-form via `classifyVideoFormat`, and classifies each video by its robust z-score within its own format bucket (`high` / `normal` / `below`; `na` when views = 0 or likes & comments both = 0). Shared median + MAD machinery extracted into new `lib/robustStats.ts` (`median`, `computeRobustStats`, `robustZScore`, `MAD_SCALE`) and `lib/outliers.ts` now delegates to it (DRY). Default threshold `1.0` (tighter than outliers' `1.5` because engagement distributions are tighter). `VideoGrid` renders the new buckets with amber/neutral/emerald palette (no red), a tooltip showing the raw rate + channel format median, and computes the report over the full 50-video sample (not the filtered subset) so badges stay stable across filter toggles. § 4.10 rewritten with new "Engagement classification" + "Robust statistics primitives" subsections; directory map updated. New suites `tests/unit/engagement.test.ts` (14 cases: empty, single-video, format-split independence, N/A guards for 0 views and 0 likes-AND-comments, constant-bucket → all-normal, threshold tightening, `medianForFormat` exposure) and `tests/unit/robustStats.test.ts` (11 cases including the `mad = 0` short-circuit and non-mutation). Coverage held at 100/100/100/100 across `lib/**` + `app/api/**`. |

---

_Remember the triangle: PRD ↔ Tests ↔ Code. Change one, change all three._
