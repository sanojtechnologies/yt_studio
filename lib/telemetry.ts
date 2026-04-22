/**
 * Pluggable error-reporting seam. Default behaviour is a no-op so the app can
 * be deployed without Sentry/PostHog/etc. To enable, set the public env var
 * `NEXT_PUBLIC_TELEMETRY_ENDPOINT` to a URL that accepts POST application/json
 * payloads of the shape produced by `serializeError`.
 *
 * Keys, cookies, and the literal string `apiKey` are scrubbed from any
 * `context` before transmission. We never send the user's BYOK material,
 * which is the entire reason this module exists rather than a vendor SDK.
 */

export interface TelemetryContext {
  [key: string]: unknown;
}

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  context?: TelemetryContext;
  timestamp: string;
}

const SECRET_KEY_PATTERNS = [/key/i, /token/i, /secret/i, /authorization/i, /cookie/i];

function isSecretKey(name: string): boolean {
  return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(name));
}

export function scrubContext(context: TelemetryContext | undefined): TelemetryContext | undefined {
  if (!context) return undefined;
  const out: TelemetryContext = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = isSecretKey(key) ? "[redacted]" : value;
  }
  return out;
}

export function serializeError(
  error: unknown,
  context?: TelemetryContext
): SerializedError {
  const base = {
    timestamp: new Date().toISOString(),
    context: scrubContext(context),
  };
  if (error instanceof Error) {
    return { ...base, name: error.name, message: error.message, stack: error.stack };
  }
  return { ...base, name: "NonError", message: String(error) };
}

function getEndpoint(): string | null {
  const value = process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT?.trim();
  return value ? value : null;
}

/**
 * Best-effort fire-and-forget. Never throws — telemetry must not be a new
 * source of incidents. Returns `true` only when a real POST was attempted and
 * the server responded with a 2xx; otherwise `false`.
 */
export async function reportError(
  error: unknown,
  context?: TelemetryContext
): Promise<boolean> {
  const endpoint = getEndpoint();
  if (!endpoint) return false;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serializeError(error, context)),
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}
