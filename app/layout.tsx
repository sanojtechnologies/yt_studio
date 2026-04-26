import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import CommandPalette from "@/components/CommandPalette";
import DonateLink from "@/components/DonateLink";
import MobileFooterCta from "@/components/MobileFooterCta";
import PoweredByLink from "@/components/PoweredByLink";
import { getSiteUrlObject } from "@/lib/siteUrl";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: getSiteUrlObject(),
  applicationName: "YT Studio Analyzer",
  title: {
    default: "YT Studio Analyzer",
    template: "%s | YT Studio Analyzer",
  },
  description: "Analyze YouTube channel performance, content patterns, and thumbnail effectiveness.",
  keywords: [
    "youtube analytics",
    "youtube studio",
    "creator tools",
    "thumbnail analyzer",
    "youtube seo",
    "video metadata analysis",
  ],
  alternates: { canonical: "/" },
  formatDetection: { telephone: false },
  category: "technology",
  creator: "YT Studio Analyzer",
  publisher: "YT Studio Analyzer",
  robots: { index: true, follow: true },
  openGraph: {
    title: "YT Studio Analyzer",
    description: "YouTube channel analytics with AI-powered content and thumbnail insights.",
    type: "website",
    url: "/",
    siteName: "YT Studio Analyzer",
    images: [
      {
        url: "/og",
        width: 1200,
        height: 630,
        alt: "YT Studio Analyzer",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "YT Studio Analyzer",
    description: "YouTube channel analytics with AI-powered content and thumbnail insights.",
    images: ["/og"],
  },
};

export const viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

// Inline boot script: read the persisted theme (or fall back to the OS
// preference) BEFORE React hydrates so the page never flashes the wrong palette.
const THEME_BOOTSTRAP = `(()=>{try{var t=localStorage.getItem('ytstudio:theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect to YouTube's image CDN before the dashboard requests
         * thumbnails — saves a roundtrip on first load. */}
        <link rel="preconnect" href="https://i.ytimg.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://i.ytimg.com" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className={`${inter.className} pb-24 sm:pb-0`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-violet-500 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to main content
        </a>
        {children}
        {/* Global theme toggle: floats top-right on every page so light/dark
         * mode is reachable from anywhere, not just the two pages that
         * historically embedded their own toggle. z-40 keeps it under the
         * command palette overlay (z-50). */}
        <div className="fixed right-4 top-4 z-40">
          <ThemeToggle />
        </div>
        <MobileFooterCta />
        <PoweredByLink />
        <DonateLink />
        <CommandPalette />
        <Analytics />
      </body>
    </html>
  );
}
