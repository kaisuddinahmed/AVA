import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    // Node env is fine for pure utilities; switch to "jsdom" + @testing-library
    // when adding React component tests.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      // Most of the dashboard is React components; pure utilities under
      // src/lib + src/hooks are the testable engine surface. Component
      // coverage is best-effort until @testing-library is added.
      include: ["src/lib/**/*.ts", "src/hooks/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    },
  },
});
