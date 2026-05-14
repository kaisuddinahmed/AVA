import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    // Node env is fine for pure utilities; switch to "jsdom" + @testing-library
    // when adding React component tests.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
