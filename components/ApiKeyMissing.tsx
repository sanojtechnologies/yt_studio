import Link from "next/link";

interface ApiKeyMissingProps {
  title?: string;
  description?: string;
}

export default function ApiKeyMissing({
  title = "API key required",
  description = "Add your YouTube Data API v3 key in the API Keys page to load this dashboard.",
}: ApiKeyMissingProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 text-center">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-zinc-300">{description}</p>
        <Link
          href="/keys"
          className="mt-4 inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          Manage API Keys
        </Link>
      </div>
    </main>
  );
}
