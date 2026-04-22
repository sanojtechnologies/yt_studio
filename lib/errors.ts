export const YOUTUBE_QUOTA_EXCEEDED_MESSAGE = "YouTube quota exceeded, try again tomorrow.";
export const YOUTUBE_INVALID_API_KEY_MESSAGE =
  "Your YouTube API key was rejected. Update it in the API Keys panel and try again.";

export class YouTubeQuotaExceededError extends Error {
  constructor() {
    super(YOUTUBE_QUOTA_EXCEEDED_MESSAGE);
    this.name = "YouTubeQuotaExceededError";
  }
}

export class YouTubeInvalidApiKeyError extends Error {
  constructor() {
    super(YOUTUBE_INVALID_API_KEY_MESSAGE);
    this.name = "YouTubeInvalidApiKeyError";
  }
}

export function isYouTubeQuotaExceededError(error: unknown): boolean {
  if (error instanceof YouTubeQuotaExceededError) return true;

  if (typeof error !== "object" || error === null) return false;
  const maybeError = error as {
    code?: number;
    response?: { status?: number; data?: { error?: { errors?: Array<{ reason?: string }> } } };
    errors?: Array<{ reason?: string }>;
  };

  const status = maybeError.code ?? maybeError.response?.status;
  const reasons = [
    ...(maybeError.errors ?? []),
    ...(maybeError.response?.data?.error?.errors ?? []),
  ]
    .map((entry) => entry.reason ?? "")
    .filter(Boolean);

  if (status !== 403) return false;

  return reasons.some((reason) => {
    const value = reason.toLowerCase();
    return (
      value.includes("quota") ||
      value.includes("ratelimit") ||
      value.includes("dailylimit") ||
      value.includes("userratelimit")
    );
  });
}

export function isYouTubeInvalidApiKeyError(error: unknown): boolean {
  if (error instanceof YouTubeInvalidApiKeyError) return true;

  if (typeof error !== "object" || error === null) return false;
  const maybeError = error as {
    message?: string;
    response?: { status?: number; data?: { error?: { message?: string; errors?: Array<{ reason?: string }> } } };
    errors?: Array<{ reason?: string }>;
  };

  const status = maybeError.response?.status;
  const message = (maybeError.message ?? maybeError.response?.data?.error?.message ?? "").toLowerCase();
  const reasons = [
    ...(maybeError.errors ?? []),
    ...(maybeError.response?.data?.error?.errors ?? []),
  ]
    .map((entry) => (entry.reason ?? "").toLowerCase())
    .filter(Boolean);

  return (
    (status === 400 || status === 403 || status === undefined) &&
    (message.includes("api key not valid") ||
      message.includes("apikey") ||
      reasons.includes("keyinvalid"))
  );
}
