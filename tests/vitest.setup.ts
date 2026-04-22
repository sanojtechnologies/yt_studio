import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, vi } from "vitest";

/**
 * Load `.env.test.local` into process.env so the live test suite can find
 * YOUTUBE_API_KEY_TEST / GEMINI_API_KEY_TEST without committing them. The
 * file is git-ignored via the `.env*.local` rule. Values already present in
 * process.env (e.g. CI-injected secrets) take precedence.
 */
function loadDotenv(path: string): void {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotenv(resolve(process.cwd(), ".env.test.local"));

// A shared, process-wide cookie store for tests that exercise Next.js route
// handlers. The `next/headers` module is mocked here once so every test file
// picks up the same stub without having to re-declare vi.mock at the top.
const cookieStore: Record<string, string> = {};

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) =>
      cookieStore[name] !== undefined ? { value: cookieStore[name] } : undefined,
  }),
}));

type CookieHelpers = {
  set: (name: string, value: string) => void;
  clear: () => void;
  store: Record<string, string>;
};

(globalThis as unknown as { __testCookies: CookieHelpers }).__testCookies = {
  set: (name, value) => {
    cookieStore[name] = value;
  },
  clear: () => {
    for (const key of Object.keys(cookieStore)) delete cookieStore[key];
  },
  store: cookieStore,
};

beforeEach(() => {
  for (const key of Object.keys(cookieStore)) delete cookieStore[key];
});
