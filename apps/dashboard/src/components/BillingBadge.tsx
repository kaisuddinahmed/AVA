// ============================================================================
// BillingBadge — Phase 4.5.1.
//
// Small chip in the dashboard header that surfaces the merchant's current
// AVA plan + Shopify subscription status. Clicking opens PlanPicker.
//
// Status meaning:
//   ACTIVE       — green
//   PENDING      — yellow (merchant hasn't approved the confirmation URL yet)
//   FROZEN       — yellow (shop billing account frozen by Shopify)
//   DECLINED     — red (merchant declined the charge)
//   EXPIRED      — muted
//   CANCELLED    — muted
//   null / free  — neutral pill ("Free plan")
// ============================================================================

import { useState } from "react";
import { useApi } from "../hooks/use-api";
import { extractShopifyDomain } from "../lib/shop-domain";
import { PlanPicker } from "./PlanPicker";

interface BillingStatusResponse {
  shopDomain: string;
  siteUrl: string;
  plan: string | null;
  status: string | null;
  expiresAt: string | null;
  test: boolean | null;
}

const STATUS_COLOR: Record<string, { fg: string; bg: string }> = {
  ACTIVE:      { fg: "var(--accent)",        bg: "rgba(53,211,161,0.18)" },
  PENDING:     { fg: "#e6b800",              bg: "rgba(230,184,0,0.18)" },
  FROZEN:      { fg: "#e6b800",              bg: "rgba(230,184,0,0.18)" },
  DECLINED:    { fg: "var(--tier-escalate)", bg: "rgba(228,87,87,0.18)" },
  EXPIRED:     { fg: "var(--muted)",         bg: "rgba(255,255,255,0.06)" },
  CANCELLED:   { fg: "var(--muted)",         bg: "rgba(255,255,255,0.06)" },
};

interface Props {
  activeSiteUrl: string | undefined;
  activated: boolean;
}

export function BillingBadge({ activeSiteUrl, activated }: Props) {
  const shopDomain = extractShopifyDomain(activeSiteUrl);
  const [open, setOpen] = useState(false);

  // Only fetch when activated AND on a Shopify shop. Non-Shopify shops
  // can't subscribe through the Billing API; we just don't render the badge.
  const path = activated && shopDomain
    ? `/billing/status?shopDomain=${encodeURIComponent(shopDomain)}`
    : null;
  const { data, error, reload } = useApi<BillingStatusResponse>(path, { pollMs: 30_000 });

  if (!shopDomain || !activated) return null;

  // 404 means SiteConfig exists but billing endpoint hasn't been hit yet —
  // treat as a "Free" merchant who hasn't picked a plan.
  const plan = data?.plan ?? "free";
  const status = data?.status ?? null;
  const isFree = plan === "free" && !status;
  const palette = status ? STATUS_COLOR[status] ?? STATUS_COLOR.EXPIRED : null;

  const label = isFree
    ? "Free plan"
    : status
      ? `${plan} · ${status.toLowerCase()}`
      : plan ?? "—";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 12px",
          borderRadius: 16,
          border: "1px solid var(--line)",
          background: palette ? palette.bg : "rgba(255,255,255,0.06)",
          color: palette ? palette.fg : "var(--muted)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          cursor: "pointer",
        }}
        title={error ? `Billing status error: ${error}` : "Manage plan"}
      >
        <span>{label}</span>
        {data?.test && <span style={{ fontSize: 9, opacity: 0.7 }}>TEST</span>}
        <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <PlanPicker
          shopDomain={shopDomain}
          currentPlan={plan}
          onClose={() => { setOpen(false); reload(); }}
        />
      )}
    </>
  );
}
