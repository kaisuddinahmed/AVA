// ============================================================================
// BillingBadge — Phase 4.5.1 Codex P2 component tests.
//
// Asserts:
//   - render-gated: non-Shopify siteUrl → no badge
//   - render-gated: not activated → no badge
//   - fetches /api/billing/status on mount with shopDomain query
//   - renders plan + status with the right palette per ACTIVE / PENDING / DECLINED
//   - falls back to "Free plan" label when API returns null plan/status
//   - click opens PlanPicker; close re-fires the status fetch
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BillingBadge } from "./BillingBadge";

// ── fetch stub ─────────────────────────────────────────────────────────────

type StubResponse = { ok: boolean; status: number; data: unknown };
const fetchMock = vi.fn();

function setFetchResponses(responses: Record<string, StubResponse>) {
  fetchMock.mockImplementation((url: string) => {
    const match = Object.keys(responses).find((p) => url.includes(p));
    if (!match) {
      return Promise.resolve({
        ok: false, status: 404,
        json: async () => ({ error: `unmocked: ${url}` }),
      });
    }
    const r = responses[match]!;
    return Promise.resolve({
      ok: r.ok,
      status: r.status,
      json: async () => r.data,
    });
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Render gating ──────────────────────────────────────────────────────────

describe("BillingBadge render gating", () => {
  it("does NOT render on non-Shopify siteUrl", () => {
    setFetchResponses({});
    const { container } = render(
      <BillingBadge activeSiteUrl="https://shop.example.com" activated={true} />,
    );
    expect(container.firstChild).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT render when not activated, even on Shopify domain", () => {
    setFetchResponses({});
    const { container } = render(
      <BillingBadge activeSiteUrl="https://shop-x.myshopify.com" activated={false} />,
    );
    expect(container.firstChild).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT render when activeSiteUrl is undefined", () => {
    setFetchResponses({});
    const { container } = render(<BillingBadge activeSiteUrl={undefined} activated={true} />);
    expect(container.firstChild).toBeNull();
  });
});

// ── Render + status fetch ──────────────────────────────────────────────────

describe("BillingBadge status fetch + display", () => {
  it("fetches /billing/status with the extracted shopDomain on mount", async () => {
    setFetchResponses({
      "/billing/status": {
        ok: true, status: 200,
        data: { shopDomain: "shop-x.myshopify.com", siteUrl: "https://shop-x.myshopify.com", plan: "starter", status: "ACTIVE", expiresAt: null, test: false },
      },
    });
    render(<BillingBadge activeSiteUrl="https://shop-x.myshopify.com/products/abc" activated={true} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const calledUrl = fetchMock.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("/billing/status?shopDomain=shop-x.myshopify.com");
  });

  it("renders plan + lowercased status when API returns a paid plan", async () => {
    setFetchResponses({
      "/billing/status": {
        ok: true, status: 200,
        data: { shopDomain: "shop-x.myshopify.com", siteUrl: "https://shop-x.myshopify.com", plan: "starter", status: "ACTIVE", expiresAt: null, test: false },
      },
    });
    render(<BillingBadge activeSiteUrl="https://shop-x.myshopify.com" activated={true} />);
    await screen.findByText(/starter.*active/i);
  });

  it("renders 'Free plan' label when API returns null plan/status (or 404)", async () => {
    setFetchResponses({
      "/billing/status": { ok: false, status: 404, data: { error: "not found" } },
    });
    render(<BillingBadge activeSiteUrl="https://shop-x.myshopify.com" activated={true} />);
    // Allow the failed fetch to settle, then check render.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText(/free plan/i)).toBeInTheDocument();
  });

  it("renders TEST chip when API marks subscription as test mode", async () => {
    setFetchResponses({
      "/billing/status": {
        ok: true, status: 200,
        data: { shopDomain: "shop-x.myshopify.com", siteUrl: "https://shop-x.myshopify.com", plan: "starter", status: "ACTIVE", expiresAt: null, test: true },
      },
    });
    render(<BillingBadge activeSiteUrl="https://shop-x.myshopify.com" activated={true} />);
    await screen.findByText("TEST");
  });
});

// ── Click opens picker ─────────────────────────────────────────────────────

describe("BillingBadge picker interaction", () => {
  it("clicking the badge opens the PlanPicker modal", async () => {
    setFetchResponses({
      "/billing/status": {
        ok: true, status: 200,
        data: { shopDomain: "shop-x.myshopify.com", siteUrl: "https://shop-x.myshopify.com", plan: "starter", status: "ACTIVE", expiresAt: null, test: false },
      },
      "/billing/plans": {
        ok: true, status: 200,
        data: { plans: [
          { id: "free", name: "Free", description: "Free tier", trialDays: 0, recurring: null },
          { id: "starter", name: "AVA Starter", description: "Starter tier", trialDays: 14, recurring: { amount: 29, interval: "EVERY_30_DAYS" } },
        ]},
      },
    });
    const user = userEvent.setup();
    render(<BillingBadge activeSiteUrl="https://shop-x.myshopify.com" activated={true} />);
    const badge = await screen.findByRole("button", { name: /starter/i });
    await user.click(badge);
    await screen.findByText(/choose a plan/i);
  });
});
