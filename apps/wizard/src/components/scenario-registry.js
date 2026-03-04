export const SCENARIO_REGISTRY = [
  {
    id: "scn-search-zero-results",
    name: "Search Zero Results Loop",
    category: "Search",
    priority: "critical",
    description: "User repeatedly searches but gets no results and abandons intent.",
    behaviorIds: ["B121", "B134", "B207"],
    frictionIds: ["F028", "F029"],
    expectedIntervention:
      "Offer query refinement, typo correction, and quick category shortcuts.",
    preconditions: ["Home loaded", "Search bar visible"],
    injectors: { forceZeroSearchResults: true },
    assertions: {
      expectedEventTypes: ["search_query"],
      minEventCount: 2,
    },
    steps: [
      { action: "search", query: "hyperluxe moonboots", submit: true },
      { action: "wait", ms: 700 },
      { action: "search", query: "hyperluxe moonboots sale", submit: true },
      { action: "wait", ms: 700 },
    ],
    packs: ["critical", "friction"],
  },
  {
    id: "scn-men-pdp-review-hesitation",
    name: "Men PDP Review Hesitation",
    category: "Product Detail",
    priority: "critical",
    description:
      "User opens PDP, checks reviews and returns repeatedly before deciding.",
    behaviorIds: ["B044", "B083", "B188"],
    frictionIds: ["F042", "F047"],
    expectedIntervention:
      "Surface reassurance: social proof, returns confidence, and concise guidance.",
    preconditions: ["Men clothing catalog loaded"],
    assertions: {
      expectedEventTypes: ["product_detail_view", "product_reviews_viewed"],
      minEventCount: 4,
    },
    steps: [
      { action: "click_nav", gender: "men", label: "Clothing" },
      { action: "wait", ms: 400 },
      { action: "open_product", index: 0 },
      { action: "wait", ms: 500 },
      { action: "modal_tab", tab: "reviews" },
      { action: "wait", ms: 700 },
      { action: "modal_tab", tab: "returns" },
      { action: "wait", ms: 700 },
      { action: "modal_close" },
    ],
    packs: ["critical", "behavior"],
  },
  {
    id: "scn-price-shock-cart",
    name: "Price Shock Cart Add",
    category: "Cart",
    priority: "critical",
    description: "User adds item to cart but sees sudden total increase.",
    behaviorIds: ["B212", "B271"],
    frictionIds: ["F072", "F073"],
    expectedIntervention:
      "Trigger price reassurance and value framing when shock is detected.",
    preconditions: ["Any category loaded"],
    injectors: { forcePriceShock: true },
    assertions: {
      expectedEventTypes: ["cart_item_added"],
      minEventCount: 3,
    },
    steps: [
      { action: "click_nav", gender: "women", label: "Clothing" },
      { action: "wait", ms: 400 },
      { action: "open_product", index: 1 },
      { action: "wait", ms: 500 },
      { action: "modal_select_size", size: "M" },
      { action: "modal_add_to_cart" },
      { action: "wait", ms: 600 },
      { action: "modal_close" },
    ],
    packs: ["critical", "friction"],
  },
  {
    id: "scn-low-stock-pressure",
    name: "Low Stock Pressure",
    category: "Inventory",
    priority: "critical",
    description:
      "User observes low-stock cues and interacts with PDP urgency elements.",
    behaviorIds: ["B091", "B141"],
    frictionIds: ["F053"],
    expectedIntervention:
      "Assist urgency without pressure: clarify stock confidence and alternatives.",
    injectors: { forceLowStock: true },
    assertions: {
      expectedEventTypes: ["product_detail_view"],
      minEventCount: 3,
    },
    steps: [
      { action: "click_nav", gender: "women", label: "Dresses" },
      { action: "wait", ms: 400 },
      { action: "open_product", index: 0 },
      { action: "wait", ms: 700 },
      { action: "modal_select_size", size: "M" },
      { action: "modal_add_to_cart" },
      { action: "wait", ms: 600 },
      { action: "modal_close" },
    ],
    packs: ["critical", "friction"],
  },
  {
    id: "scn-checkout-error-gate",
    name: "Checkout Error Gate",
    category: "Checkout",
    priority: "critical",
    description:
      "User attempts checkout but receives a blocking checkout error path.",
    behaviorIds: ["B301", "B333"],
    frictionIds: ["F096", "F097", "F112"],
    expectedIntervention:
      "Route user to fallback checkout support and confidence messaging.",
    injectors: { forceCheckoutError: true },
    assertions: {
      expectedEventTypes: ["checkout_started", "checkout_error_injected"],
      minEventCount: 3,
    },
    steps: [
      { action: "click_nav", gender: "men", label: "Clothing" },
      { action: "wait", ms: 400 },
      { action: "open_product", index: 0 },
      { action: "wait", ms: 500 },
      { action: "modal_select_size", size: "M" },
      { action: "modal_add_to_cart" },
      { action: "wait", ms: 500 },
      { action: "modal_close" },
      { action: "start_checkout" },
      { action: "wait", ms: 500 },
    ],
    packs: ["critical", "friction"],
  },
  {
    id: "scn-comparison-paralysis",
    name: "Comparison Paralysis",
    category: "Decision Friction",
    priority: "critical",
    description:
      "User repeatedly jumps across similar products without conversion.",
    behaviorIds: ["B167", "B216", "B251"],
    frictionIds: ["F044", "F050"],
    expectedIntervention:
      "Provide side-by-side recommendation and simplify decision path.",
    assertions: {
      expectedEventTypes: ["product_detail_view", "suggested_product_clicked"],
      minEventCount: 4,
    },
    steps: [
      { action: "click_nav", gender: "women", label: "Accessories" },
      { action: "wait", ms: 400 },
      { action: "open_product", index: 0 },
      { action: "wait", ms: 500 },
      { action: "click_similar", index: 0 },
      { action: "wait", ms: 500 },
      { action: "click_similar", index: 1 },
      { action: "wait", ms: 500 },
      { action: "modal_close" },
    ],
    packs: ["critical", "behavior"],
  },
  {
    id: "scn-sale-filter-intent",
    name: "Sale + Filters Intent",
    category: "Discovery",
    priority: "critical",
    description:
      "User applies sale + sort + filters looking for value and precision.",
    behaviorIds: ["B058", "B104", "B198"],
    frictionIds: ["F070", "F072"],
    expectedIntervention:
      "Present best-value matches and reduce filter dead-end confusion.",
    assertions: {
      expectedEventTypes: ["filter_applied", "sort_changed"],
      minEventCount: 3,
    },
    steps: [
      { action: "click_nav", gender: "men", label: "Sale" },
      { action: "wait", ms: 400 },
      { action: "apply_filter", filter: "under-50" },
      { action: "wait", ms: 500 },
      { action: "set_sort", value: "price_low" },
      { action: "wait", ms: 500 },
      { action: "apply_filter", filter: "black" },
      { action: "wait", ms: 500 },
    ],
    packs: ["critical", "behavior"],
  },
  {
    id: "scn-wishlist-fast-path",
    name: "Wishlist Fast Path",
    category: "Intent Signals",
    priority: "high",
    description:
      "User quickly wishlists multiple products without adding to cart.",
    behaviorIds: ["B145", "B230"],
    frictionIds: ["F068"],
    expectedIntervention:
      "Capture high intent and trigger lightweight reminder intervention.",
    assertions: {
      expectedEventTypes: ["wishlist_item_added"],
      minEventCount: 2,
    },
    steps: [
      { action: "home_top" },
      { action: "wait", ms: 400 },
      { action: "toggle_card_wishlist", index: 0 },
      { action: "toggle_card_wishlist", index: 1 },
      { action: "wait", ms: 500 },
      { action: "open_wishlist" },
      { action: "wait", ms: 500 },
      { action: "close_wishlist" },
    ],
    packs: ["behavior"],
  },
  {
    id: "scn-hero-to-collection",
    name: "Hero Browse to Collection",
    category: "Navigation",
    priority: "high",
    description:
      "User explores hero slider and drills down to category collection.",
    behaviorIds: ["B012", "B041"],
    frictionIds: ["F017"],
    expectedIntervention:
      "Guide continuity from hero discovery into high-conversion listing.",
    assertions: {
      expectedEventTypes: ["navigation_interaction"],
      minEventCount: 2,
    },
    steps: [
      { action: "hero_slide", index: 1 },
      { action: "wait", ms: 400 },
      { action: "browse_hero", category: "footwear" },
      { action: "wait", ms: 500 },
      { action: "open_product", index: 0 },
      { action: "wait", ms: 500 },
      { action: "modal_close" },
    ],
    packs: ["behavior"],
  },
  {
    id: "scn-return-policy-focus",
    name: "Return Policy Focus",
    category: "Trust",
    priority: "high",
    description:
      "User opens return policy from PDP and spends time before decision.",
    behaviorIds: ["B088", "B190"],
    frictionIds: ["F047", "F053"],
    expectedIntervention:
      "Trust-oriented intervention with returns clarity and purchase confidence.",
    assertions: {
      expectedEventTypes: ["product_return_policy_viewed"],
      minEventCount: 2,
    },
    steps: [
      { action: "click_nav", gender: "women", label: "Clothing" },
      { action: "wait", ms: 400 },
      { action: "open_product", index: 2 },
      { action: "wait", ms: 500 },
      { action: "modal_tab", tab: "returns" },
      { action: "wait", ms: 900 },
      { action: "modal_close" },
    ],
    packs: ["friction", "behavior"],
  },
];

export const SCENARIO_PACKS = [
  {
    id: "critical",
    label: "Critical 7",
    description: "Core friction and intervention validation scenarios.",
    scenarioIds: SCENARIO_REGISTRY.filter((s) => s.packs.includes("critical")).map(
      (s) => s.id,
    ),
  },
  {
    id: "friction",
    label: "Friction Focus",
    description: "Scenarios weighted toward friction detection reliability.",
    scenarioIds: SCENARIO_REGISTRY.filter((s) => s.packs.includes("friction")).map(
      (s) => s.id,
    ),
  },
  {
    id: "behavior",
    label: "Behavior Focus",
    description: "Scenarios weighted toward behavioral pattern coverage.",
    scenarioIds: SCENARIO_REGISTRY.filter((s) => s.packs.includes("behavior")).map(
      (s) => s.id,
    ),
  },
];

export function getScenarioById(id) {
  return SCENARIO_REGISTRY.find((s) => s.id === id) || null;
}

export function getPackById(id) {
  return SCENARIO_PACKS.find((p) => p.id === id) || null;
}

export function getScenariosByPack(id) {
  const pack = getPackById(id);
  if (!pack) return [];
  const set = new Set(pack.scenarioIds);
  return SCENARIO_REGISTRY.filter((s) => set.has(s.id));
}
