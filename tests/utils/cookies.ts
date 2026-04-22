type CookieHelpers = {
  set: (name: string, value: string) => void;
  clear: () => void;
  store: Record<string, string>;
};

function helpers(): CookieHelpers {
  const value = (globalThis as unknown as { __testCookies?: CookieHelpers })
    .__testCookies;
  if (!value) {
    throw new Error(
      "Test cookie helpers are unavailable. Ensure tests/vitest.setup.ts is loaded via vitest.config.ts setupFiles."
    );
  }
  return value;
}

export function setTestCookie(name: string, value: string): void {
  helpers().set(name, value);
}

export function clearTestCookies(): void {
  helpers().clear();
}
