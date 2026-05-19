// ============================================================================
// PlanPicker — Phase 4.5.1 Codex P2 component tests.
//
// Asserts:
//   - lists the three plans from /billing/plans
//   - free plan choose → POST /billing/start, no window.open
//   - paid plan choose → POST /billing/start, window.open(confirmationUrl)
//   - failure path: error message surfaced, modal stays open
//   - close button calls onClose
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanPicker } from "./PlanPicker";

type StubResponse = { ok: boolean; status: number; data: unknown };
const fetchMock = vi.fn();
const windowOpenMock = vi.fn();

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

const PLANS_RESPONSE = {
  plans: [
    { id: "free", name: "Free", description: "Free tier", trialDays: 0, recurring: null },
    {
      id: "starter", name: "AVA Starter", description: "Starter tier",
      trialDays: 14, recurring: { amount: 29, interval: "EVERY_30_DAYS" },
      usage: { terms: "$0.01/intervention", cappedAmountUsd: 100 },
    },
    {
      id: "pro", name: "AVA Pro", description: "Pro tier",
      trialDays: 14, recurring: { amount: 99, interval: "EVERY_30_DAYS" },
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("open", windowOpenMock);
  fetchMock.mockReset();
  windowOpenMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Lists plans ────────────────────────────────────────────────────────────

describe("PlanPicker — renders plans", () => {
  it("lists all three plan cards from /billing/plans", async () => {
    setFetchResponses({ "/billing/plans": { ok: true, status: 200, data: PLANS_RESPONSE } });
    render(<PlanPicker shopDomain="shop-x.myshopify.com" currentPlan="free" onClose={() => {}} />);
    await screen.findByText(/free tier/i);
    expect(screen.getByText(/ava starter/i)).toBeInTheDocument();
    expect(screen.getByText(/ava pro/i)).toBeInTheDocument();
  });

  it("marks the current plan visually and disables its CTA", async () => {
    setFetchResponses({ "/billing/plans": { ok: true, status: 200, data: PLANS_RESPONSE } });
    render(<PlanPicker shopDomain="shop-x.myshopify.com" currentPlan="starter" onClose={() => {}} />);
    const currentBtn = await screen.findByRole("button", { name: /current plan/i });
    expect(currentBtn).toBeDisabled();
  });
});

// ── Free plan: local-only, no Shopify hop ──────────────────────────────────

describe("PlanPicker — free plan path", () => {
  it("free plan choose → POST /billing/start and shows success message; window.open NOT called", async () => {
    setFetchResponses({
      "/billing/plans": { ok: true, status: 200, data: PLANS_RESPONSE },
      "/billing/start": {
        ok: true, status: 200,
        data: { plan: "free", confirmationUrl: null, appSubscriptionId: null },
      },
    });
    const user = userEvent.setup();
    render(<PlanPicker shopDomain="shop-x.myshopify.com" currentPlan="starter" onClose={() => {}} />);
    const switchBtn = await screen.findByRole("button", { name: /switch to free/i });
    await user.click(switchBtn);
    await screen.findByText(/switched to free/i);
    expect(windowOpenMock).not.toHaveBeenCalled();
  });
});

// ── Paid plan: opens confirmationUrl ───────────────────────────────────────

describe("PlanPicker — paid plan path", () => {
  it("paid plan choose → window.open(confirmationUrl) + 'Approval flow opened' message", async () => {
    setFetchResponses({
      "/billing/plans": { ok: true, status: 200, data: PLANS_RESPONSE },
      "/billing/start": {
        ok: true, status: 200,
        data: { plan: "starter", confirmationUrl: "https://shopify.com/charge/abc", appSubscriptionId: "gid://sub/1" },
      },
    });
    const user = userEvent.setup();
    render(<PlanPicker shopDomain="shop-x.myshopify.com" currentPlan="free" onClose={() => {}} />);
    // Two paid plans both render "Choose & approve" — scope to the starter card.
    const starterHeading = await screen.findByText(/ava starter/i);
    const starterCard = starterHeading.closest("div")!.parentElement!;
    const chooseBtn = within(starterCard).getByRole("button", { name: /choose & approve/i });
    await user.click(chooseBtn);
    await waitFor(() => expect(windowOpenMock).toHaveBeenCalledTimes(1));
    expect(windowOpenMock).toHaveBeenCalledWith("https://shopify.com/charge/abc", "_blank", "noopener");
    await screen.findByText(/approval flow opened/i);
  });
});

// ── Failure path ───────────────────────────────────────────────────────────

describe("PlanPicker — failure path", () => {
  it("API failure surfaces an error message and does not open a new tab", async () => {
    setFetchResponses({
      "/billing/plans": { ok: true, status: 200, data: PLANS_RESPONSE },
      "/billing/start": {
        ok: false, status: 400,
        data: { error: "Shopify not installed" },
      },
    });
    const user = userEvent.setup();
    render(<PlanPicker shopDomain="shop-x.myshopify.com" currentPlan="free" onClose={() => {}} />);
    // Scope to the starter card so we don't match the pro card's button too.
    const starterHeading = await screen.findByText(/ava starter/i);
    const starterCard = starterHeading.closest("div")!.parentElement!;
    const chooseBtn = within(starterCard).getByRole("button", { name: /choose & approve/i });
    await user.click(chooseBtn);
    await screen.findByText(/failed:/i);
    expect(windowOpenMock).not.toHaveBeenCalled();
  });
});

// ── Close button ───────────────────────────────────────────────────────────

describe("PlanPicker — close interaction", () => {
  it("clicking the × button calls onClose", async () => {
    setFetchResponses({ "/billing/plans": { ok: true, status: 200, data: PLANS_RESPONSE } });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PlanPicker shopDomain="shop-x.myshopify.com" currentPlan="free" onClose={onClose} />);
    const closeBtn = await screen.findByRole("button", { name: /close/i });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
