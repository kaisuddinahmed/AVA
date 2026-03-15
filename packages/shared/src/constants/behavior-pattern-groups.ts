/**
 * Behavior Pattern Groups — runtime-detectable classification of B001–B614.
 *
 * Each group maps catalog patterns to a signal modifier applied in the MSWIM
 * intent and clarity calculators. Detection is event-sequence-based in
 * behavior-pattern-matcher.ts — adding a new group here requires no changes
 * to the signal calculators.
 */

export type BehaviorGroup =
  | "HIGH_INTENT"
  | "COMPARISON"
  | "HESITATION"
  | "DISCOVERY"
  | "EXIT_RISK";

export interface BehaviorGroupDefinition {
  label: string;
  description: string;
  /** MSWIM intent signal boost (negative = penalty). Applied by adjustIntent(). */
  intentBoost: number;
  /** MSWIM clarity signal boost (negative = penalty). Applied by adjustClarity(). */
  clarityBoost: number;
  /**
   * B-code IDs in this group. Data-driven: adding a pattern here
   * automatically applies the group boost when the pattern is detected.
   */
  patternIds: string[];
}

export const BEHAVIOR_GROUP_DEFINITIONS: Record<
  BehaviorGroup,
  BehaviorGroupDefinition
> = {
  /**
   * HIGH_INTENT — shopper is actively moving toward purchase.
   * Signals: add_to_cart fired, checkout reached, cart has items,
   *          used stored payment, applied loyalty points.
   */
  HIGH_INTENT: {
    label: "High Purchase Intent",
    description: "Shopper is actively moving toward completing a purchase",
    intentBoost: 12,
    clarityBoost: 5,
    patternIds: [
      "B135", // Added single item to cart
      "B136", // Added multiple items to cart
      "B137", // Added to cart immediately (no deliberation)
      "B138", // Added to cart after long browsing
      "B139", // Increased quantity in cart
      "B152", // Added from recommendations in cart
      "B165", // Initiated checkout
      "B167", // Checkout with existing account login
      "B187", // Used stored/saved payment method
      "B188", // Applied loyalty points at checkout
      "B191", // Applied coupon at checkout
      "B195", // Completed order confirmation
      "B202", // Progressed through multi-step checkout
      "B207", // Checked order summary before confirmation
      "B253", // Repeat purchase (same product)
      "B260", // Used "Buy Again" / reorder
    ],
  },

  /**
   * COMPARISON — shopper is evaluating options, high engagement.
   * Signals: multiple product detail views, size guide, description read,
   *          reviews checked, side-by-side comparison used.
   */
  COMPARISON: {
    label: "Active Comparison",
    description: "Shopper is comparing products or evaluating options carefully",
    intentBoost: 6,
    clarityBoost: 8,
    patternIds: [
      "B051", // Browsing product reviews/ratings
      "B052", // Reading Q&A section
      "B053", // Viewing product images/gallery
      "B054", // Zooming into product images
      "B058", // Clicked size guide/chart
      "B059", // Clicked color swatches
      "B060", // Browsing related/similar products
      "B063", // Browsing "Frequently Bought Together"
      "B073", // Comparing products side-by-side
      "B096", // Read full product description
      "B099", // Viewed product specifications
      "B106", // Selected product variant
      "B114", // Clicked on product review stars
      "B115", // Read negative reviews specifically
      "B116", // Filtered reviews by rating
      "B121", // Scrolled through all product images
      "B122", // Clicked "See More" on descriptions
    ],
  },

  /**
   * HESITATION — shopper shows indecision signals; intervention likely to help.
   * Signals: variant changes without add-to-cart, wishlist without cart,
   *          repeated cart views without proceeding, add-remove loops.
   */
  HESITATION: {
    label: "Decision Hesitation",
    description: "Shopper is uncertain or stuck — intervention likely to help",
    intentBoost: -5,
    clarityBoost: -8,
    patternIds: [
      "B107", // Changed variant selection multiple times
      "B123", // Added to wishlist (not cart)
      "B127", // Returned to view wishlist
      "B130", // Added to wishlist but never to cart
      "B132", // Large wishlist accumulation, no purchases
      "B143", // Add, remove, re-add (hesitation loop)
      "B148", // Cart sitting idle
      "B151", // Repeatedly returning to cart without proceeding
      "B154", // Tried multiple coupon codes
      "B156", // Removed item after seeing total
      "B157", // Cart created, checkout never started
      "B199", // Hesitated on "Place Order" button
      "B200", // Filled checkout fields slowly
      "B203", // Backtracked in checkout flow
      "B209", // Abandoned at account creation
      "B210", // Abandoned at shipping step
      "B217", // Abandoned due to total price shock
      "B236", // Serial abandoner pattern
      "B237", // Abandoned multiple times for same product
    ],
  },

  /**
   * DISCOVERY — shopper in early exploration phase; not ready for intervention.
   * Signals: homepage/category browsing, quick page flips, no product depth.
   */
  DISCOVERY: {
    label: "Early Discovery",
    description: "Shopper is still exploring — premature intervention risks annoyance",
    intentBoost: -8,
    clarityBoost: -5,
    patternIds: [
      "B015", // First-time visitor
      "B025", // Homepage browsing only
      "B026", // Category page browsing
      "B027", // Subcategory deep-dive
      "B028", // Browsing via site search
      "B029", // Browsing via navigation menu
      "B036", // Rapid page flipping (<5s per page)
      "B039", // Erratic browsing (jumping categories)
      "B041", // Filter/facet usage
      "B042", // Sort usage
      "B075", // Ambient shopping
      "B077", // Generic/category search terms
      "B082", // Refined/modified search
      "B083", // Multiple consecutive searches
      "B084", // Search abandonment
      "B094", // Viewed product but took no action
    ],
  },

  /**
   * EXIT_RISK — shopper shows strong abandonment signals; highest-priority intervention.
   * Signals: exit intent, rage clicks, idle with cart, tab switches, back navigation.
   */
  EXIT_RISK: {
    label: "Exit Risk",
    description: "Shopper is showing strong abandonment signals — urgent intervention",
    intentBoost: -10,
    clarityBoost: 3, // Corroboration: we know exactly what's happening
    patternIds: [
      "B035", // Window shopping (many views, no cart)
      "B048", // Back button usage
      "B050", // Tab-hopping (multiple product pages)
      "B084", // Search abandonment
      "B141", // Removed item from cart
      "B142", // Removed all items (cart clearing)
      "B208", // Abandoned at cart page
      "B212", // Abandoned at payment step
      "B213", // Abandoned at order review
      "B214", // Abandoned due to unexpected shipping
      "B219", // Abandoned due to technical error
      "B220", // Abandoned due to payment failure
      "B222", // Abandoned due to security concerns
      "B225", // Abandoned due to long delivery time
      "B229", // Price comparison shopping (left to compare)
      "B230", // Abandoned due to distraction/timeout
      "B235", // Abandoned and never returned
    ],
  },
};

/**
 * Ordered priority for when multiple groups are active simultaneously.
 * EXIT_RISK is resolved first (most urgent), DISCOVERY last.
 */
export const BEHAVIOR_GROUP_PRIORITY: BehaviorGroup[] = [
  "EXIT_RISK",
  "HESITATION",
  "HIGH_INTENT",
  "COMPARISON",
  "DISCOVERY",
];

/**
 * Fast lookup: patternId → group. Built once at module load.
 */
export const PATTERN_TO_GROUP: Map<string, BehaviorGroup> = new Map(
  (Object.entries(BEHAVIOR_GROUP_DEFINITIONS) as [BehaviorGroup, BehaviorGroupDefinition][])
    .flatMap(([group, def]) => def.patternIds.map((id) => [id, group] as [string, BehaviorGroup]))
);
