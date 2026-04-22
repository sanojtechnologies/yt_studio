export interface ParsedChannelInput {
  channelId?: string;
  handle?: string;
}

const CHANNEL_ID_PATTERN = /^UC[\w-]{20,}$/;
const BARE_HANDLE_PATTERN = /^[\w.-]+$/;

export function parseChannelInput(value: string): ParsedChannelInput {
  const input = value.trim();
  if (!input) return {};

  if (input.startsWith("@")) {
    return { handle: input.slice(1) };
  }

  try {
    const url = new URL(input);
    const path = url.pathname.replace(/\/+$/, "");
    if (path.startsWith("/@")) {
      return { handle: path.slice(2) };
    }
    if (path.startsWith("/channel/")) {
      return { channelId: path.replace("/channel/", "") };
    }
  } catch {
    // Non-URL strings fall through to regex-based detection below.
  }

  if (CHANNEL_ID_PATTERN.test(input)) {
    return { channelId: input };
  }

  if (BARE_HANDLE_PATTERN.test(input)) {
    return { handle: input.replace(/^@/, "") };
  }

  return {};
}
