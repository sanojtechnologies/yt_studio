import { cookies } from "next/headers";

export const YT_KEY_COOKIE = "yt_api_key";
export const GEMINI_KEY_COOKIE = "gemini_api_key";

function readCookie(name: string): string | null {
  const value = cookies().get(name)?.value?.trim();
  return value ? value : null;
}

export function getYouTubeApiKey(): string | null {
  return readCookie(YT_KEY_COOKIE);
}

export function getGeminiApiKey(): string | null {
  return readCookie(GEMINI_KEY_COOKIE);
}
