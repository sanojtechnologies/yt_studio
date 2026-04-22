import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/vitest.setup.ts"],
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: [
        "**/*.d.ts",
        "lib/clientApiKey.ts", // client-only module (localStorage/cookies DOM APIs)
        "lib/idb.ts",          // browser-only IndexedDB adapter; no Node runtime
      ],
      // 100% across the board — see PRD § 9.4. New code under lib/** or
      // app/api/** must ship with tests that keep these at 100. Use
      // /* v8 ignore next */ sparingly (and only for genuinely unreachable
      // branches) rather than weakening these numbers.
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100,
      },
    },
  },
});
