import { useMemo, useState } from "react";
import type { TrackEventData, OverviewAnalytics, InsightSnapshot, CROFinding, InsightRecommendation } from "../types";
import { fmtTime, fmtNum, fmtPct } from "../lib/format";

interface Props {
  events: TrackEventData[];
  selectedSession: string | null;
  overview: OverviewAnalytics | null;
  trafficData: any[] | null;
  deviceData: any[] | null;
  funnelData: any[] | null;
  flowData: any[] | null;
  pageStatsData: any[] | null;
  clickPoints: Array<{ xPct: number; yPct: number; pageUrl: string }> | null;
  insightsSnapshot: InsightSnapshot | null;
  croFindings: CROFinding[] | null;
}

/** Parse raw_signals JSON and build a human-readable one-liner. */
function describeEvent(e: TrackEventData): string {
  const evtType = e.eventType || e.event_type || "unknown";
  let signals: Record<string, any> = {};
  try {
    signals = typeof e.rawSignals === "string" ? JSON.parse(e.rawSignals) : e.rawSignals ?? {};
  } catch {
    // ignore
  }

  const name = signals.product_name;
  const price = signals.product_price;
  const cat = signals.product_category || signals.category;

  switch (evtType) {
    case "page_view":
      return `Visited ${signals.page_title || "page"}`;
    case "product_click":
      return name ? `Clicked ${name}${price ? ` (${price})` : ""}` : "Clicked product";
    case "product_detail_view":
      return name ? `Viewing ${name}${price ? ` — ${price}` : ""}` : "Opened product details";
    case "product_detail_close": {
      const dur = signals.view_duration_ms;
      const durText = dur ? ` after ${dur >= 60000 ? Math.round(dur / 60000) + "m" : Math.round(dur / 1000) + "s"} of viewing` : "";
      return name ? `Closed ${name}${durText}` : "Closed product details";
    }
    case "add_to_cart":
      return name
        ? `${name}${price ? ` priced at ${price}` : ""} added to cart — Quantity ${signals.quantity || 1}`
        : "Added item to cart";
    case "quick_add":
      return name ? `Quick-added ${name}` : `Quick-added ${signals.product_id || "item"}`;
    case "quantity_change":
      return `Product quantity ${signals.direction === "increase" ? "increased" : "decreased"} to ${signals.current_qty}${name ? ` for ${name}` : ""}`;
    case "category_browse":
      return `Browsing ${cat || signals.category || "category"}`;
    case "nav_click":
      return `Nav → ${signals.link_text || "link"}`;
    case "color_select":
      return `Selected color: ${signals.color}${name ? ` on ${name}` : ""}`;
    case "size_select":
      return `Selected size: ${signals.size}${name ? ` on ${name}` : ""}`;
    case "tab_view":
      return `Viewing ${signals.tab_name || "tab"}${name ? ` for ${name}` : ""}`;
    case "description_toggle":
      return signals.action === "expanded"
        ? `Read More clicked — ${name || "product"} description expanded`
        : `Show Less clicked — ${name || "product"} description collapsed`;
    case "wishlist_add":
      return `${name || "Product"}${price ? ` — ${price}` : ""} added to wishlist`;
    case "wishlist_remove":
      return `${name || "Product"}${price ? ` — ${price}` : ""} removed from wishlist`;
    case "size_guide_open":
      return `Size guide opened${name ? ` for ${name}` : ""}`;
    case "size_guide_close": {
      const secs = Math.round((signals.view_duration_ms || 0) / 1000);
      return `Size guide closed after ${secs}s of viewing`;
    }
    case "search_query":
      return `Searched: "${signals.query}"`;
    case "scroll_depth":
      return `Scrolled to ${signals.depth_pct}%`;
    case "scroll_without_click":
      return `Scrolled full page without clicking`;
    case "rage_click":
      return `Rage-clicked ${signals.target_text || signals.target_element || "element"} (${signals.click_count}x)`;
    case "hover_add_to_cart":
      return `Hovering Add to Cart${name ? ` on ${name}` : ""} (${Math.round((signals.hover_duration_ms || 3000) / 1000)}s)`;
    case "copy_price":
      return `Copied price: ${signals.copied_text}`;
    case "copy_text":
      return `Copied: "${signals.copied_text}"`;
    case "exit_intent_with_cart":
      return `Exit intent — cart $${signals.cart_value}`;
    case "idle_with_cart":
      return `Idle 5min with ${signals.cart_items} item(s) in cart`;
    case "tab_return":
      return `Returned after ${Math.round((signals.away_duration_ms || 0) / 60000)}min away`;
    case "cart_icon_click":
      return `Opened cart (${signals.cart_count} items)`;
    case "cart_view": {
      const cnt = signals.cart_count;
      const label = cnt === "1" || cnt === 1 ? "1 item" : `${cnt} items`;
      return `Viewing Cart with ${label} — Total ${signals.cart_total || "$0.00"}`;
    }
    case "wishlist_view": {
      const wc = signals.item_count ?? 0;
      return `Checking Wishlist with ${wc} ${wc === 1 ? "item" : "items"}`;
    }
    case "filter_applied": {
      const ftype = signals.filter_type;
      const flabel = signals.filter_label || signals.filter_value;
      if (ftype === "color") return `Filtered by color - ${flabel}`;
      if (ftype === "size") return `Filtered by size - ${flabel}`;
      return `Filtered by price - ${flabel}`;
    }
    case "sort_change":
      return `Sorted by: ${signals.sort_name || signals.sort_value}`;
    case "cart_opened": {
      const ic = signals.item_count ?? 0;
      return `Viewing cart — ${ic} ${ic === 1 ? "item" : "items"} totaling $${(signals.total_value || 0).toFixed ? (signals.total_value || 0).toFixed(2) : signals.total_value}`;
    }
    case "cart_item_removed":
      return `${signals.product_name || "Item"}${signals.product_price ? ` — $${Number(signals.product_price).toFixed(2)}` : ""} removed from cart`;
    case "checkout_started": {
      const ic2 = signals.items?.length ?? 0;
      return `Checkout started — ${ic2} ${ic2 === 1 ? "item" : "items"}, total $${(signals.total_value || 0).toFixed(2)}`;
    }
    case "form_field_change":
      return `Filled ${signals.field_name || "field"} in ${signals.form_type || "checkout"} form`;
    case "checkout_idle":
      return `Idle on checkout — paused on ${signals.field_name || "field"} (20s)`;
    case "shipping_method_viewed":
      return `Viewing shipping options`;
    case "shipping_option_selected":
      return `Selected ${signals.option_name || "shipping"} (${signals.delivery_time || ""}) — $${(signals.cost || 0).toFixed(2)}`;
    case "payment_method_viewed":
      return `Viewing payment methods`;
    case "payment_method_selected":
      return `Selected ${signals.method || "payment method"}`;
    case "delivery_slot_selected":
      return `Delivery slot: ${signals.slot_name || "selected"} (${signals.time_range || ""})`;
    case "order_placed":
      return `Order #${signals.order_id || "placed"} — ${signals.item_count || 0} items, $${(signals.total_value || 0).toFixed(2)}`;
    case "form_validation_error":
      return `Form error on ${signals.field_name || "field"} (${signals.error_count} errors)`;
    case "payment_hesitation":
      return `Hesitated on ${signals.field_name} (${Math.round((signals.hesitation_ms || 0) / 1000)}s)`;
    case "click":
      if (name) return `Clicked ${signals.text || "element"} on ${name}`;
      return `Clicked: ${signals.text || signals.element || "element"}`;
    default:
      if (name) return `${evtType} — ${name}`;
      return evtType.replace(/_/g, " ");
  }
}

function getCategoryColor(cat: string): string {
  switch (cat) {
    case "product": return "#e89b3b";
    case "cart": return "#e05d5d";
    case "navigation": return "#5b9bd5";
    case "search": return "#9b59b6";
    case "engagement": return "#6bc9a0";
    case "technical": return "#e74c3c";
    case "checkout": return "#f39c12";
    default: return "#95a5a6";
  }
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

/** Simple SVG heatmap dot renderer */
function HeatmapCanvas({ points }: { points: Array<{ xPct: number; yPct: number }> }) {
  if (points.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 16 }}>
        <p className="muted" style={{ fontSize: 11 }}>No click data yet — coordinates captured on next visit</p>
      </div>
    );
  }
  return (
    <svg
      viewBox="0 0 100 60"
      style={{ width: "100%", height: 160, background: "rgba(8,26,34,0.4)", borderRadius: 4, display: "block" }}
    >
      {points.slice(0, 500).map((p, i) => (
        <circle
          key={i}
          cx={p.xPct * 100}
          cy={p.yPct * 60}
          r={1.5}
          fill="rgba(232,155,59,0.35)"
        />
      ))}
    </svg>
  );
}

/** Collapsible analytics section */
function AnalyticsSection({ title, children, defaultOpen = true }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div
        className="card-head"
        style={{ cursor: "pointer", userSelect: "none" }}
        onClick={() => setOpen(o => !o)}
      >
        <span>{title}</span>
        <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10, opacity: 0.6 }}>
          {open ? "▲ collapse" : "▼ expand"}
        </span>
      </div>
      {open && <div className="card-body">{children}</div>}
    </div>
  );
}

function confidenceColor(c: InsightRecommendation["confidence"]): string {
  return c === "high" ? "var(--accent)" : c === "medium" ? "var(--tier-nudge)" : "var(--muted)";
}

export function TrackTab({ events, selectedSession, overview, trafficData, deviceData, funnelData, flowData, pageStatsData, clickPoints, insightsSnapshot, croFindings }: Props) {
  const filtered = useMemo(
    () => selectedSession ? events.filter((e) => e.session_id === selectedSession) : events,
    [events, selectedSession]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of filtered) {
      counts[e.category] = (counts[e.category] ?? 0) + 1;
    }
    return counts;
  }, [filtered]);

  const frictionCount = useMemo(
    () => filtered.filter((e) => e.frictionId || e.friction_id).length,
    [filtered]
  );

  const maxTraffic = trafficData ? Math.max(...trafficData.map((d: any) => d.sessions), 1) : 1;
  const maxDevice = deviceData ? Math.max(...deviceData.map((d: any) => d.sessions), 1) : 1;
  const firstFunnelCount = funnelData?.[0]?.sessionCount ?? 1;

  const hasAnalytics = !!(trafficData || deviceData || funnelData || flowData || pageStatsData || (clickPoints !== null));

  return (
    <div className="tab-content">

      {/* ═══════════════════════════════════════════════════════════
          INSIGHTS — Weekly merchant digest + AI recommendations
          First section — most actionable view for merchants.
      ═══════════════════════════════════════════════════════════ */}
      {(insightsSnapshot || croFindings) && (
        <div style={{ marginBottom: 12 }}>
          {insightsSnapshot && (
            <AnalyticsSection title="AVA Insights — Weekly Summary" defaultOpen={true}>
              {/* Digest row */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {[
                  { label: "Sessions", value: fmtNum(insightsSnapshot.sessionsAnalyzed) },
                  { label: "Frictions Caught", value: fmtNum(insightsSnapshot.frictionsCaught) },
                  { label: "Attributed Revenue", value: `$${insightsSnapshot.attributedRevenue.toFixed(2)}` },
                  ...(insightsSnapshot.wowDeltaPct != null
                    ? [{ label: "WoW Sessions", value: `${insightsSnapshot.wowDeltaPct >= 0 ? "+" : ""}${insightsSnapshot.wowDeltaPct.toFixed(1)}%` }]
                    : []),
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "rgba(8,26,34,0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, padding: "6px 12px", flex: "1 1 120px" }}>
                    <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>{value}</div>
                  </div>
                ))}
              </div>
              {/* Top friction types */}
              {insightsSnapshot.topFrictionTypes.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>Top Friction Types This Week</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {insightsSnapshot.topFrictionTypes.map((fid) => (
                      <span key={fid} style={{ fontSize: 10, padding: "2px 8px", background: "rgba(232,155,59,0.12)", color: "var(--accent)", border: "1px solid rgba(232,155,59,0.3)", borderRadius: 3, fontWeight: 700 }}>
                        {fid}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* AI Recommendations */}
              {insightsSnapshot.recommendations.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", marginBottom: 8 }}>AVA Recommendations</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {insightsSnapshot.recommendations.map((rec, i) => (
                      <div key={i} style={{ padding: "8px 10px", background: "rgba(8,26,34,0.4)", borderLeft: `3px solid ${confidenceColor(rec.confidence)}`, borderRadius: "0 4px 4px 0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: "var(--info)", fontWeight: 700 }}>{rec.frictionId} — {rec.page}</span>
                          <span style={{ fontSize: 9, color: confidenceColor(rec.confidence), textTransform: "capitalize" }}>
                            {rec.confidence} confidence ({fmtNum(rec.sampleSize)})
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.4 }}>{rec.fixText}</div>
                        <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{rec.impactEstimate}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </AnalyticsSection>
          )}

          {croFindings && croFindings.length > 0 && (
            <AnalyticsSection title={`CRO Analysis — ${croFindings.length} Structural Issues`} defaultOpen={false}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {croFindings.map((finding, i) => (
                  <div key={i} style={{ padding: "8px 10px", background: "rgba(8,26,34,0.4)", borderRadius: 4, borderLeft: "3px solid rgba(255,255,255,0.1)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: "var(--warn)", fontWeight: 700 }}>{finding.frictionId} — {finding.page}</span>
                      <span style={{ fontSize: 9, color: "var(--muted)" }}>{fmtNum(finding.eventCount)} events · {fmtNum(finding.sessionsImpacted)} sessions · sev {finding.avgSeverity}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.4 }}>{finding.suggestion}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 8 }}>AVA suggestion — not auto-applied. Review before making site changes.</div>
            </AnalyticsSection>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          ROW 1 — KPI HERO STRIP
          Four numbers a business owner reads in 3 seconds.
      ═══════════════════════════════════════════════════════════ */}
      <div className="grid-4" style={{ marginBottom: 12 }}>
        <div className="metric-box">
          <div className="label">Active Sessions</div>
          <div className="value accent">{fmtNum(overview?.activeSessions ?? 0)}</div>
          <div className="sub">live right now</div>
        </div>
        <div className="metric-box">
          <div className="label">Events Captured</div>
          <div className="value">{fmtNum(overview?.totalEvents ?? filtered.length)}</div>
          <div className="sub">since activation</div>
        </div>
        <div className="metric-box">
          <div className="label">Bounce Rate</div>
          <div className="value warn">
            {overview?.bounceRate !== undefined ? fmtPct(overview.bounceRate) : "—"}
          </div>
          <div className="sub">single-page exits</div>
        </div>
        <div className="metric-box">
          <div className="label">Avg Session</div>
          <div className="value">
            {overview?.avgSessionDurationMs ? fmtDuration(overview.avgSessionDurationMs) : "—"}
          </div>
          <div className="sub">{overview?.avgPageViewsPerSession ? `${overview.avgPageViewsPerSession} pages / visit` : "duration"}</div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ROW 2 — LIVE EVENT FEED  (primary content — what's happening NOW)
          This is AVA's live pulse — better than any session recording tool.
      ═══════════════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <span>
            Live Event Feed
            <span style={{
              marginLeft: 8,
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--accent)",
              boxShadow: "0 0 6px var(--accent)",
              verticalAlign: "middle",
            }} />
          </span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {Object.keys(categoryCounts).length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {Object.entries(categoryCounts)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([cat, count]) => {
                    const color = getCategoryColor(cat);
                    return (
                      <span key={cat} style={{
                        fontSize: 9,
                        padding: "1px 6px",
                        background: color + "18",
                        color,
                        border: `1px solid ${color}33`,
                        borderRadius: 3,
                        fontWeight: 700,
                        textTransform: "uppercase",
                      }}>
                        {cat} {count}
                      </span>
                    );
                  })}
              </div>
            )}
            <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10, opacity: 0.55 }}>
              {filtered.length} events
              {frictionCount > 0 && (
                <span style={{ marginLeft: 6, color: "var(--warn)" }}>· {frictionCount} friction signals</span>
              )}
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📡</div>
            <p>Waiting for events...</p>
            <p className="muted" style={{ fontSize: 11 }}>
              Events appear here as shoppers interact with your store in real time
            </p>
          </div>
        ) : (
          <div className="scroll-list">
            {filtered.map((e, i) => {
              const fid = e.frictionId || e.friction_id;
              const desc = describeEvent(e);
              const catColor = getCategoryColor(e.category);
              return (
                <div className="event-row" key={e.id ?? i}>
                  <span className="time">{fmtTime(e.timestamp)}</span>
                  <span
                    className="cat"
                    style={{
                      backgroundColor: catColor + "22",
                      color: catColor,
                      border: `1px solid ${catColor}44`,
                      borderRadius: 3,
                      padding: "1px 6px",
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    {e.category}
                  </span>
                  <span className="desc" style={{ flex: 1 }}>{desc}</span>
                  {fid && <span className="friction-tag">{fid}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ROW 3 — BEHAVIOUR ANALYTICS
          Everything GA4 + Hotjar shows you — in one place.
          Each section is independently collapsible.
      ═══════════════════════════════════════════════════════════ */}
      {hasAnalytics && (
        <div>
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: 8,
            paddingLeft: 2,
          }}>
            Behaviour Analytics
          </div>

          {/* Traffic Sources + Devices — side by side */}
          {(trafficData || deviceData) && (
            <div className="grid-2" style={{ marginBottom: 12 }}>
              {trafficData && (
                <AnalyticsSection title="Traffic Sources" defaultOpen={true}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {trafficData.map((row: any) => (
                      <div key={row.referrerType} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ minWidth: 64, fontSize: 10, textTransform: "capitalize", color: "var(--info)" }}>
                          {row.referrerType}
                        </span>
                        <div style={{ flex: 1, height: 6, background: "rgba(8,26,34,0.6)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${(row.sessions / maxTraffic) * 100}%`, height: "100%", background: "var(--info)", borderRadius: 3, transition: "width 400ms ease" }} />
                        </div>
                        <span className="mono muted" style={{ fontSize: 10, minWidth: 32, textAlign: "right" }}>
                          {fmtNum(row.sessions)}
                        </span>
                        <span style={{ fontSize: 9, color: "var(--accent)", minWidth: 36, textAlign: "right" }}>
                          {fmtPct(row.conversionRate)}
                        </span>
                      </div>
                    ))}
                  </div>
                </AnalyticsSection>
              )}
              {deviceData && (
                <AnalyticsSection title="Devices" defaultOpen={true}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {deviceData.map((row: any) => (
                      <div key={row.deviceType} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ minWidth: 64, fontSize: 10, textTransform: "capitalize", color: "var(--tier-nudge)" }}>
                          {row.deviceType}
                        </span>
                        <div style={{ flex: 1, height: 6, background: "rgba(8,26,34,0.6)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${(row.sessions / maxDevice) * 100}%`, height: "100%", background: "var(--tier-nudge)", borderRadius: 3, transition: "width 400ms ease" }} />
                        </div>
                        <span className="mono muted" style={{ fontSize: 10, minWidth: 32, textAlign: "right" }}>
                          {fmtNum(row.sessions)}
                        </span>
                        <span style={{ fontSize: 9, color: "var(--accent)", minWidth: 36, textAlign: "right" }}>
                          {fmtPct(row.conversionRate)}
                        </span>
                      </div>
                    ))}
                  </div>
                </AnalyticsSection>
              )}
            </div>
          )}

          {/* Conversion Funnel + Page Flow — side by side */}
          {(funnelData || flowData) && (
            <div className="grid-2" style={{ marginBottom: 12 }}>
              {funnelData && (
                <AnalyticsSection title="Conversion Funnel" defaultOpen={true}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {funnelData.map((step: any, i: number) => {
                      const pct = firstFunnelCount > 0 ? (step.sessionCount / firstFunnelCount) * 100 : 0;
                      const dropOff = i > 0 ? ((funnelData[i - 1].sessionCount - step.sessionCount) / Math.max(1, funnelData[i - 1].sessionCount) * 100) : 0;
                      return (
                        <div key={step.step}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ fontSize: 10, textTransform: "uppercase", color: "var(--info)" }}>{step.step}</span>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ fontSize: 10, color: "var(--muted)" }}>{fmtNum(step.sessionCount)}</span>
                              {i > 0 && dropOff > 0 && (
                                <span style={{ fontSize: 9, color: "var(--warn)" }}>−{Math.round(dropOff)}% drop</span>
                              )}
                            </div>
                          </div>
                          <div style={{ height: 6, background: "rgba(8,26,34,0.6)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: i === 0 ? "var(--accent)" : pct < 30 ? "var(--warn)" : "var(--tier-nudge)", borderRadius: 3, transition: "width 400ms ease" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AnalyticsSection>
              )}
              {flowData && (
                <AnalyticsSection title="Page Flow — Top Paths" defaultOpen={true}>
                  <div className="scroll-list" style={{ maxHeight: 180 }}>
                    {flowData.slice(0, 10).map((row: any, i: number) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <span style={{ fontSize: 9, color: "var(--muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.from || "—"} → {row.to}
                        </span>
                        <span className="mono" style={{ fontSize: 10, color: "var(--accent)", flexShrink: 0 }}>{fmtNum(row.count)}×</span>
                      </div>
                    ))}
                  </div>
                </AnalyticsSection>
              )}
            </div>
          )}

          {/* Top Pages — collapsed by default, revealed on demand */}
          {pageStatsData && pageStatsData.length > 0 && (
            <AnalyticsSection title={`Top Pages — Engagement`} defaultOpen={false}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--muted)", fontWeight: 600 }}>Page</th>
                      <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--muted)", fontWeight: 600 }}>Views</th>
                      <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--muted)", fontWeight: 600 }}>Avg Time</th>
                      <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--muted)", fontWeight: 600 }}>Avg Scroll</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageStatsData.slice(0, 10).map((row: any, i: number) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "4px 8px", color: "var(--text)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.pageUrl || row.pageType}
                        </td>
                        <td style={{ padding: "4px 8px", textAlign: "right", color: "var(--info)" }}>{fmtNum(row.views)}</td>
                        <td style={{ padding: "4px 8px", textAlign: "right", color: "var(--muted)" }}>
                          {row.avgTimeOnPageMs ? fmtDuration(row.avgTimeOnPageMs) : "—"}
                        </td>
                        <td style={{ padding: "4px 8px", textAlign: "right", color: "var(--muted)" }}>
                          {row.avgScrollDepthPct != null ? `${row.avgScrollDepthPct}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AnalyticsSection>
          )}

          {/* Click Heatmap — collapsed by default */}
          {clickPoints !== null && (
            <AnalyticsSection title={`Click Heatmap — ${fmtNum(clickPoints.length)} clicks captured`} defaultOpen={false}>
              <HeatmapCanvas points={clickPoints} />
            </AnalyticsSection>
          )}
        </div>
      )}
    </div>
  );
}
