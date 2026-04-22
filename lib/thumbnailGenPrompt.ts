export interface ThumbnailGenInput {
  prompt: string;
  channelStyle?: string;
  /** "high-contrast", "minimal", "face-forward", etc. Free text, optional. */
  styleHint?: string;
}

export const THUMBNAIL_GEN_LIMITS = {
  maxPromptLength: 500,
  variantCount: 3,
} as const;

/**
 * Plain-English instruction for an image-generation model. Keep it tight —
 * the image API treats the entire string as the visual brief.
 */
export function buildThumbnailGenPrompt(input: ThumbnailGenInput): string {
  const { prompt, channelStyle, styleHint } = input;
  return [
    "Create a YouTube thumbnail. 16:9 aspect ratio, high-contrast composition,",
    "clear focal point, bold typography (≤4 words). No watermarks, no text glitches.",
    styleHint ? `Style hint: ${styleHint}.` : "",
    channelStyle ? `Match this channel's existing style: ${channelStyle}.` : "",
    "",
    `Concept: ${prompt}`,
  ]
    .filter(Boolean)
    .join("\n");
}
