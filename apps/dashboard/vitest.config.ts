import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    // jsdom env so React component tests with @testing-library/react work.
    // Pure-node tests (lib/, hooks/poll-controller) run unchanged — jsdom
    // is a strict superset of node for our purposes.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      // Component coverage now in scope alongside pure utilities.
      include: ["src/lib/**/*.ts", "src/hooks/**/*.ts", "src/components/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    },
  },
});
