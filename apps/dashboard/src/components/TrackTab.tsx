import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrackEvent {
  id: string;
  session_id: string;
  category: string;
  eventType: string;
  frictionId?: string;
  friction_id?: string;
  pageType?: string;
  pageUrl?: string;
  rawSignals?: string;
  timestamp: number;
}

interface OverviewData {
  activeSessions?: number;
  totalEvents?: number;
  bounceRate?: number;
  avgSessionDuration?: number;
  totalAttributedRevenue?: number;
  interventionEfficiency?: {
    fired: number;
    converted: number;
    conversionRate: number;
    dismissalRate: number;
  };
  tierDistribution?: Record<string, number>;
  totalEvaluations?: number;
}

interface TrafficBreakdown { referrerType: string; sessions: number; }
interface DeviceBreakdown  { device: string; sessions: number; }
interface FunnelStep       { name: string; sessionCount: number; dropOff?: number; }
interface PageFlow         { from: string; to: string; count: number; }
interface PageStat         { url: string; views: number; avgTime?: number; bounceRate?: number; }
interface ClickPoint       { x: number; y: number; count: number; pageType?: string; }
interface FrictionItem     { frictionId: string; category: string; count: number; severity?: string; confidence?: string; }
interface FrictionAnalytics{ byFriction: FrictionItem[]; }
interface RevenueAttribution {
  totalAttributedRevenue: number;
  interventionsFired: number;
  sampleSize?: number;
  sessionsImpacted?: number;
}
interface InsightsSnapshot {
  sessionsAnalyzed: number;
  frictionsCaught: number;
  attributedRevenue: number;
  wowDeltaPct?: number;
  topFrictionTypes: string[];
  recommendations: Array<{
    frictionId: string;
    page: string;
    confidence: string;
    fixText: string;
    impactEstimate: string;
    sampleSize: number;
  }>;
}
interface CROFinding {
  frictionId: string;
  page: string;
  eventCount: number;
  sessionsImpacted: number;
  avgSeverity: number | null;
  suggestion: string;
}

interface TrackTabProps {
  events: TrackEvent[];
  selectedSession: string | null;
  overview: OverviewData | null;
  trafficData: TrafficBreakdown[] | null;
  deviceData: DeviceBreakdown[] | null;
  funnelData: FunnelStep[] | null;
  flowData: PageFlow[] | null;
  pageStatsData: PageStat[] | null;
  clickPoints: ClickPoint[] | null;
  insightsSnapshot: InsightsSnapshot | null;
  croFindings: CROFinding[] | null;
  frictionAnalytics: FrictionAnalytics | null;
  revenueAttribution: RevenueAttribution | null;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(n: number | undefined | null) { return (n ?? 0).toLocaleString('en-US'); }
function pct(n: number | undefined | null) { return n != null ? `${(n * 100).toFixed(1)}%` : '—'; }

function categoryColor(cat: string) {
  const map: Record<string, string> = {
    product: '#e89b3b', cart: '#e05d5d', navigation: '#5b9bd5',
    search: '#9b59b6', engagement: '#6bc9a0', technical: '#e74c3c',
    checkout: '#f39c12', friction: '#ff9d65',
  };
  return map[cat] ?? '#95a5a6';
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function parseSig(rawSignals?: string): Record<string, unknown> {
  if (!rawSignals) return {};
  try { return JSON.parse(rawSignals) as Record<string, unknown>; } catch { return {}; }
}

function sigStr(sig: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) { if (sig[k] != null) return String(sig[k]); }
  return '';
}

function sigNum(sig: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) { if (sig[k] != null) { const n = Number(sig[k]); if (!isNaN(n)) return n; } }
  return 0;
}

function formatMs(ms: number): string {
  if (ms <= 0) return '';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function productLine(sig: Record<string, unknown>): string {
  const name = sigStr(sig, 'product_name', 'name');
  if (!name) return '';
  const rawPrice = sig.product_price ?? sig.price;
  if (rawPrice != null) {
    const num = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ''));
    if (!isNaN(num) && num > 0) return `${name} priced $${num.toFixed(2)}`;
  }
  return name;
}

function pagePath(url?: string): string {
  if (!url) return '';
  try {
    const p = new URL(url).pathname;
    if (!p || p === '/') return 'Home Page';
    return p.replace(/^\//, '').replace(/\//g, ' › ').replace(/-/g, ' ');
  } catch { return url; }
}

function describeEvent(e: TrackEvent): string {
  const sig = parseSig(e.rawSignals);
  const product = productLine(sig);
  const pName = sigStr(sig, 'product_name', 'name');

  switch (e.eventType) {

    // ── Navigation ───────────────────────────────────────────────
    case 'page_view': {
      const dest = pagePath(e.pageUrl || sigStr(sig, 'page_url'));
      return dest ? `Navigating to ${dest}` : 'Page view';
    }
    case 'page_unload': {
      const ms = sigNum(sig, 'time_on_page_ms');
      return ms > 0 ? `Left page after ${formatMs(ms)}` : 'Left page';
    }
    case 'quick_bounce':
      return 'Bounced quickly — left within 10 seconds';
    case 'rapid_back_navigation':
      return `Rapid back-button use — ${sigNum(sig, 'back_count')} presses`;
    case 'exit_intent': {
      const ms = sigNum(sig, 'time_on_page_ms');
      return ms > 0 ? `Exit intent — cursor left viewport after ${formatMs(ms)}` : 'Exit intent detected';
    }
    case 'nav_click': {
      const text = sigStr(sig, 'link_text');
      return text ? `Clicked navigation link: ${text}` : 'Navigation click';
    }
    case 'category_browse': {
      const cat = sigStr(sig, 'category');
      return cat ? `Browsing category: ${cat}` : 'Category browsed';
    }
    case 'filter_applied': {
      const label = sigStr(sig, 'filter_label', 'filter_value');
      return label ? `Filter applied: ${label}` : 'Filter applied';
    }
    case 'sort_change': {
      const name = sigStr(sig, 'sort_name', 'sort_value');
      return name ? `Sorted products by: ${name}` : 'Sort changed';
    }
    case 'tab_return': {
      const away = sigNum(sig, 'away_duration_ms');
      const mins = Math.round(away / 60000);
      return mins >= 1 ? `Returned to tab after ${mins} min${mins !== 1 ? 's' : ''} away` : 'Returned to tab';
    }
    case 'scroll_back_to_top': {
      const peak = sigNum(sig, 'peak_depth_pct');
      return `Scrolled back to top after reaching ${peak}% of page`;
    }
    case 'scroll_back_after_cart': {
      const peak = sigNum(sig, 'peak_depth_pct');
      return `Scrolled back up after adding to cart (was at ${peak}%)`;
    }
    case 'full_scroll_no_action':
      return 'Scrolled entire page without interacting';
    case 'rapid_scroll':
      return `Rapid scrolling detected (${Math.round(sigNum(sig, 'scroll_rate_px_sec'))} px/s)`;
    case 'page_navigation': {
      const page = sigStr(sig, 'page');
      return page ? `Navigating to ${page} page` : 'Page navigation';
    }

    // ── Scroll ───────────────────────────────────────────────────
    case 'scroll_depth': {
      const depth = sigNum(sig, 'depth_pct', 'scroll_depth_pct');
      return `Scrolled ${depth}% of page`;
    }
    case 'scroll_milestone': {
      const depth = sigNum(sig, 'scroll_depth_pct');
      const ms = sigNum(sig, 'time_to_milestone_ms');
      return ms > 0
        ? `Scrolled ${depth}% of page (reached in ${formatMs(ms)})`
        : `Scrolled ${depth}% of page`;
    }

    // ── Product ──────────────────────────────────────────────────
    case 'product_detail_view':
    case 'product_viewed':
      return product ? `Opened product modal for ${product}` : 'Opened product modal';

    case 'product_detail_close':
    case 'product_modal_closed': {
      const ms = sigNum(sig, 'view_duration_ms', 'time_spent_ms');
      const who = product || pName;
      return who && ms > 0
        ? `Closed product modal for ${who} after ${formatMs(ms)}`
        : who ? `Closed product modal for ${who}` : 'Closed product modal';
    }

    case 'color_select': {
      const color = sigStr(sig, 'color', 'value');
      return color && product
        ? `Selected color ${color} for ${product}`
        : color ? `Color selected: ${color}` : 'Color selected';
    }

    case 'size_select': {
      const size = sigStr(sig, 'size', 'value');
      return size && product
        ? `Selected size ${size} for ${product}`
        : size ? `Size selected: ${size}` : 'Size selected';
    }

    case 'product_variant_changed': {
      const vType = sigStr(sig, 'variant_type');
      const vVal  = sigStr(sig, 'value');
      return vType && vVal && product
        ? `Changed ${vType} to ${vVal} for ${product}`
        : `Variant changed`;
    }

    case 'quantity_change': {
      const dir = sigStr(sig, 'direction');
      const qty = sigNum(sig, 'current_qty');
      const verb = dir === 'increase' ? 'Increased' : 'Decreased';
      return product
        ? `${verb} quantity to ${qty} for ${product}`
        : `${verb} quantity to ${qty}`;
    }

    case 'product_detail': {
      const action = sigStr(sig, 'action');
      const qty    = sigNum(sig, 'quantity', 'current_qty');
      if (action === 'quantity_increased') return product ? `Increased quantity to ${qty} for ${product}` : `Quantity increased to ${qty}`;
      if (action === 'quantity_decreased') return product ? `Decreased quantity to ${qty} for ${product}` : `Quantity decreased to ${qty}`;
      if (action) return product ? `${action.replace(/_/g, ' ')} — ${product}` : action.replace(/_/g, ' ');
      return 'Product interaction';
    }

    case 'cart_quantity_changed': {
      const prev = sigNum(sig, 'previous_quantity');
      const next = sigNum(sig, 'new_quantity');
      const verb = next > prev ? 'Increased' : 'Decreased';
      return product ? `${verb} quantity to ${next} for ${product}` : `${verb} quantity to ${next}`;
    }

    case 'description_toggle': {
      const action = sigStr(sig, 'action');
      return product
        ? `${action === 'expanded' ? 'Expanded' : 'Collapsed'} product description for ${product}`
        : `Product description ${action || 'toggled'}`;
    }

    case 'product_description_expanded':
      return product ? `Expanded product details for ${product}` : 'Expanded product details';

    case 'tab_view': {
      const tab = sigStr(sig, 'tab_name');
      if (tab === 'Reviews') return product ? `Checking reviews for ${product}` : 'Viewing product reviews';
      if (tab === 'Returns') return product ? `Checking return policy for ${product}` : 'Viewing return policy';
      if (tab === 'Details') return product ? `Checking details for ${product}` : 'Viewing product details';
      return tab ? `Viewing ${tab} tab` : 'Tab viewed';
    }

    case 'product_reviews_viewed':
      return product ? `Checking reviews for ${product}` : 'Viewed product reviews';

    case 'product_return_policy_viewed':
      return product ? `Checking return policy for ${product}` : 'Viewed return policy';

    case 'wishlist_add':
    case 'wishlist_item_added': {
      const color = sigStr(sig, 'color');
      const detail = color && product ? `${product} (${color})` : product;
      return detail ? `Added ${detail} to wishlist` : 'Added item to wishlist';
    }

    case 'wishlist_remove':
      return product ? `Removed ${product} from wishlist` : 'Removed item from wishlist';

    case 'wishlist_view': {
      const count = sigNum(sig, 'item_count');
      return `Opened wishlist — ${count} item${count !== 1 ? 's' : ''}`;
    }

    case 'size_guide_open':
      return product ? `Opened size guide for ${product}` : 'Opened size guide';

    case 'size_guide_close': {
      const secs = sigNum(sig, 'view_duration_s') || Math.round(sigNum(sig, 'view_duration_ms') / 1000);
      return secs > 0 ? `Closed size guide after ${secs}s of viewing` : 'Closed size guide';
    }

    case 'product_image_zoomed':
      return product ? `Zoomed product image for ${product}` : 'Product image zoomed';

    case 'suggested_product_hover':
      return product ? `Hovering on similar product: ${product}` : 'Hovering on similar products';

    case 'suggested_product_clicked':
      return product ? `Clicked similar product: ${product}` : 'Clicked similar product';

    // ── Cart ─────────────────────────────────────────────────────
    case 'add_to_cart':
    case 'cart_item_added': {
      const qty   = sigNum(sig, 'quantity') || 1;
      const color = sigStr(sig, 'color');
      const size  = sigStr(sig, 'size');
      const variant = [color, size].filter(Boolean).join(', ');
      if (product && variant) return `Added ${product} to cart — ${variant}${qty > 1 ? `, qty ${qty}` : ''}`;
      if (product) return `Added ${product} to cart${qty > 1 ? ` (qty ${qty})` : ''}`;
      return 'Added item to cart';
    }

    case 'quick_add':
      return product ? `Quick-added ${product} to cart` : 'Quick add to cart';

    case 'add_to_cart_click': {
      const text = sigStr(sig, 'button_text');
      return text ? `Clicked "${text}"` : 'Clicked add to cart';
    }

    case 'cart_view': {
      const count = sigStr(sig, 'cart_count');
      const total = sigStr(sig, 'cart_total');
      return count && total ? `Viewed cart — ${count} item${count !== '1' ? 's' : ''}, ${total}` : 'Viewed cart';
    }

    case 'cart_icon_click': {
      const count = sigStr(sig, 'cart_count');
      return count ? `Opened cart (${count} items)` : 'Opened cart';
    }

    case 'idle_with_cart': {
      const items = sigNum(sig, 'cart_item_count');
      const value = sigNum(sig, 'cart_value');
      return `Idle for 5 min with ${items} item${items !== 1 ? 's' : ''} in cart${value > 0 ? ` ($${value.toFixed(2)})` : ''}`;
    }

    case 'sticker_shock': {
      const prev = sigNum(sig, 'previous_value');
      const next = sigNum(sig, 'new_value');
      const pct  = sigNum(sig, 'increase_pct');
      return `Price jumped from $${prev.toFixed(2)} to $${next.toFixed(2)} (+${pct}%) — sticker shock`;
    }

    case 'cart_updated':
    case 'cart_item_added_api':
      return `Cart changed — ${sigNum(sig, 'cart_item_count')} items`;

    // ── Engagement ───────────────────────────────────────────────
    case 'click': {
      const text = sigStr(sig, 'target_text', 'text');
      return text ? `Clicked "${text.slice(0, 48)}"` : 'Click';
    }

    case 'dead_click':
      return `Dead click — non-interactive ${(sigStr(sig, 'target_tag') || 'element').toLowerCase()}`;

    case 'rage_click': {
      const count = sigNum(sig, 'click_count');
      return `Rage-clicked ${count} times on ${(sigStr(sig, 'target_tag') || 'element').toLowerCase()}`;
    }

    case 'search_query': {
      const q = sigStr(sig, 'query');
      return q ? `Searched for "${q}"` : 'Search performed';
    }

    case 'hover_intent':
      return product ? `Hover intent on ${product}` : 'Hover intent detected';

    case 'atc_hover_hesitation': {
      const ms = sigNum(sig, 'hover_duration_ms');
      return `Hovering over Add to Cart button for ${Math.round(ms / 1000)}s without clicking`;
    }

    case 'product_image_hover':
      return product ? `Prolonged hover on product image for ${product}` : 'Prolonged product image hover';

    case 'hover': {
      const el = sigStr(sig, 'element');
      const dur = sigStr(sig, 'duration');
      if (el === 'price' && dur === 'long') return product
        ? `Staring at price for ${product} — long hover`
        : 'Long hover on price element';
      return product ? `Hovering on ${el || 'element'} for ${product}` : 'Hover detected';
    }

    // ── Sort / Filter ─────────────────────────────────────────────
    case 'sort_changed': {
      const name = sigStr(sig, 'sort_name', 'sort_type');
      return name ? `Sorted products by: ${name}` : 'Sort applied';
    }

    // ── Search ────────────────────────────────────────────────────
    case 'search_query': {
      const q = sigStr(sig, 'query');
      const count = sigNum(sig, 'results_count');
      if (q && sig.results_count !== undefined) {
        return count === 0
          ? `Searched "${q}" — no results found`
          : `Searched "${q}" — ${count} result${count !== 1 ? 's' : ''}`;
      }
      return q ? `Searched for "${q}"` : 'Search performed';
    }

    case 'search_zero_results': {
      const q = sigStr(sig, 'query');
      return q ? `Searched "${q}" — no results found` : 'Search returned no results';
    }

    // ── Wishlist panel ────────────────────────────────────────────
    case 'wishlist_opened': {
      const count = sigNum(sig, 'item_count');
      return `Opened wishlist panel — ${count} item${count !== 1 ? 's' : ''}`;
    }
    case 'wishlist_closed':
      return 'Closed wishlist panel';

    // ── Profile ───────────────────────────────────────────────────
    case 'profile_viewed': {
      const email = sigStr(sig, 'user_email');
      return email ? `Viewed profile for ${email}` : 'Viewed profile';
    }

    // ── Checkout ──────────────────────────────────────────────────
    case 'checkout_started': {
      const total = sigStr(sig, 'total_value', 'cart_total');
      const items = sigNum(sig, 'item_count');
      if (total && items) return `Checkout started — ${items} item${items !== 1 ? 's' : ''}, ${total}`;
      return 'Checkout started';
    }

    case 'cart_opened': {
      const items = sigNum(sig, 'item_count');
      const total = sigStr(sig, 'total_value');
      return items ? `Opened cart — ${items} item${items !== 1 ? 's' : ''}${total ? `, $${Number(total).toFixed(2)}` : ''}` : 'Opened cart';
    }

    case 'cart_item_removed': {
      const name = sigStr(sig, 'product_name');
      const price = sigNum(sig, 'product_price');
      return name
        ? `Removed ${name}${price > 0 ? ` ($${price.toFixed(2)})` : ''} from cart`
        : 'Removed item from cart';
    }

    case 'checkout_error_injected': {
      const reason = sigStr(sig, 'reason');
      return reason === 'gateway_timeout'
        ? 'Checkout blocked — payment gateway timeout'
        : `Checkout error: ${reason || 'unknown'}`;
    }

    case 'form_field_change': {
      const field = sigStr(sig, 'field_name');
      return field ? `Filling checkout field: ${field.replace(/_/g, ' ')}` : 'Editing checkout form';
    }

    case 'checkout_idle': {
      const field = sigStr(sig, 'field_name');
      const ms = sigNum(sig, 'idle_duration_ms');
      return field
        ? `Idle for ${formatMs(ms)} on checkout field: ${field.replace(/_/g, ' ')}`
        : `Idle in checkout for ${formatMs(ms)}`;
    }

    case 'shipping_method_viewed':
      return 'Viewing shipping methods';

    case 'shipping_option_selected': {
      const method = sigStr(sig, 'method', 'option');
      return method ? `Selected shipping: ${method}` : 'Shipping option selected';
    }

    case 'payment_method_viewed':
      return 'Viewing payment methods';

    case 'payment_method_selected': {
      const method = sigStr(sig, 'method');
      return method ? `Selected payment method: ${method}` : 'Payment method selected';
    }

    case 'delivery_slot_selected': {
      const slot = sigStr(sig, 'slot', 'value');
      return slot ? `Selected delivery slot: ${slot}` : 'Delivery slot selected';
    }

    case 'order_placed': {
      const orderId = sigStr(sig, 'order_id');
      const total = sigNum(sig, 'total_value');
      const items = sigNum(sig, 'item_count');
      return orderId
        ? `Order placed — ${orderId}, ${items} item${items !== 1 ? 's' : ''}, $${total.toFixed(2)}`
        : 'Order placed';
    }

    case 'order_complete':
    case 'purchase_complete': {
      const total = sigNum(sig, 'total_value', 'cart_value');
      return total > 0 ? `Purchase completed — $${total.toFixed(2)}` : 'Purchase completed';
    }

    default: {
      // Graceful fallback: readable type + page path
      const type = (e.eventType ?? 'unknown').replace(/_/g, ' ');
      const path = pagePath(e.pageUrl);
      return path && path !== 'Home Page' ? `${type} — ${path}` : type;
    }
  }
}

function categoryLabel(cat: string) {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function confidenceColor(c: string) {
  return c === 'high' ? 'var(--accent)' : c === 'medium' ? 'var(--tier-nudge)' : 'var(--muted)';
}

// ─── Analytics Tab Types ───────────────────────────────────────────────────────

type AnalyticsTab = 'funnel' | 'audience' | 'friction' | 'revenue';

const ANALYTICS_TABS: { id: AnalyticsTab; label: string }[] = [
  { id: 'funnel',   label: 'Conversion Funnel' },
  { id: 'audience', label: 'Audience'           },
  { id: 'friction', label: 'Friction'           },
  { id: 'revenue',  label: 'Revenue & Insights' },
];

// ─── Analytics Panel Components ───────────────────────────────────────────────

function EmptySlate({ icon, message }: { icon: string; message: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: 160, color: 'var(--muted)', gap: 8,
    }}>
      <span style={{ fontSize: 28, opacity: 0.4 }}>{icon}</span>
      <span style={{ fontSize: 12 }}>{message}</span>
    </div>
  );
}

function FunnelPanel({
  funnelData, flowData, pageStatsData,
}: {
  funnelData: FunnelStep[] | null;
  flowData: PageFlow[] | null;
  pageStatsData: PageStat[] | null;
}) {
  const funnelBase = funnelData?.[0]?.sessionCount ?? 1;

  return (
    <div style={{ display: 'flex', gap: 20 }}>
      {/* Conversion Funnel */}
      <div style={{ flex: 2 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          Conversion Funnel
        </div>
        {(!funnelData || funnelData.length === 0) ? (
          <EmptySlate icon="📊" message="No funnel data yet" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {funnelData.map((step, i) => {
              const dropPct = i > 0
                ? 1 - step.sessionCount / (funnelData[i - 1]?.sessionCount ?? funnelBase)
                : 0;
              const barPct = (step.sessionCount / funnelBase) * 100;
              const isDropBad = dropPct > 0.4;
              return (
                <div key={step.name ?? i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 4, height: 28, borderRadius: 2,
                    background: i === 0 ? 'var(--accent)' : isDropBad ? 'var(--tier-escalate)' : 'var(--info)',
                    flexShrink: 0,
                  }} />
                  <span style={{ minWidth: 100, fontSize: 12, color: 'var(--text)', textTransform: 'capitalize' }}>
                    {(step.name ?? '—').replace(/_/g, ' ')}
                  </span>
                  <div style={{ flex: 1, height: 22, background: 'rgba(8,26,34,0.7)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      width: `${barPct}%`, height: '100%',
                      background: i === 0 ? 'rgba(53,211,161,0.3)' : isDropBad ? 'rgba(231,76,60,0.3)' : 'rgba(91,155,213,0.3)',
                      borderRadius: 3, transition: 'width 0.5s ease',
                    }} />
                    <div style={{
                      position: 'absolute', top: 0, left: 8, height: '100%',
                      display: 'flex', alignItems: 'center',
                      fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)',
                    }}>
                      {fmt(step.sessionCount)} sessions · {barPct.toFixed(0)}%
                    </div>
                  </div>
                  {i > 0 && dropPct > 0 && (
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10,
                      color: isDropBad ? 'var(--tier-escalate)' : 'var(--muted)',
                      minWidth: 48, textAlign: 'right',
                    }}>
                      −{pct(dropPct)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Top Pages */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          Top Pages
        </div>
        {(!pageStatsData || pageStatsData.length === 0) ? (
          <EmptySlate icon="📄" message="No page data yet" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {pageStatsData.slice(0, 7).map((p, i) => (
              <div key={p.url} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 0',
                borderBottom: i < Math.min(pageStatsData.length, 7) - 1 ? '1px solid rgba(26,61,74,0.4)' : 'none',
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)',
                  minWidth: 16, textAlign: 'right',
                }}>
                  {i + 1}
                </span>
                <span style={{
                  flex: 1, fontSize: 12, color: 'var(--text)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {p.url}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', flexShrink: 0 }}>
                  {fmt(p.views)}
                </span>
                {p.bounceRate !== undefined && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    color: p.bounceRate > 0.6 ? 'var(--warn)' : 'var(--muted)',
                    flexShrink: 0, minWidth: 36, textAlign: 'right',
                  }}>
                    {pct(p.bounceRate)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* User Paths */}
        {flowData && flowData.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              Top User Paths
            </div>
            {flowData.slice(0, 5).map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                padding: '5px 0', borderBottom: '1px solid rgba(26,61,74,0.3)',
              }}>
                <span style={{ color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.from}
                </span>
                <span style={{ color: 'var(--accent)', flexShrink: 0 }}>→</span>
                <span style={{ color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.to}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--info)', flexShrink: 0 }}>
                  {fmt(f.count)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AudiencePanel({
  trafficData, deviceData, clickPoints,
}: {
  trafficData: TrafficBreakdown[] | null;
  deviceData: DeviceBreakdown[] | null;
  clickPoints: ClickPoint[] | null;
}) {
  const maxTraffic = trafficData ? Math.max(...trafficData.map(d => d.sessions), 1) : 1;
  const maxDevice  = deviceData  ? Math.max(...deviceData.map(d => d.sessions), 1) : 1;

  const TRAFFIC_COLORS: Record<string, string> = {
    direct: '#35d3a1', organic: '#5b9bd5', referral: '#e89b3b',
    social: '#9b59b6', paid: '#e05d5d', email: '#f39c12',
  };

  // Click heatmap summary by page type
  const clickByPage = useMemo(() => {
    if (!clickPoints) return [];
    const acc: Record<string, number> = {};
    for (const p of clickPoints) {
      const key = p.pageType ?? 'other';
      acc[key] = (acc[key] ?? 0) + p.count;
    }
    return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [clickPoints]);

  return (
    <div style={{ display: 'flex', gap: 24 }}>
      {/* Traffic Sources */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          Traffic Sources
        </div>
        {(!trafficData || trafficData.length === 0) ? (
          <EmptySlate icon="🌐" message="No traffic data yet" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {trafficData.map(d => {
              const col = TRAFFIC_COLORS[d.referrerType] ?? '#95a5a6';
              const w = (d.sessions / maxTraffic) * 100;
              return (
                <div key={d.referrerType}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text)', textTransform: 'capitalize' }}>
                      {d.referrerType}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: col }}>
                      {fmt(d.sessions)}
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'rgba(8,26,34,0.7)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${w}%`, height: '100%', background: col, borderRadius: 3, transition: 'width 0.4s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Devices */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          Devices
        </div>
        {(!deviceData || deviceData.length === 0) ? (
          <EmptySlate icon="📱" message="No device data yet" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {deviceData.map(d => {
              const icon = d.device === 'desktop' ? '🖥' : d.device === 'mobile' ? '📱' : '📟';
              const w = (d.sessions / maxDevice) * 100;
              const total = deviceData.reduce((s, x) => s + x.sessions, 0);
              const share = total > 0 ? (d.sessions / total) * 100 : 0;
              return (
                <div key={d.device}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text)', textTransform: 'capitalize' }}>
                      {icon} {d.device}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>
                      {share.toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'rgba(8,26,34,0.7)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${w}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width 0.4s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Click Heatmap Summary */}
      {clickByPage.length > 0 && (
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
            Clicks by Page Type
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {clickByPage.map(([page, count]) => (
              <div key={page} style={{
                background: 'rgba(8,26,34,0.6)', borderRadius: 8,
                padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                  {fmt(count)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, textTransform: 'capitalize' }}>
                  {page}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FrictionPanel({
  frictionAnalytics, croFindings,
}: {
  frictionAnalytics: FrictionAnalytics | null;
  croFindings: CROFinding[] | null;
}) {
  const byFriction = frictionAnalytics?.byFriction ?? [];
  const maxCount = byFriction[0]?.count ?? 1;

  const SEVERITY_COLOR: Record<string, string> = {
    critical: 'var(--tier-escalate)', high: 'var(--warn)',
    medium: 'var(--tier-nudge)', low: 'var(--muted)',
  };

  return (
    <div style={{ display: 'flex', gap: 24 }}>
      {/* Friction Hotspots */}
      <div style={{ flex: 2 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          Friction Hotspots
        </div>
        {byFriction.length === 0 ? (
          <EmptySlate icon="✅" message="No friction detected yet — great sign!" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {byFriction.slice(0, 10).map(f => {
              const sev = (f.severity ?? 'low').toLowerCase();
              const col = SEVERITY_COLOR[sev] ?? 'var(--muted)';
              const w = (f.count / maxCount) * 100;
              return (
                <div key={f.frictionId} style={{
                  display: 'grid', gridTemplateColumns: '56px 80px 1fr 40px 48px',
                  gap: 10, alignItems: 'center', padding: '8px 12px',
                  background: 'rgba(8,26,34,0.5)', borderRadius: 6,
                  borderLeft: `3px solid ${col}55`,
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: col, fontWeight: 700 }}>
                    {f.frictionId}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {f.category}
                  </span>
                  <div style={{ height: 5, background: 'rgba(8,26,34,0.7)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${w}%`, height: '100%', background: col, borderRadius: 2, transition: 'width 0.4s' }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', textAlign: 'right' }}>
                    {fmt(f.count)}
                  </span>
                  {f.confidence && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: confidenceColor(f.confidence), textAlign: 'right' }}>
                      {f.confidence}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CRO Findings */}
      {croFindings && croFindings.length > 0 && (
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
            CRO Issues — {croFindings.length} found
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {croFindings.slice(0, 5).map((f, i) => (
              <div key={i} style={{
                padding: '10px 14px', background: 'rgba(8,26,34,0.5)',
                borderRadius: 6, borderLeft: '3px solid rgba(255,157,101,0.4)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--warn)', fontWeight: 700 }}>
                    {f.frictionId} — {f.page}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                    sev {(f.avgSeverity ?? 0).toFixed(0)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{f.suggestion}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                  {fmt(f.sessionsImpacted)} sessions · {fmt(f.eventCount)} events
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 8 }}>
            AVA suggestion — review before applying to site.
          </div>
        </div>
      )}
    </div>
  );
}

function RevenuePanel({
  revenueAttribution, insightsSnapshot,
}: {
  revenueAttribution: RevenueAttribution | null;
  insightsSnapshot: InsightsSnapshot | null;
}) {
  return (
    <div style={{ display: 'flex', gap: 24 }}>
      {/* Revenue Attribution */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          Revenue Attribution
        </div>
        {!revenueAttribution ? (
          <EmptySlate icon="💰" message="Revenue data loading…" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              background: 'rgba(8,26,34,0.6)', borderRadius: 10,
              padding: '18px 20px', border: '1px solid rgba(53,211,161,0.15)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Total Attributed Revenue
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>
                ${(revenueAttribution.totalAttributedRevenue ?? 0).toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                via AVA interventions
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Interventions', value: fmt(revenueAttribution.interventionsFired ?? 0) },
                { label: 'Sessions Impacted', value: fmt(revenueAttribution.sessionsImpacted ?? 0) },
                { label: 'Sample Size', value: fmt(revenueAttribution.sampleSize ?? 0) },
              ].map(m => (
                <div key={m.label} style={{
                  background: 'rgba(8,26,34,0.5)', borderRadius: 8,
                  padding: '12px 14px', border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AVA Insights */}
      <div style={{ flex: 2 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          AVA Insights — Weekly Summary
        </div>
        {!insightsSnapshot ? (
          <EmptySlate icon="🧠" message="Insights generated weekly — check back after more sessions" />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Sessions', value: fmt(insightsSnapshot.sessionsAnalyzed ?? 0), color: 'var(--text)' },
                { label: 'Frictions Caught', value: fmt(insightsSnapshot.frictionsCaught ?? 0), color: 'var(--warn)' },
                { label: 'Revenue', value: `$${(insightsSnapshot.attributedRevenue ?? 0).toFixed(2)}`, color: 'var(--accent)' },
                ...(insightsSnapshot.wowDeltaPct != null ? [{
                  label: 'WoW',
                  value: `${insightsSnapshot.wowDeltaPct >= 0 ? '+' : ''}${insightsSnapshot.wowDeltaPct.toFixed(1)}%`,
                  color: insightsSnapshot.wowDeltaPct >= 0 ? 'var(--accent)' : 'var(--tier-escalate)',
                }] : []),
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  flex: 1, background: 'rgba(8,26,34,0.5)', borderRadius: 8,
                  padding: '12px 14px', border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>

            {(insightsSnapshot.topFrictionTypes?.length ?? 0) > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Top Friction Types
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(insightsSnapshot.topFrictionTypes ?? []).map(f => (
                    <span key={f} style={{
                      fontSize: 10, padding: '2px 8px',
                      background: 'rgba(255,157,101,0.12)', color: 'var(--warn)',
                      border: '1px solid rgba(255,157,101,0.3)', borderRadius: 3, fontWeight: 700,
                    }}>
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(insightsSnapshot.recommendations?.length ?? 0) > 0 && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  Recommendations
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(insightsSnapshot.recommendations ?? []).slice(0, 3).map((r, i) => (
                    <div key={i} style={{
                      padding: '10px 14px', background: 'rgba(8,26,34,0.5)',
                      borderLeft: `3px solid ${confidenceColor(r.confidence)}`,
                      borderRadius: '0 6px 6px 0',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--info)', fontWeight: 700 }}>
                          {r.frictionId} — {r.page}
                        </span>
                        <span style={{ fontSize: 10, color: confidenceColor(r.confidence), textTransform: 'capitalize' }}>
                          {r.confidence} ({fmt(r.sampleSize)} samples)
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{r.fixText}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{r.impactEstimate}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const EVENT_FILTERS = ['all', 'navigation', 'cart', 'friction', 'product', 'checkout'] as const;
type EventFilter = typeof EVENT_FILTERS[number];

// ─── Main Component ───────────────────────────────────────────────────────────

export function TrackTab({
  events,
  overview,
  trafficData, deviceData, funnelData, flowData,
  pageStatsData, clickPoints, insightsSnapshot, croFindings,
  frictionAnalytics, revenueAttribution,
}: TrackTabProps) {
  const [filter, setFilter] = useState<EventFilter>('all');
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>('funnel');
  const feedRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevEventCount = useRef(0);

  const filtered = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter(e =>
      e.category === filter ||
      (filter === 'friction' && (e.frictionId || e.friction_id))
    );
  }, [events, filter]);

  const eventRate = useMemo(() => {
    const cutoff = Date.now() - 60_000;
    return events.filter(e => e.timestamp > cutoff).length;
  }, [events]);

  const hotSessions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      if (e.frictionId || e.friction_id) {
        counts[e.session_id] = (counts[e.session_id] ?? 0) + 1;
      }
    }
    return Object.values(counts).filter(c => c >= 3).length;
  }, [events]);

  const sessionEventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.session_id] = (counts[e.session_id] ?? 0) + 1;
    }
    return counts;
  }, [events]);

  useEffect(() => {
    if (autoScroll && filtered.length !== prevEventCount.current) {
      prevEventCount.current = filtered.length;
      feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [filtered.length, autoScroll]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── HERO: Live Event Feed (50vh) ───────────────────────────────── */}
      <div style={{
        flexShrink: 0, height: '58vh', minHeight: 280,
        display: 'flex', flexDirection: 'column',
        padding: '12px 20px 0',
        background: 'var(--bg)',
      }}>
        <div className="card" style={{
          flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(53,211,161,0.08)',
        }}>
          {/* Hero header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '9px 16px', borderBottom: '1px solid var(--line)',
            background: 'var(--surface)', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text)',
              }}>
                Live Event Feed
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--accent)', letterSpacing: '0.04em',
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
                  animation: 'pulse 2s infinite', flexShrink: 0,
                }} />
                LIVE
              </span>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
              {hotSessions > 0 && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tier-escalate)', fontWeight: 700 }}>
                  🔴 {hotSessions} hot {hotSessions > 1 ? 'sessions' : 'session'}
                </span>
              )}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                {eventRate}/min
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                {fmt(events.length)} total
              </span>
              <button
                onClick={() => setAutoScroll(a => !a)}
                style={{
                  background: autoScroll ? 'rgba(53,211,161,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${autoScroll ? 'rgba(53,211,161,0.35)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 4, padding: '2px 8px',
                  color: autoScroll ? 'var(--accent)' : 'var(--muted)',
                  fontSize: 9, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
              >
                {autoScroll ? '⏬ AUTO' : '⏸ PAUSED'}
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div style={{
            display: 'flex', gap: 4, padding: '6px 16px',
            borderBottom: '1px solid var(--line)', background: 'var(--surface)', flexShrink: 0,
          }}>
            {EVENT_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? 'rgba(53,211,161,0.12)' : 'transparent',
                  border: `1px solid ${filter === f ? 'rgba(53,211,161,0.45)' : 'var(--line)'}`,
                  borderRadius: 4, padding: '3px 9px',
                  color: filter === f ? 'var(--accent)' : 'var(--muted)',
                  fontSize: 10, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: filter === f ? 700 : 400,
                  transition: 'all 0.12s',
                }}
              >
                {f}
              </button>
            ))}
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)',
              marginLeft: 'auto', alignSelf: 'center',
            }}>
              {filtered.length} events
            </span>
          </div>

          {/* Events list */}
          <div
            ref={feedRef}
            style={{ flex: 1, overflowY: 'auto' }}
            onScroll={e => {
              const el = e.currentTarget;
              setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
            }}
          >
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📡</div>
                <p>Waiting for events…</p>
                <p className="muted">Events appear here as users browse the store.</p>
              </div>
            ) : (
              [...filtered].reverse().map(evt => {
                const hasFriction = !!(evt.frictionId || evt.friction_id);
                const fId = evt.frictionId || evt.friction_id;
                const depth = Math.min((sessionEventCounts[evt.session_id] ?? 1), 12);
                const depthPct = Math.round((depth / 12) * 100);
                const isHot = depth >= 3 && hasFriction;
                const catColor = categoryColor(evt.category);

                return (
                  <div
                    key={evt.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '74px 90px 1fr auto',
                      gap: 10, alignItems: 'center',
                      padding: '8px 18px',
                      borderBottom: '1px solid rgba(26,61,74,0.4)',
                      borderLeft: `3px solid ${catColor}22`,
                      transition: 'background 0.15s',
                      fontSize: 13,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(53,211,161,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Time */}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                      {formatTime(evt.timestamp)}
                    </span>

                    {/* Category chip */}
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      color: catColor, background: `${catColor}18`,
                      padding: '2px 7px', borderRadius: 3,
                      border: `1px solid ${catColor}33`,
                      whiteSpace: 'nowrap',
                    }}>
                      {categoryLabel(evt.category)}
                    </span>

                    {/* Description */}
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13 }}>
                        {describeEvent(evt)}
                      </div>
                    </div>

                    {/* Friction tag + hot indicator */}
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                      {hasFriction && (
                        <span className="friction-tag">{fId}</span>
                      )}
                      {isHot && (
                        <span style={{ fontSize: 11 }} title="Hot session">🔴</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Analytics (tabbed, scrollable) ────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Analytics tab strip */}
        <div style={{
          display: 'flex', gap: 0, borderBottom: '1px solid var(--line)',
          background: 'var(--surface)', flexShrink: 0, padding: '0 20px',
        }}>
          {ANALYTICS_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setAnalyticsTab(tab.id)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${analyticsTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                padding: '10px 18px 9px',
                color: analyticsTab === tab.id ? 'var(--text)' : 'var(--muted)',
                fontSize: 12,
                fontWeight: analyticsTab === tab.id ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.12s',
                letterSpacing: '0.01em',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Analytics content */}
        <div style={{ padding: '18px 20px 24px' }}>
          {analyticsTab === 'funnel' && (
            <FunnelPanel
              funnelData={funnelData}
              flowData={flowData}
              pageStatsData={pageStatsData}
            />
          )}
          {analyticsTab === 'audience' && (
            <AudiencePanel
              trafficData={trafficData}
              deviceData={deviceData}
              clickPoints={clickPoints}
            />
          )}
          {analyticsTab === 'friction' && (
            <FrictionPanel
              frictionAnalytics={frictionAnalytics}
              croFindings={croFindings}
            />
          )}
          {analyticsTab === 'revenue' && (
            <RevenuePanel
              revenueAttribution={revenueAttribution}
              insightsSnapshot={insightsSnapshot}
            />
          )}
        </div>
      </div>
    </div>
  );
}
