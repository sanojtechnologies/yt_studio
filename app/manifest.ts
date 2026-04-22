import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "YT Studio Analyzer",
    short_name: "YT Studio",
    description:
      "YouTube channel analytics with AI-powered thumbnail and metadata recommendations.",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      { src: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { src: "/og", sizes: "1200x630", type: "image/png", purpose: "any" },
    ],
  };
}
