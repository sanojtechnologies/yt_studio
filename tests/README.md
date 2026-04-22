# Test Suite

> **Source of truth**: [`../PRD.md`](../PRD.md). Every requirement in the PRD maps to at least one test here. When you add/change a feature, update the PRD section first, then add/modify the matching test, then the code.

Three-layer test strategy with [Vitest](https://vitest.dev/) and v8 coverage.

```
tests/
  unit/          Pure-logic tests (no network, no timers) — fast feedback
  integration/   Next.js route handlers with googleapis / @google/genai / fetch mocked
  live/          Real-network smoke tests against @LearnwithManoj (opt-in)
  utils/         Shared helpers (cookie stubs, schema validators)
  vitest.setup.ts  Global setup (mocks next/headers, clears cookie store)
```

## Running

| Command              | What it runs                                      |
| -------------------- | ------------------------------------------------- |
| `npm test`           | Every suite (live blocks self-skip without keys). |
| `npm run test:watch` | Watch mode for local development.                 |
| `npm run test:unit`  | Unit + integration only (never hits the network). |
| `npm run test:live`  | Only the live `@LearnwithManoj` smoke suite.      |
| `npm run coverage`   | Full run with a text + HTML coverage report.      |
| `npm run typecheck`  | `tsc --noEmit` over the whole project.            |

Coverage output lands in `./coverage/` (HTML at `coverage/index.html`). Thresholds are enforced by `vitest.config.ts` — failing coverage fails the run.

## Live tests

The live suite targets `https://www.youtube.com/@LearnwithManoj` via `lib/youtube.ts` and `lib/gemini.ts`, validating that the real providers still return the shapes the app expects. Blocks are wrapped in `describe.runIf(...)` so they auto-skip if keys aren't set.

Keys are loaded from `.env.test.local` at the project root (git-ignored via the `.env*.local` rule in `.gitignore`). Create the file once:

```bash
# .env.test.local
YOUTUBE_API_KEY_TEST=AIza...your_youtube_key...
GEMINI_API_KEY_TEST=AIza...your_gemini_key...
```

Then run:

```bash
npm run test:live
```

Values already present in the real `process.env` (e.g. injected by CI) take precedence over the file, so the same suite works locally and in CI without code changes. `tests/vitest.setup.ts` is responsible for loading the file; it is never referenced by application code.

What's exercised:

1. `getChannelByHandle` → returns a channel whose id matches `^UC[\w-]{20,}$`.
2. `getChannelById` → same id, consistent payload.
3. `getChannelVideos` → at least 1 video, each with valid shape.
4. Gemini `generateContentStream` with the analyze prompt → output parses as JSON matching `AnalyzeResponseShape`.
5. Gemini `generateContent` with a real thumbnail → output parses as JSON matching `ThumbnailAnalysisShape`.

The schema asserters (`tests/utils/schemas.ts`) throw a detailed, enumerated error message when a payload drifts, so failures pinpoint exactly what changed.

## Adding tests

1. **Update `PRD.md` first.** Describe the new/changed behavior (and update § 8 Error Catalogue if any user-facing string changes). Add a Change Log row.
2. **Then add the test** at the right layer:
   - **New pure helper** → `tests/unit/<name>.test.ts`.
   - **New route** → `tests/integration/api-<name>.test.ts`, mocking `@/lib/*` (not `googleapis` directly) for focus. Use `setTestCookie` to seed API keys.
   - **New external contract** (shape from YouTube/Gemini) → add or extend a validator in `tests/utils/schemas.ts` and assert against it in both the integration and live suites, so drift is caught even if mocks drift.
3. **Then implement.** `npm run test` + `npm run coverage` must stay green; do not weaken coverage thresholds.

## Why v8 coverage?

v8 coverage is faster than Istanbul and doesn't require Babel instrumentation. It's limited to `lib/**` and `app/api/**` because those are the surfaces the test suite can deterministically exercise; React UI components would need jsdom + Testing Library which isn't configured here.
