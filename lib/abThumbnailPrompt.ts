import { Type } from "@google/genai";
import { isValidHttpUrl, SUPPORTED_IMAGE_TYPES } from "@/lib/thumbnailPrompt";

export interface AbThumbnailAxisScore {
  axis: "faceImpact" | "readability" | "contrast" | "curiosityGap";
  a: number;
  b: number;
}

export interface AbThumbnailResponse {
  winnerIndex: 0 | 1;
  verdict: string;
  axisScores: AbThumbnailAxisScore[];
  improvements: string[];
}

/** Re-exported so callers can share MIME validation without importing two modules. */
export { SUPPORTED_IMAGE_TYPES, isValidHttpUrl };

export const AB_THUMBNAIL_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
} as const;

export function buildAbThumbnailPrompt(title?: string): string {
  return [
    "You are a YouTube thumbnail comparison expert.",
    "You receive two thumbnails — image A then image B — for the same video idea.",
    "Score each 1-10 on four axes: faceImpact, readability, contrast, curiosityGap.",
    "Then pick a winnerIndex (0 = A, 1 = B) and write a ≤40-word verdict sentence.",
    "Finally list 3 specific, actionable improvements that would help the weaker thumbnail.",
    "Return ONLY JSON matching the provided schema. No commentary, no markdown.",
    title ? `Video title (context): ${title}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const AB_THUMBNAIL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    winnerIndex: { type: Type.INTEGER },
    verdict: { type: Type.STRING },
    axisScores: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          axis: { type: Type.STRING },
          a: { type: Type.INTEGER },
          b: { type: Type.INTEGER },
        },
        required: ["axis", "a", "b"],
        propertyOrdering: ["axis", "a", "b"],
      },
    },
    improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["winnerIndex", "verdict", "axisScores", "improvements"],
  propertyOrdering: ["winnerIndex", "verdict", "axisScores", "improvements"],
};

export interface FetchedImage {
  base64: string;
  mimeType: string;
}

/**
 * Normalise a remote thumbnail URL into a base64 payload, rejecting oversized
 * or unsupported images early with a descriptive error message.
 * Pure with respect to the supplied `fetchImpl` — tests inject their own.
 */
export async function fetchImageFromUrl(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<FetchedImage> {
  if (!isValidHttpUrl(url)) {
    throw new Error("Invalid image URL");
  }
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status})`);
  }
  const rawContentType = response.headers.get("content-type") ?? "image/jpeg";
  const mimeType = rawContentType.split(";")[0].trim().toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}`);
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > AB_THUMBNAIL_LIMITS.maxBytes) {
    throw new Error("Image exceeds 5 MiB size limit");
  }
  return {
    base64: Buffer.from(buffer).toString("base64"),
    mimeType,
  };
}

export function decodeUploadedImage(file: File): Promise<FetchedImage> {
  const mimeType = (file.type || "image/jpeg").toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    return Promise.reject(new Error(`Unsupported image type: ${mimeType}`));
  }
  if (file.size > AB_THUMBNAIL_LIMITS.maxBytes) {
    return Promise.reject(new Error("Image exceeds 5 MiB size limit"));
  }
  return file.arrayBuffer().then((buf) => ({
    base64: Buffer.from(buf).toString("base64"),
    mimeType,
  }));
}
