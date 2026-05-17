import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      // Phase 4.7 — baseline coverage tooling. Reports are advisory at first;
      // CLAUDE.md gate is "60%+ on engine paths" — enforced via the
      // `thresholds.perFile` block below only for the engine path globs.
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      // Source set to measure. Excludes test files, the bootstrap entry, and
      // generated artifacts.
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/**/*.d.ts",
      ],
      // Two-tier thresholds:
      //   1. Global soft floor for the whole server (50/40) — catches obvious
      //      coverage rot without blocking PRs that legitimately add thin
      //      surface area (config files, types, API wiring).
      //   2. Engine-path hard floor (60/50) per CLAUDE.md — the "60%+ on
      //      engine paths" gate. Failing any of these blocks `npm run
      //      test:coverage` and therefore CI.
      // Engine paths chosen to mirror CLAUDE.md priorities: MSWIM signals,
      // decision/dispatch engine, experiment splitter, friction inference,
      // intent parser, recommendation engine. Non-engine paths (API
      // wiring, prompts, jobs) stay on the global floor.
      thresholds: {
        lines: 50,
        functions: 50,
        statements: 50,
        branches: 40,
        "src/evaluate/mswim/**": {
          lines: 60, functions: 60, statements: 60, branches: 50,
        },
        "src/evaluate/decision-engine.ts": {
          lines: 60, functions: 60, statements: 60, branches: 50,
        },
        "src/intervene/attribution-resolver.ts": {
          lines: 60, functions: 60, statements: 60, branches: 50,
        },
        "src/intervene/experiment-recommendation-cache.ts": {
          lines: 60, functions: 60, statements: 60, branches: 50,
        },
        "src/insights/recommendation-engine.ts": {
          lines: 60, functions: 60, statements: 60, branches: 50,
        },
        "src/insights/recommendation.service.ts": {
          lines: 60, functions: 60, statements: 60, branches: 50,
        },
        "src/insights/recommendation-outcome.service.ts": {
          lines: 60, functions: 60, statements: 60, branches: 50,
        },
        "src/insights/weekly-digest.service.ts": {
          lines: 60, functions: 60, statements: 60, branches: 50,
        },
        "src/experiment/**": {
          lines: 60, functions: 60, statements: 60, branches: 50,
        },
        "src/agent/intent-parser.ts": {
          lines: 60, functions: 60, statements: 60, branches: 50,
        },
      },
    },
  },
});
