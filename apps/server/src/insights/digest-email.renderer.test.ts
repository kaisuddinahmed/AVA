// ============================================================================
// digest-email.renderer — Phase 3.7 unit tests.
//
// Pure renderer, no I/O. Asserts:
//   - subject summarises revenue + shipped + pending
//   - html escapes user-controlled fields (siteUrl, friction IDs)
//   - html contains the four decision pills and their counts
//   - html lists each top friction's ID, n=, CR%, dismiss%
//   - text fallback is plain and reflects the same numbers
//   - wow=null renders "—" rather than crashing
// ============================================================================

import { describe, it, expect } from "vitest";
import { renderDigestEmail } from "./digest-email.renderer.js";
import type { WeeklyDigest } from "./weekly-digest.service.js";

function digest(over: Partial<WeeklyDigest> = {}): WeeklyDigest {
  return {
    siteUrl: "https://shop.example",
    period: {
      start: new Date("2026-05-10T00:00:00Z"),
      end:   new Date("2026-05-17T00:00:00Z"),
      days:  7,
    },
    traffic: { sessions: 1200, sessionsPrior: 1000, wowDeltaPct: 20 },
    recommendations: { approvedThisWeek: 3, rejectedThisWeek: 1, pendingNow: 2, activeNow: 4 },
    outcomes: {
      snapshotsThisWeek: 6,
      decisions: { ship: 2, rollback: 1, extend: 2, inconclusive: 1, total: 6 },
      attributedRevenue: 1234.56,
    },
    topFrictions: [
      { frictionId: "F001", total: 100, converted: 10, dismissed: 50, ignored: 40, conversionRate: 0.1, dismissalRate: 0.5 },
      { frictionId: "F002", total: 60,  converted: 6,  dismissed: 18, ignored: 36, conversionRate: 0.1, dismissalRate: 0.3 },
    ],
    ...over,
  };
}

describe("renderDigestEmail subject", () => {
  it("summarises revenue, shipped wins, and pending count", () => {
    const { subject } = renderDigestEmail(digest());
    expect(subject).toContain("$1234.56");
    expect(subject).toContain("2 shipped");
    expect(subject).toContain("2 pending");
  });
});

describe("renderDigestEmail html", () => {
  it("escapes the siteUrl in the header", () => {
    const { html } = renderDigestEmail(digest({ siteUrl: "https://shop.example/<bad>" }));
    expect(html).toContain("https://shop.example/&lt;bad&gt;");
    expect(html).not.toContain("<bad>"); // never raw
  });

  it("renders all four decision pills with their counts", () => {
    const { html } = renderDigestEmail(digest());
    expect(html).toMatch(/2 ship/);
    expect(html).toMatch(/1 rollback/);
    expect(html).toMatch(/2 extend/);
    expect(html).toMatch(/1 inconclusive/);
  });

  it("lists every top-friction row with id and counts", () => {
    const { html } = renderDigestEmail(digest());
    expect(html).toContain("F001");
    expect(html).toContain("n=100");
    expect(html).toContain("10.0% conv");
    expect(html).toContain("50.0% dismiss");
    expect(html).toContain("F002");
  });

  it("renders WoW '—' when wowDeltaPct is null (no baseline)", () => {
    const { html } = renderDigestEmail(digest({ traffic: { sessions: 50, sessionsPrior: 0, wowDeltaPct: null } }));
    expect(html).toMatch(/&mdash;|—/);
  });

  it("omits the top-frictions block when there are none", () => {
    const { html } = renderDigestEmail(digest({ topFrictions: [] }));
    expect(html).not.toContain("Top frictions");
  });
});

describe("renderDigestEmail text fallback", () => {
  it("is plain-text and contains the headline metrics", () => {
    const { text } = renderDigestEmail(digest());
    expect(text).not.toContain("<");
    expect(text).toContain("AVA weekly digest");
    expect(text).toContain("$1234.56");
    expect(text).toContain("Sessions: 1200");
    expect(text).toContain("F001");
  });
});
