import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recent Channels",
  robots: { index: false, follow: false },
};

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
