/**
 * Donate link surfaced in the global layout and the command palette. The
 * default targets the project maintainer's PayPal; forks or self-hosters can
 * override via NEXT_PUBLIC_DONATE_URL (read at build time by Next so the value
 * is inlined into the client bundle — no request-time cost).
 *
 * The override is sanitised: only https:// URLs are accepted. Anything else
 * (http://, javascript:, data:, malformed) silently falls back to the default
 * so a misconfigured env var can never turn the Donate button into an XSS or
 * downgrade vector.
 */

export const DEFAULT_DONATE_URL = "https://paypal.me/sanojtechnologies";

export function resolveDonateUrl(raw: string | undefined): string {
  const candidate = raw?.trim();
  if (!candidate) return DEFAULT_DONATE_URL;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return DEFAULT_DONATE_URL;
    return url.toString();
  } catch {
    return DEFAULT_DONATE_URL;
  }
}

export const DONATE_URL = resolveDonateUrl(process.env.NEXT_PUBLIC_DONATE_URL);
