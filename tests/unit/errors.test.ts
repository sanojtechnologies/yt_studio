import { describe, expect, it } from "vitest";
import {
  isYouTubeInvalidApiKeyError,
  isYouTubeQuotaExceededError,
  YOUTUBE_INVALID_API_KEY_MESSAGE,
  YOUTUBE_QUOTA_EXCEEDED_MESSAGE,
  YouTubeInvalidApiKeyError,
  YouTubeQuotaExceededError,
} from "@/lib/errors";

describe("YouTube error classes", () => {
  it("carry canonical user-facing messages", () => {
    expect(new YouTubeQuotaExceededError().message).toBe(YOUTUBE_QUOTA_EXCEEDED_MESSAGE);
    expect(new YouTubeInvalidApiKeyError().message).toBe(YOUTUBE_INVALID_API_KEY_MESSAGE);
  });

  // Pins the exact copy listed in PRD.md § 8 "Error Catalogue". Changing either
  // string requires updating the PRD row in the same commit.
  it("match the exact strings locked in PRD.md", () => {
    expect(YOUTUBE_QUOTA_EXCEEDED_MESSAGE).toBe(
      "YouTube quota exceeded, try again tomorrow."
    );
    expect(YOUTUBE_INVALID_API_KEY_MESSAGE).toBe(
      "Your YouTube API key was rejected. Update it in the API Keys panel and try again."
    );
  });
});

describe("isYouTubeQuotaExceededError", () => {
  it("detects instance errors", () => {
    expect(isYouTubeQuotaExceededError(new YouTubeQuotaExceededError())).toBe(true);
  });

  it("detects 403 with a quota-flavored reason", () => {
    const err = {
      code: 403,
      errors: [{ reason: "quotaExceeded" }],
    };
    expect(isYouTubeQuotaExceededError(err)).toBe(true);
  });

  it("detects 403 with reason nested under response.data.error.errors", () => {
    const err = {
      response: {
        status: 403,
        data: { error: { errors: [{ reason: "dailyLimitExceeded" }] } },
      },
    };
    expect(isYouTubeQuotaExceededError(err)).toBe(true);
  });

  it("returns false for 403 with an unrelated reason", () => {
    expect(
      isYouTubeQuotaExceededError({ code: 403, errors: [{ reason: "forbidden" }] })
    ).toBe(false);
  });

  it("returns false for non-object values", () => {
    expect(isYouTubeQuotaExceededError(null)).toBe(false);
    expect(isYouTubeQuotaExceededError("err")).toBe(false);
  });

  // Closes the `entry.reason ?? ""` branch inside the reasons mapper.
  it("tolerates entries whose `reason` field is missing", () => {
    const err = {
      code: 403,
      errors: [{ reason: "quotaExceeded" }, {} as { reason?: string }],
    };
    expect(isYouTubeQuotaExceededError(err)).toBe(true);
  });
});

describe("isYouTubeInvalidApiKeyError", () => {
  it("detects instance errors", () => {
    expect(isYouTubeInvalidApiKeyError(new YouTubeInvalidApiKeyError())).toBe(true);
  });

  it("detects 400 with 'API key not valid' message", () => {
    const err = {
      response: { status: 400, data: { error: { message: "API key not valid. Please pass a valid API key." } } },
    };
    expect(isYouTubeInvalidApiKeyError(err)).toBe(true);
  });

  it("detects reason 'keyInvalid'", () => {
    const err = {
      response: {
        status: 400,
        data: { error: { message: "", errors: [{ reason: "keyInvalid" }] } },
      },
    };
    expect(isYouTubeInvalidApiKeyError(err)).toBe(true);
  });

  it("returns false for unrelated 500 errors", () => {
    expect(
      isYouTubeInvalidApiKeyError({ response: { status: 500, data: { error: { message: "boom" } } } })
    ).toBe(false);
  });

  it("returns false for null / primitive values", () => {
    expect(isYouTubeInvalidApiKeyError(null)).toBe(false);
    expect(isYouTubeInvalidApiKeyError("err")).toBe(false);
    expect(isYouTubeInvalidApiKeyError(42)).toBe(false);
  });

  // Closes the `(entry.reason ?? "").toLowerCase()` branch for missing reasons.
  it("tolerates `reason`-less entries when a sibling still matches", () => {
    const err = {
      response: {
        status: 400,
        data: {
          error: {
            message: "",
            errors: [{ reason: "keyInvalid" }, {} as { reason?: string }],
          },
        },
      },
    };
    expect(isYouTubeInvalidApiKeyError(err)).toBe(true);
  });
});
