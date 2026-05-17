// ============================================================================
// PlanPicker — Phase 4.5.1.
//
// Modal that lists AVA plans and lets the merchant choose one. On choose:
//   - Free plan → POST /api/billing/start → local update, no Shopify hop
//   - Paid plan → POST /api/billing/start → opens confirmationUrl in a
//                 new tab (Shopify merchant-approval flow)
//
// Return URL points at /api/billing/callback?shop=<shopDomain> so the
// status re-syncs as soon as the merchant lands back from Shopify. The
// badge's poll (30s) picks up the new status within a tick.
// ============================================================================

import { useState } from "react";
import { useApi, apiFetch } from "../hooks/use-api";

interface BillingPlan {
  id: "free" | "starter" | "pro";
  name: string;
  description: string;
  trialDays: number;
  recurring: { amount: number; interval: "EVERY_30_DAYS" | "ANNUAL" } | null;
  usage?: { terms: string; cappedAmountUsd: number };
}
interface PlansResponse { plans: BillingPlan[]; }

interface StartResponse {
  plan: BillingPlan["id"];
  confirmationUrl: string | null;
  appSubscriptionId: string | null;
}

interface Props {
  shopDomain: string;
  currentPlan: string;
  onClose: () => void;
}

export function PlanPicker({ shopDomain, currentPlan, onClose }: Props) {
  const { data: plansData } = useApi<PlansResponse>("/billing/plans");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function choose(planId: BillingPlan["id"]) {
    setPending(planId);
    setMessage(null);
    try {
      // Codex P1 (4.5.1) fix — the server builds the Shopify return URL
      // from APP_URL env. Dashboard does NOT compose it (was a fragile
      // localhost:3000→:8080 port swap).
      const result = await apiFetch<StartResponse>("/billing/start", {
        method: "POST",
        body: JSON.stringify({ shopDomain, planId }),
        headers: { "Content-Type": "application/json" },
      });
      if (result.confirmationUrl) {
        // Paid plan — open Shopify's approval page in a new tab.
        window.open(result.confirmationUrl, "_blank", "noopener");
        setMessage(`Approval flow opened in new tab. Complete it on Shopify, then this badge will update on next poll.`);
      } else {
        // Free plan — already saved.
        setMessage(`Switched to ${planId}.`);
      }
    } catch (err) {
      setMessage(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPending(null);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Choose a plan</h3>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">×</button>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {plansData?.plans?.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              isCurrent={p.id === currentPlan}
              isPending={pending === p.id}
              disabled={pending !== null}
              onChoose={() => choose(p.id)}
            />
          ))}
        </div>
        {message && (
          <div style={messageStyle}>{message}</div>
        )}
      </div>
    </div>
  );
}

function PlanCard({
  plan, isCurrent, isPending, disabled, onChoose,
}: {
  plan: BillingPlan;
  isCurrent: boolean;
  isPending: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  const isPaid = plan.recurring !== null;
  return (
    <div style={{
      flex: 1,
      minWidth: 180,
      padding: 16,
      border: isCurrent ? "1px solid var(--accent)" : "1px solid var(--line)",
      borderRadius: 6,
      background: isCurrent ? "rgba(53,211,161,0.06)" : "rgba(8,26,34,0.4)",
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{plan.name}</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, minHeight: 32 }}>
        {plan.description}
      </div>
      <div style={{ margin: "12px 0", fontFamily: "var(--font-mono)" }}>
        {isPaid ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
              ${plan.recurring!.amount}
              <span style={{ fontSize: 11, color: "var(--muted)" }}> / 30d</span>
            </div>
            {plan.usage && (
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                + usage up to ${plan.usage.cappedAmountUsd}/30d
              </div>
            )}
            {plan.trialDays > 0 && (
              <div style={{ fontSize: 10, color: "var(--accent)", marginTop: 4 }}>
                {plan.trialDays}-day free trial
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>Free</div>
        )}
      </div>
      <button
        onClick={onChoose}
        disabled={disabled || isCurrent}
        style={{
          width: "100%",
          padding: "8px 12px",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 600,
          background: isCurrent ? "rgba(255,255,255,0.04)" : "rgba(53,211,161,0.18)",
          border: `1px solid ${isCurrent ? "var(--line)" : "rgba(53,211,161,0.4)"}`,
          color: isCurrent ? "var(--muted)" : "var(--accent)",
          borderRadius: 3,
          cursor: disabled || isCurrent ? "not-allowed" : "pointer",
        }}
      >
        {isPending ? "…" : isCurrent ? "Current plan" : isPaid ? "Choose & approve" : "Switch to Free"}
      </button>
    </div>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────

const overlayStyle = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(6,20,30,0.7)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const modalStyle = {
  width: 720,
  maxWidth: "calc(100vw - 32px)",
  background: "var(--surface, #0a1f29)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: 24,
  color: "var(--text)",
};

const headerStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  marginBottom: 16,
};

const closeBtnStyle = {
  background: "transparent",
  border: "none",
  color: "var(--muted)",
  cursor: "pointer",
  fontSize: 24,
  lineHeight: 1,
  padding: 0,
};

const messageStyle = {
  marginTop: 16,
  padding: "10px 12px",
  background: "rgba(8,26,34,0.6)",
  border: "1px solid var(--line)",
  borderRadius: 4,
  fontSize: 12,
  color: "var(--muted)",
  fontFamily: "var(--font-mono)" as const,
};
