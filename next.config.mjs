/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === "production";

/**
 * Optional telemetry origin (e.g. https://errors.example.com). When set, it is
 * added to connect-src so app/error.tsx can POST to it. Read at build time so
 * the value is baked into the emitted CSP header.
 */
function telemetryConnectSrc() {
  const raw = process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT?.trim();
  if (!raw) return "";
  try {
    const origin = new URL(raw).origin;
    return origin.startsWith("https://") ? ` ${origin}` : "";
  } catch {
    return "";
  }
}

/**
 * Content-Security-Policy. Key design choices:
 *
 * - `default-src 'self'` — every resource type falls back to same-origin.
 * - `script-src` allows 'unsafe-inline' for the tiny pre-hydration theme
 *   bootstrap in app/layout.tsx and for Next.js's hydration payload. Dev mode
 *   additionally needs 'unsafe-eval' for React Fast Refresh / HMR.
 * - `style-src 'unsafe-inline'` is required by next/font and Tailwind's JIT
 *   runtime style injection.
 * - `img-src` whitelists the three YouTube image CDNs we load thumbnails from.
 *   `data:` + `blob:` are required so client-uploaded A/B thumbnail previews
 *   and the /og image work.
 * - `connect-src` stays 'self' — all Gemini / YouTube calls happen server-side
 *   inside our API routes, so the browser never talks to Google directly.
 * - `frame-ancestors 'none'` doubles X-Frame-Options: DENY against clickjacking.
 * - `form-action 'self'` blocks exfiltration via attacker-controlled forms.
 * - `object-src 'none'` blocks plugin-based XSS (Flash/PDF embeds).
 * - `upgrade-insecure-requests` auto-upgrades any stray http:// sub-resource.
 */
function buildCsp() {
  const scriptSrc = isProd
    ? "'self' 'unsafe-inline'"
    : "'self' 'unsafe-inline' 'unsafe-eval'";
  const connectSrc = isProd
    ? `'self'${telemetryConnectSrc()}`
    : `'self' ws: wss:${telemetryConnectSrc()}`;

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https://i.ytimg.com https://*.ggpht.com https://yt3.googleusercontent.com",
    `connect-src ${connectSrc}`,
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: buildCsp() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // payment=() keeps the Payment Request API disabled — we only link out to
  // PayPal, we never handle money in-app. camera/microphone/geolocation follow
  // the same least-privilege rule.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()" },
  // Isolate our origin from cross-origin windows (popups, opened tabs). The
  // "-allow-popups" variant preserves window.open for the Support button.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  // HSTS is safe on localhost (ignored without https) and critical for prod.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Remove the Next fingerprint and legacy download-filename coercion.
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  compress: true,
  compiler: {
    // Drop console.log/debug/info in production bundles but keep warn/error so
    // genuine failure paths still surface in the browser console.
    removeConsole: isProd ? { exclude: ["warn", "error"] } : false,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "*.ggpht.com" },
      { protocol: "https", hostname: "yt3.googleusercontent.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
