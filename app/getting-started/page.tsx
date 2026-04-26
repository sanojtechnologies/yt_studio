import type { Metadata } from "next";
import Link from "next/link";
import { getGeminiApiKey, getYouTubeApiKey } from "@/lib/apiKey";

export const metadata: Metadata = {
  title: "Getting started",
  description:
    "The complete beginner guide for YT Analyzer: setup keys, understand dashboard insights, use Creator Studio tools, and run pre-publish checks before going live.",
};

interface StepProps {
  number: number;
  title: string;
  children: React.ReactNode;
}

function Step({ number, title, children }: StepProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 md:p-6">
      <header className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 text-sm font-semibold text-white"
        >
          {number}
        </span>
        <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
      </header>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-300">{children}</div>
    </section>
  );
}

interface InfoCardProps {
  title: string;
  children: React.ReactNode;
}

function InfoCard({ title, children }: InfoCardProps) {
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{children}</p>
    </article>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 font-mono text-[0.8em] text-zinc-200">
      {children}
    </code>
  );
}

export default function GettingStartedPage() {
  const youtube = Boolean(getYouTubeApiKey());
  const gemini = Boolean(getGeminiApiKey());
  const ready = youtube && gemini;

  return (
    <main
      id="main"
      className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100 md:px-8"
    >
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="space-y-3">
          <nav className="flex items-center gap-3 text-sm text-zinc-400">
            <Link href="/" className="text-violet-300 hover:text-violet-200">
              ← Home
            </Link>
            <span aria-hidden className="text-zinc-700">•</span>
            <Link href="/keys" className="hover:text-violet-300">
              Manage API Keys
            </Link>
          </nav>
          <h1 className="bg-gradient-to-r from-blue-400 via-violet-400 to-fuchsia-400 bg-clip-text text-3xl font-semibold text-transparent md:text-4xl">
            Getting started
          </h1>
          <p className="text-base text-zinc-300">
            Start here if you are new to YT Analyzer. This guide covers setup, how to read
            dashboard significance (not just raw numbers), and how to use Studio + pre-publish
            workflows to improve a video before it goes live.
          </p>
          <div
            className={`rounded-xl border p-4 text-sm ${
              ready
                ? "border-emerald-700/50 bg-emerald-500/10 text-emerald-200"
                : "border-zinc-800 bg-zinc-900/80 text-zinc-300"
            }`}
          >
            {ready ? (
              <>
                Your keys are configured — jump straight to{" "}
                <Link href="/lookup" className="underline hover:text-emerald-100">
                  channel lookup
                </Link>
                .
              </>
            ) : (
              <>
                You still need{" "}
                {!youtube && !gemini
                  ? "both a YouTube and a Gemini API key"
                  : !youtube
                  ? "a YouTube API key"
                  : "a Gemini API key"}
                . The steps below walk you through it.
              </>
            )}
          </div>
        </header>

        <Step number={1} title="Understand what you need">
          <p>
            YT Studio Analyzer is <strong>bring-your-own-key</strong>. You plug in two free
            API keys; the app stores them only in this browser and uses them to talk to Google
            on your behalf. Nothing is sent to a server we control.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>YouTube Data API v3 key</strong> — reads channel and video data. Free for
              up to <Pill>10,000 units / day</Pill>.
            </li>
            <li>
              <strong>Gemini API key</strong> — powers the AI analysis, thumbnail review, and
              Creator Studio. Free tier is plenty for casual use.
            </li>
          </ul>
        </Step>

        <Step number={2} title="Get your YouTube Data API v3 key">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Open the{" "}
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noreferrer"
                className="text-violet-300 underline hover:text-violet-200"
              >
                Google Cloud Console
              </a>{" "}
              and sign in with any Google account.
            </li>
            <li>
              Create a new project (top-left project dropdown → <Pill>New Project</Pill>). Any
              name is fine.
            </li>
            <li>
              In the search bar type <Pill>YouTube Data API v3</Pill>, open it, and click{" "}
              <Pill>Enable</Pill>.
            </li>
            <li>
              Navigate to <Pill>APIs &amp; Services → Credentials</Pill>, click{" "}
              <Pill>Create credentials → API key</Pill>, and copy the generated key.
            </li>
            <li>
              (Optional but recommended) click <Pill>Edit API key</Pill> and restrict it to{" "}
              <Pill>YouTube Data API v3</Pill> so it can&apos;t be reused elsewhere.
            </li>
          </ol>
          <p className="text-xs text-zinc-500">
            Tip: the quota dashboard lives under <em>APIs &amp; Services → Quotas</em> if you
            ever want to see how much you&apos;ve spent.
          </p>
        </Step>

        <Step number={3} title="Get your Gemini API key">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Open{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-violet-300 underline hover:text-violet-200"
              >
                Google AI Studio → API keys
              </a>{" "}
              and sign in.
            </li>
            <li>
              Click <Pill>Create API key</Pill>. If prompted, pick the same Google Cloud project
              from step 2 (or a brand-new one).
            </li>
            <li>Copy the key. Keep the tab open — you&apos;ll paste it in a moment.</li>
          </ol>
          <p className="text-xs text-zinc-500">
            The Gemini free tier covers content analysis, thumbnail review, title / hook
            generation, and topic clustering for most creators without a paid plan.
          </p>
        </Step>

        <Step number={4} title="Save both keys in YT Studio">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Open{" "}
              <Link href="/keys" className="text-violet-300 underline hover:text-violet-200">
                Your API Keys
              </Link>
              .
            </li>
            <li>
              Click the row for each provider, paste your key, and press <Pill>Save</Pill>. The
              app makes a lightweight live call to validate the key before storing it — an
              invalid key is rejected with a clear message.
            </li>
            <li>
              Once both rows show <Pill>Configured</Pill>, the channel-lookup page unlocks on
              the home screen.
            </li>
          </ol>
          <p>
            Keys are saved in <Pill>localStorage</Pill> plus a cookie scoped to this site so
            the server can read them for YouTube and Gemini requests. You can edit or delete a
            key any time from the same page.
          </p>
        </Step>

        <Step number={5} title="Look up a channel">
          <p>
            Head to{" "}
            <Link
              href={ready ? "/lookup" : "/keys"}
              className="text-violet-300 underline hover:text-violet-200"
            >
              Channel lookup
            </Link>{" "}
            and paste any of the following:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>A full channel URL, e.g. <Pill>https://www.youtube.com/@LearnwithManoj</Pill></li>
            <li>A handle, e.g. <Pill>@LearnwithManoj</Pill></li>
            <li>A raw channel id, e.g. <Pill>UCxxxxxxxx</Pill></li>
          </ul>
          <p>
            The app resolves the input to a canonical channel id, caches the result for an
            hour (per-key, in-memory only), and redirects you to the dashboard at{" "}
            <Pill>/dashboard/&lt;channelId&gt;</Pill>.
          </p>
        </Step>

        <Step number={6} title="Read the dashboard with context">
          <p>
            The dashboard now includes an interpretation layer so you get clear actions, not just
            charts. You&apos;ll see these core blocks:
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <InfoCard title="Channel header">
              Avatar, name, compact subscriber count, total views.
            </InfoCard>
            <InfoCard title="Key Insights + Channel Health">
              Top narrative insights with confidence labels, a composite channel-health score, and
              recommended next actions.
            </InfoCard>
            <InfoCard title="Idea Opportunity Engine">
              A focused “what to make next” widget that synthesizes current channel signals into a
              top opportunity angle, why-now evidence, best format, and best publish window (in
              your browser-local timezone), with one-click generation of 3 data-grounded ideas.
            </InfoCard>
            <InfoCard title="Stats Cards (With Interpretation)">
              Avg views · engagement rate · uploads/week · best day, each with a one-line
              interpretation and a <Pill>?</Pill> help hint.
            </InfoCard>
            <InfoCard title="Performance chart">
              View counts across the latest 50 videos, oldest → newest.
            </InfoCard>
            <InfoCard title="Video grid + heatmap">
              Click any thumbnail to open the Video Analyzer modal. Heatmap now explains
              <em> why</em> a slot is recommended and can create calendar drafts for your next two
              uploads.
            </InfoCard>
          </div>
          <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <h3 className="text-sm font-semibold text-zinc-100">Also New On The Dashboard</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-400">
              <li>
                <strong className="text-zinc-200">Title trends</strong> now includes decision-grade
                signals: lift vs median, novelty guard (reuse risk), and separate phrase winners
                for Shorts vs Long-form.
              </li>
              <li>
                <strong className="text-zinc-200">Performance chart</strong> tooltips now show both
                video index and exact video title.
              </li>
              <li>
                Dashboard snapshots are cached locally (IndexedDB), so{" "}
                <Link href="/history" className="underline hover:text-violet-200">
                  Recent channels
                </Link>{" "}
                can show summary stats for channels you&apos;ve already viewed.
              </li>
              <li>
                Growth tracking appends local snapshots over time (deduped and consolidated), then
                unlocks the growth chart + delta card once enough history exists.
              </li>
            </ul>
          </section>
        </Step>

        <Step number={7} title="Explore Creator Studio (optional)">
          <p>
            When you want more than analytics, open the{" "}
            <Link
              href={ready ? "/studio" : "/keys"}
              className="text-violet-300 underline hover:text-violet-200"
            >
              Creator Studio
            </Link>{" "}
            for AI tools:
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <InfoCard title="Video Ideate">
              Enter niche keywords and generate last-30-days, data-grounded idea cards with
              evidence-backed “why now” reasoning and confidence. Export the generated bundle with{" "}
              <Pill>Download As PDF</Pill> for future reference.
            </InfoCard>
            <InfoCard title="Pre-Publish Analyzer">
              Add unpublished draft metadata, upload a thumbnail file, then run one-click{" "}
              <Pill>Analyze + Generate Recommendations</Pill> to analyze metadata + thumbnail,
              generate a new metadata pack, generate 3 thumbnails, and score each generated
              variant before publish.
            </InfoCard>
            <InfoCard title="Title Lab">
              Generate and score alternative titles against your existing catalogue.
            </InfoCard>
            <InfoCard title="Hook, description, chapters">
              Draft the first 15 seconds, SEO description, and chapter markers for a video you
              pick from the channel.
            </InfoCard>
            <InfoCard title="Topic clusters">
              Embed every video in the channel with <em>text-embedding-004</em> and group them
              into topical clusters.
            </InfoCard>
            <InfoCard title="Thumbnail generator">
              Create thumbnail variations from prompts with your configured image model.
            </InfoCard>
            <InfoCard title="Script Doctor">
              Stream a structured outline — cold open, hook, beats, CTA, outro — tuned to a
              target runtime and optional audience note.
            </InfoCard>
            <InfoCard title="A/B Title Scorer">
              Paste two candidate titles and get axis-by-axis scores (clarity, curiosity, SEO,
              clickability) plus a rationale for the winner.
            </InfoCard>
            <InfoCard title="A/B Thumbnail Comparator">
              Upload two thumbnails (or paste URLs) and compare face impact, readability,
              contrast, and curiosity gap side by side.
            </InfoCard>
            <InfoCard title="Competitor Gap Analysis">
              After running a <Link href="/compare" className="underline hover:text-violet-200">/compare</Link>{" "}
              session, jump to gap analysis to surface shared topics and each channel&apos;s
              missing angles.
            </InfoCard>
          </div>
        </Step>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 md:p-6">
          <h2 className="text-lg font-semibold text-zinc-100">Metric glossary</h2>
          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-zinc-100">Avg views</dt>
              <dd className="text-zinc-400">
                Mean view count across the fetched videos (up to 50).
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-100">Engagement rate</dt>
              <dd className="text-zinc-400">
                <Pill>(likes + comments) / views × 100</Pill>, summed across all fetched videos.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-100">Uploads / week</dt>
              <dd className="text-zinc-400">
                <Pill>(valid publish dates − 1) / span in days × 7</Pill>. Counts intervals, not
                videos, so 2 videos a week apart reads as 1.0 / week.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-100">Best day</dt>
              <dd className="text-zinc-400">
                Weekday (in your browser&apos;s timezone) with the highest total views across the
                fetched videos.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-100">Outperformer / Underperformer</dt>
              <dd className="text-zinc-400">
                Median + MAD based outlier: videos &gt; 1.5× MAD above/below the median viewing
                count for the channel.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-100">Heatmap strongest slot</dt>
              <dd className="text-zinc-400">
                Ranked by reliability score: <Pill>medianViews × ln(1 + count)</Pill> with a
                preference for slots that have at least 2 uploads. Peak views are still shown as
                context.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-100">Confidence label</dt>
              <dd className="text-zinc-400">
                Indicates data reliability based on sample depth and recency context. Use it to
                decide whether to act immediately or validate first.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-100">Title trend lift vs median</dt>
              <dd className="text-zinc-400">
                How much the winning repeated title pattern outperforms (or underperforms) the
                channel&apos;s median view level. Positive lift means the pattern is directionally
                stronger than baseline.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-100">Novelty guard (reuse risk)</dt>
              <dd className="text-zinc-400">
                Saturation signal for overusing the same title phrase. <Pill>Low / Medium / High</Pill>{" "}
                helps you decide when to keep the winner vs rotate qualifiers to avoid fatigue.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-100">Format split winners</dt>
              <dd className="text-zinc-400">
                Separate strongest repeated phrase for Shorts and Long-form so title strategy can
                match format intent instead of using one blended pattern.
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 md:p-6">
          <h2 className="text-lg font-semibold text-zinc-100">Troubleshooting</h2>
          <div className="mt-4 space-y-4 text-sm text-zinc-300">
            <div>
              <p className="font-medium text-zinc-100">&quot;YouTube API key is invalid&quot;</p>
              <p className="text-zinc-400">
                Double-check the key on{" "}
                <Link href="/keys" className="underline hover:text-violet-200">
                  the API Keys page
                </Link>
                . If you restricted the key, confirm it allows <em>YouTube Data API v3</em>.
              </p>
            </div>
            <div>
              <p className="font-medium text-zinc-100">&quot;Quota exceeded — try again tomorrow&quot;</p>
              <p className="text-zinc-400">
                You&apos;ve used the 10,000-unit daily YouTube quota. Quotas reset at midnight Pacific
                time. You can raise the quota in Google Cloud if needed.
              </p>
            </div>
            <div>
              <p className="font-medium text-zinc-100">Channel not found</p>
              <p className="text-zinc-400">
                The handle / URL couldn&apos;t be resolved. Verify it opens on YouTube, and try the
                raw <Pill>UC…</Pill> channel id if the handle is very new.
              </p>
            </div>
            <div>
              <p className="font-medium text-zinc-100">Gemini returns an error</p>
              <p className="text-zinc-400">
                Re-validate the Gemini key on the API Keys page. Free tier has per-minute
                limits; wait a minute and retry if you&apos;ve been hammering Studio tools.
              </p>
            </div>
            <div>
              <p className="font-medium text-zinc-100">Scheduled / private videos are missing</p>
              <p className="text-zinc-400">
                API-key mode can only access public YouTube data. Scheduled/private videos require
                OAuth owner authorization. Use Pre-Publish Analyzer for draft checks in the
                current BYOK mode.
              </p>
            </div>
            <div>
              <p className="font-medium text-zinc-100">Pre-Publish thumbnail upload fails</p>
              <p className="text-zinc-400">
                Upload an image under <Pill>2MB</Pill> in jpeg/png/webp/heic/heif format. If the
                file is replaced, click <Pill>Save Draft</Pill> again so the latest thumbnail bytes
                are stored.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 md:p-6">
          <h2 className="text-lg font-semibold text-zinc-100">Privacy &amp; data handling</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-zinc-300">
            <li>API keys live in <Pill>localStorage</Pill> and a same-site cookie; never on a shared server.</li>
            <li>YouTube + Gemini requests are proxied through Next.js route handlers running in your session.</li>
            <li>
              Dashboard snapshots are cached in <Pill>IndexedDB</Pill> on your device. Clearing
              the <em>Recent channels</em> page wipes them.
            </li>
            <li>
              No analytics or tracking beacons are sent unless you set{" "}
              <Pill>NEXT_PUBLIC_TELEMETRY_ENDPOINT</Pill> in your own deployment.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 md:p-6">
          <h2 className="text-lg font-semibold text-zinc-100">Handy shortcuts</h2>
          <ul className="mt-4 space-y-2 text-sm text-zinc-300">
            <li>
              <Pill>⌘ K</Pill> / <Pill>Ctrl K</Pill> — open the command palette; search any page
              (including this one), any recently viewed channel, or tools like{" "}
              <Pill>Pre-Publish Analyzer</Pill>.
            </li>
            <li>
              <Pill>Esc</Pill> — close the palette or any open modal.
            </li>
            <li>
              The <em>Toggle theme</em> button floats in the top-right corner on every page.
            </li>
          </ul>
        </section>

        <footer className="flex flex-wrap items-center gap-3 pt-2 text-sm">
          <Link
            href="/keys"
            className="rounded-xl border border-zinc-700 bg-zinc-800/70 px-4 py-2.5 text-zinc-100 hover:border-violet-400"
          >
            Manage API Keys
          </Link>
          <Link
            href={ready ? "/lookup" : "/keys"}
            className="rounded-xl bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 px-4 py-2.5 font-medium text-white hover:opacity-90"
          >
            {ready ? "Analyze A Channel →" : "Add Your Keys →"}
          </Link>
        </footer>
      </div>
    </main>
  );
}
