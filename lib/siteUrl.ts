const DEFAULT_SITE_URL = "https://ytstudio.local";

function toPublicBase(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (typeof raw !== "string") return DEFAULT_SITE_URL;
  return toPublicBase(raw) ?? DEFAULT_SITE_URL;
}

export function getSiteUrlObject(): URL {
  return new URL(`${getSiteUrl()}/`);
}
