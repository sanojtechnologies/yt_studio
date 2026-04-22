import type { Metadata } from "next";
import KeyEditor from "@/components/KeyEditor";

export const metadata: Metadata = {
  title: "Edit Gemini API Key",
  robots: { index: false, follow: false },
};

export default function GeminiKeyPage() {
  return (
    <main id="main" className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100 md:px-8">
      <div className="mx-auto w-full max-w-2xl">
        <KeyEditor id="gemini" />
      </div>
    </main>
  );
}
