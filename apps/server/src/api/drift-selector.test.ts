// ============================================================================
// Drift API — selector-drift endpoints (Phase 1.5.6).
//
// Direct handler tests with mocked repos. Verifies the split-lifecycle
// surface (baseline / status / check) is reachable + correctly delegating.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@ava/db", () => ({
  DriftSnapshotRepo: {},
  DriftAlertRepo: {
    hasRecentAlert: vi.fn().mockResolvedValue(false),
    createAlert: vi.fn().mockResolvedValue({}),
  },
  SiteSelectorFingerprintRepo: {
    markAsBaseline: vi.fn(),
    listForSite: vi.fn(),
    recordDrift: vi.fn().mockResolvedValue({}),
  },
}));

// Existing jobs/drift-detector functions are imported by drift.api.ts but not
// exercised here — stub them out so the import succeeds without GROQ key etc.
vi.mock("../jobs/drift-detector.js", () => ({
  getDriftStatus: vi.fn(),
  runDriftCheck: vi.fn(),
}));

import { SiteSelectorFingerprintRepo, DriftAlertRepo } from "@ava/db";
import {
  promoteSelectorBaseline,
  getSelectorDriftStatus,
  triggerSelectorDriftCheck,
} from "./drift.api.js";

const markAsBaselineMock = SiteSelectorFingerprintRepo.markAsBaseline as ReturnType<typeof vi.fn>;
const listForSiteMock    = SiteSelectorFingerprintRepo.listForSite as ReturnType<typeof vi.fn>;
const hasRecentAlertMock = DriftAlertRepo.hasRecentAlert as ReturnType<typeof vi.fn>;

import type { Request as ExpressReq, Response as ExpressRes } from "express";

interface MockResponse {
  status(n: number): MockResponse;
  json(b: unknown): MockResponse;
  getStatus(): number;
  getBody(): unknown;
}
function mockRes(): MockResponse {
  let statusCode = 200;
  let body: unknown = undefined;
  const r: MockResponse = {
    status(n) { statusCode = n; return r; },
    json(b)   { body = b; return r; },
    getStatus() { return statusCode; },
    getBody()   { return body; },
  };
  return r;
}
const asReq = (body: unknown, query: Record<string, string> = {}): ExpressReq =>
  ({ body, query, params: {} } as unknown as ExpressReq);
const asRes = (m: MockResponse): ExpressRes => m as unknown as ExpressRes;

beforeEach(() => {
  markAsBaselineMock.mockReset();
  listForSiteMock.mockReset();
  hasRecentAlertMock.mockReset().mockResolvedValue(false);
});

// ── POST /api/drift/selector-baseline ───────────────────────────────────────

describe("promoteSelectorBaseline", () => {
  it("400s on missing siteUrl or pageType", async () => {
    const res = mockRes();
    await promoteSelectorBaseline(asReq({}), asRes(res));
    expect(res.getStatus()).toBe(400);
  });

  it("404s when there is no fingerprint row to promote", async () => {
    markAsBaselineMock.mockResolvedValueOnce(null);
    const res = mockRes();
    await promoteSelectorBaseline(asReq({ siteUrl: "https://x.test", pageType: "pdp" }), asRes(res));
    expect(res.getStatus()).toBe(404);
  });

  it("returns the promoted row's baseline metadata on success", async () => {
    markAsBaselineMock.mockResolvedValueOnce({
      siteUrl: "https://x.test",
      pageType: "pdp",
      baselineHash: "deadbeef",
      baselineCapturedAt: new Date("2026-05-16T10:00:00Z"),
    });
    const res = mockRes();
    await promoteSelectorBaseline(asReq({ siteUrl: "https://x.test", pageType: "pdp" }), asRes(res));
    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toMatchObject({
      siteUrl: "https://x.test",
      pageType: "pdp",
      baselineHash: "deadbeef",
    });
  });
});

// ── GET /api/drift/selector-status ─────────────────────────────────────────

describe("getSelectorDriftStatus", () => {
  it("400s without ?siteUrl=", async () => {
    const res = mockRes();
    await getSelectorDriftStatus(asReq({}, {}), asRes(res));
    expect(res.getStatus()).toBe(400);
  });

  it("returns per-pageType baseline + drift counters", async () => {
    listForSiteMock.mockResolvedValueOnce([
      {
        pageType: "pdp",
        fingerprintHash: "h-current",
        baselineHash: "h-baseline",
        baselineCapturedAt: new Date("2026-04-01T00:00:00Z"),
        driftCount: 3,
        lastDriftAt: new Date("2026-05-10T00:00:00Z"),
        lastCheckedAt: new Date("2026-05-16T00:00:00Z"),
      },
      {
        pageType: "cart",
        fingerprintHash: "h-cart",
        baselineHash: null,
        baselineCapturedAt: null,
        driftCount: 0,
        lastDriftAt: null,
        lastCheckedAt: new Date("2026-05-16T00:00:00Z"),
      },
    ]);
    const res = mockRes();
    await getSelectorDriftStatus(asReq({}, { siteUrl: "https://x.test" }), asRes(res));
    expect(res.getStatus()).toBe(200);
    const body = res.getBody() as { siteUrl: string; pageTypes: Array<Record<string, unknown>> };
    expect(body.siteUrl).toBe("https://x.test");
    expect(body.pageTypes).toHaveLength(2);
    expect(body.pageTypes[0]).toMatchObject({
      pageType: "pdp",
      hasBaseline: true,
      hashesMatch: false,        // current=h-current vs baseline=h-baseline
      driftCount: 3,
    });
    expect(body.pageTypes[1]).toMatchObject({
      pageType: "cart",
      hasBaseline: false,
      hashesMatch: false,
    });
  });
});

// ── POST /api/drift/selector-check ──────────────────────────────────────────

describe("triggerSelectorDriftCheck", () => {
  it("400s without siteUrl", async () => {
    const res = mockRes();
    await triggerSelectorDriftCheck(asReq({}), asRes(res));
    expect(res.getStatus()).toBe(400);
  });

  it("delegates to checkDriftForSite and returns its result", async () => {
    // Simulate the repo returning a single baselined row that exactly matches
    // its baseline — checkDriftForSite should return score=1, no alert.
    listForSiteMock.mockResolvedValueOnce([
      {
        siteUrl: "https://x.test",
        pageType: "pdp",
        fingerprintHash: "h-stable",
        baselineHash: "h-stable",
        baselineSelectors: JSON.stringify({ addToCart: ".btn" }),
        selectors: JSON.stringify({ addToCart: ".btn" }),
        baselineCapturedAt: new Date(),
        driftCount: 0,
        lastDriftAt: null,
        lastCheckedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        fingerprintData: "{}",
        id: "id_pdp",
      },
    ]);
    const res = mockRes();
    await triggerSelectorDriftCheck(asReq({ siteUrl: "https://x.test" }), asRes(res));
    expect(res.getStatus()).toBe(200);
    const body = res.getBody() as Record<string, unknown>;
    expect(body.siteUrl).toBe("https://x.test");
    expect(body.overallSimilarity).toBe(1);
  });
});
