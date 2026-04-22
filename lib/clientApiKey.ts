"use client";

export type ApiKeyId = "youtube" | "gemini";

export interface ApiKeySpec {
  id: ApiKeyId;
  label: string;
  cookie: string;
  storage: string;
  placeholder: string;
  helpUrl: string;
  validate: (value: string) => string | null;
}

const GOOGLE_API_KEY_PATTERN = /^AIza[0-9A-Za-z_-]{20,}$/;

function validateGoogleKey(value: string): string | null {
  return GOOGLE_API_KEY_PATTERN.test(value.trim())
    ? null
    : "Expected a Google API key starting with AIza.";
}

export const API_KEYS: Record<ApiKeyId, ApiKeySpec> = {
  youtube: {
    id: "youtube",
    label: "YouTube Data API v3 Key",
    cookie: "yt_api_key",
    storage: "ytstudio:ytKey",
    placeholder: "AIzaSy...",
    helpUrl: "https://console.cloud.google.com/apis/credentials",
    validate: validateGoogleKey,
  },
  gemini: {
    id: "gemini",
    label: "Gemini API Key",
    cookie: "gemini_api_key",
    storage: "ytstudio:geminiKey",
    placeholder: "AIzaSy...",
    helpUrl: "https://aistudio.google.com/apikey",
    validate: validateGoogleKey,
  },
};

export const API_KEY_CHANGE_EVENT = "ytstudio:apikey-change";

function setCookie(name: string, value: string): void {
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

function clearCookie(name: string): void {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function emitChange(id: ApiKeyId, present: boolean): void {
  window.dispatchEvent(
    new CustomEvent(API_KEY_CHANGE_EVENT, { detail: { id, present } })
  );
}

export function saveApiKey(spec: ApiKeySpec, rawValue: string): void {
  const value = rawValue.trim();
  if (!value) return;
  try {
    localStorage.setItem(spec.storage, value);
  } catch {
    // localStorage may be unavailable (private mode); cookie still works.
  }
  setCookie(spec.cookie, value);
  emitChange(spec.id, true);
}

export function deleteApiKey(spec: ApiKeySpec): void {
  try {
    localStorage.removeItem(spec.storage);
  } catch {
    // Ignore storage failures.
  }
  clearCookie(spec.cookie);
  emitChange(spec.id, false);
}

export function readApiKey(spec: ApiKeySpec): string | null {
  try {
    return localStorage.getItem(spec.storage);
  } catch {
    return null;
  }
}

export function maskKey(value: string): string {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export interface ValidationResult {
  ok: boolean;
  warning?: string;
  error?: string;
}

export async function validateApiKey(
  spec: ApiKeySpec,
  rawValue: string
): Promise<ValidationResult> {
  const value = rawValue.trim();
  if (!value) return { ok: false, error: "Key is required." };

  try {
    const response = await fetch("/api/validate-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: spec.id, key: value }),
    });
    const payload = (await response.json()) as ValidationResult;
    if (typeof payload?.ok !== "boolean") {
      return { ok: false, error: "Unexpected validation response." };
    }
    return payload;
  } catch {
    return { ok: false, error: "Could not reach validation service." };
  }
}
