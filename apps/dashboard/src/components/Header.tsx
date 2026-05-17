import { BillingBadge } from "./BillingBadge";

interface Props {
  connected: boolean;
  activated?: boolean;
  /** Phase 4.5.1 — drives the BillingBadge (only renders for *.myshopify.com sites). */
  activeSiteUrl?: string;
}

export function Header({ connected, activated = true, activeSiteUrl }: Props) {
  const dotClass = !activated ? "inactive" : connected ? "" : "disconnected";
  const statusText = !activated ? "Inactive" : connected ? "Live" : "Disconnected";

  return (
    <div className="dashboard-header">
      <div className="brand">
        <span className="tag">AVA</span>
        <h1>Dashboard</h1>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <BillingBadge activeSiteUrl={activeSiteUrl} activated={activated} />
        <div className="status-pill">
          <span className={`status-dot ${dotClass}`} />
          {statusText}
        </div>
      </div>
    </div>
  );
}
