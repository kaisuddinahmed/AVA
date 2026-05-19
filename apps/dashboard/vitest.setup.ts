// ============================================================================
// Vitest setup — runs once per test file before the test code.
//
// Wires up @testing-library/jest-dom matchers (toBeInTheDocument,
// toHaveTextContent, etc.) and ensures DOM is cleaned between tests so
// component re-renders don't leak state across `it()` blocks.
// ============================================================================

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
