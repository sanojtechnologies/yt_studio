import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LookupForm from "@/components/LookupForm";
import { getGeminiApiKey, getYouTubeApiKey } from "@/lib/apiKey";

export const metadata: Metadata = {
  title: "Channel Lookup",
  description:
    "Look up any YouTube channel by URL, handle, or channel ID and open a full analytics dashboard.",
  alternates: { canonical: "/lookup" },
};

export default function LookupPage() {
  if (!getYouTubeApiKey() || !getGeminiApiKey()) {
    redirect("/keys");
  }

  return (
    <main id="main" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.25),transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.25),transparent_45%)]" />
      <div className="relative w-full max-w-2xl">
        <LookupForm />
      </div>
    </main>
  );
}
