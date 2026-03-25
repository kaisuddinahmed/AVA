"use strict";
/**
 * AVA Friction Catalog — F001 through F325
 * 25 categories, 325 friction scenarios
 *
 * Auto-generated from docs/friction_scenarios.md
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FRICTION_CATALOG = exports.FrictionCategory = void 0;
exports.getFrictionScenario = getFrictionScenario;
exports.getScenariosByCategory = getScenariosByCategory;
exports.getAllFrictionIds = getAllFrictionIds;
// ---------------------------------------------------------------------------
// Enum: 25 friction categories
// ---------------------------------------------------------------------------
var FrictionCategory;
(function (FrictionCategory) {
    FrictionCategory["LANDING"] = "landing";
    FrictionCategory["NAVIGATION"] = "navigation";
    FrictionCategory["SEARCH"] = "search";
    FrictionCategory["PRODUCT"] = "product";
    FrictionCategory["CART"] = "cart";
    FrictionCategory["CHECKOUT"] = "checkout";
    FrictionCategory["PRICING"] = "pricing";
    FrictionCategory["TRUST"] = "trust";
    FrictionCategory["MOBILE"] = "mobile";
    FrictionCategory["TECHNICAL"] = "technical";
    FrictionCategory["CONTENT"] = "content";
    FrictionCategory["PERSONALIZATION"] = "personalization";
    FrictionCategory["SOCIAL_PROOF"] = "social_proof";
    FrictionCategory["COMMUNICATION"] = "communication";
    FrictionCategory["ACCOUNT"] = "account";
    FrictionCategory["SHIPPING"] = "shipping";
    FrictionCategory["RETURNS"] = "returns";
    FrictionCategory["POST_PURCHASE"] = "post_purchase";
    FrictionCategory["RE_ENGAGEMENT"] = "re_engagement";
    FrictionCategory["ACCESSIBILITY"] = "accessibility";
    FrictionCategory["CROSS_CHANNEL"] = "cross_channel";
    FrictionCategory["DECISION"] = "decision";
    FrictionCategory["PAYMENT"] = "payment";
    FrictionCategory["COMPLIANCE"] = "compliance";
    FrictionCategory["SEASONAL"] = "seasonal";
})(FrictionCategory || (exports.FrictionCategory = FrictionCategory = {}));
// ---------------------------------------------------------------------------
// Catalog: Map<frictionId, FrictionScenario> — all 325 entries
// ---------------------------------------------------------------------------
exports.FRICTION_CATALOG = new Map([
    // =======================================================================
    // CATEGORY 01: LANDING & FIRST IMPRESSION FRICTION (F001 – F012)
    // =======================================================================
    ["F001", { id: "F001", category: FrictionCategory.LANDING, scenario: "Slow page load on entry", detection_signal: "page_load_time > 3s", ai_action: 'Show skeleton loader + "Almost there" message' }],
    ["F002", { id: "F002", category: FrictionCategory.LANDING, scenario: "Bounce within 5 seconds", detection_signal: "session_duration < 5s AND pages_viewed == 1", ai_action: "Trigger exit-intent overlay with value prop" }],
    ["F003", { id: "F003", category: FrictionCategory.LANDING, scenario: "Lands on 404 / broken page", detection_signal: "http_status == 404", ai_action: "Redirect to smart search with original query parsed" }],
    ["F004", { id: "F004", category: FrictionCategory.LANDING, scenario: "Lands on out-of-stock product (from ad/email)", detection_signal: "landing_page == product AND stock == 0", ai_action: "Show alternatives + back-in-stock signup" }],
    ["F005", { id: "F005", category: FrictionCategory.LANDING, scenario: "Geo-mismatch (wrong currency/language)", detection_signal: "geo_ip != store_locale", ai_action: "Auto-suggest correct locale/currency switch" }],
    ["F006", { id: "F006", category: FrictionCategory.LANDING, scenario: "Mobile user on non-responsive page", detection_signal: "device == mobile AND viewport_mismatch == true", ai_action: "Trigger mobile-optimized overlay or redirect" }],
    ["F007", { id: "F007", category: FrictionCategory.LANDING, scenario: "First-time visitor with no context", detection_signal: "is_new_visitor == true AND referrer == direct", ai_action: "Show welcome guide / category highlights" }],
    ["F008", { id: "F008", category: FrictionCategory.LANDING, scenario: "Lands from price comparison site", detection_signal: "referrer contains comparison_site_domain", ai_action: "Emphasize price match guarantee + free shipping" }],
    ["F009", { id: "F009", category: FrictionCategory.LANDING, scenario: "Popup/modal blocks content immediately", detection_signal: "modal_shown_at < 2s AND close_click_time == null", ai_action: "Delay popup, or auto-dismiss after 3s" }],
    ["F010", { id: "F010", category: FrictionCategory.LANDING, scenario: "Cookie consent banner covers key CTA", detection_signal: "consent_banner == visible AND cta_obscured == true", ai_action: "Minimize banner, float consent as bottom bar" }],
    ["F011", { id: "F011", category: FrictionCategory.LANDING, scenario: "Aggressive popup triggers immediate exit", detection_signal: "popup_shown AND exit_within < 3s", ai_action: "Suppress popup for this user segment going forward" }],
    ["F012", { id: "F012", category: FrictionCategory.LANDING, scenario: "Promotional banner links to expired offer", detection_signal: "click_target == promo_banner AND offer_expired == true", ai_action: "Show updated offer or nearest active promotion" }],
    // =======================================================================
    // CATEGORY 02: NAVIGATION & DISCOVERY FRICTION (F013 – F027)
    // =======================================================================
    ["F013", { id: "F013", category: FrictionCategory.NAVIGATION, scenario: "Can't find category (excessive menu depth)", detection_signal: "menu_hover_count > 5 AND no_click", ai_action: 'Surface AI search prompt: "Looking for something?"' }],
    ["F014", { id: "F014", category: FrictionCategory.NAVIGATION, scenario: "Clicks wrong category, immediately backtracks", detection_signal: "page_back_within < 3s", ai_action: 'Show breadcrumb trail + "Did you mean...?" suggestions' }],
    ["F015", { id: "F015", category: FrictionCategory.NAVIGATION, scenario: "Scrolls entire page without clicking anything", detection_signal: "scroll_depth == 100% AND click_count == 0", ai_action: 'Trigger floating assistant: "Need help finding something?"' }],
    ["F016", { id: "F016", category: FrictionCategory.NAVIGATION, scenario: "Uses browser back button repeatedly", detection_signal: "back_button_count >= 3 in 60s", ai_action: "Show persistent navigation sidebar or sticky category menu" }],
    ["F017", { id: "F017", category: FrictionCategory.NAVIGATION, scenario: "Dead-end page (no next action visible)", detection_signal: "page_has_no_cta == true AND dwell_time > 10s", ai_action: "Inject recommended products or related categories" }],
    ["F018", { id: "F018", category: FrictionCategory.NAVIGATION, scenario: "Excessive filter usage with no results", detection_signal: "filter_applied_count >= 4 AND results == 0", ai_action: "Suggest relaxing filters, show nearest matches" }],
    ["F019", { id: "F019", category: FrictionCategory.NAVIGATION, scenario: "Filter combination returns 0 results", detection_signal: "applied_filters result_count == 0", ai_action: 'Show "No exact match" + auto-suggest closest results' }],
    ["F020", { id: "F020", category: FrictionCategory.NAVIGATION, scenario: "Pogo-sticking (repeatedly entering and leaving pages)", detection_signal: "page_enter_exit_loop >= 3", ai_action: 'Ask "Not finding what you need?" + offer guided search' }],
    ["F021", { id: "F021", category: FrictionCategory.NAVIGATION, scenario: "Hamburger menu not discovered (mobile)", detection_signal: "time_on_page > 30s AND menu_opened == false AND scroll_depth > 50%", ai_action: "Highlight menu icon with subtle animation/tooltip" }],
    ["F022", { id: "F022", category: FrictionCategory.NAVIGATION, scenario: "Breadcrumb not used, user is lost", detection_signal: "page_depth > 4 AND breadcrumb_click == 0 AND back_button > 2", ai_action: 'Show floating "Back to [Category]" shortcut' }],
    ["F023", { id: "F023", category: FrictionCategory.NAVIGATION, scenario: "Clicked non-clickable element", detection_signal: "dead_click == true on image/text/banner", ai_action: 'Make element clickable or show tooltip: "Click here for details"' }],
    ["F024", { id: "F024", category: FrictionCategory.NAVIGATION, scenario: "Category page has too many products (overwhelm)", detection_signal: "category_product_count > 100 AND scroll_depth < 20% AND exit == true", ai_action: 'Suggest sub-filters or "Shop by" curated collections' }],
    ["F025", { id: "F025", category: FrictionCategory.NAVIGATION, scenario: "User clicks logo repeatedly", detection_signal: "logo_click_count >= 2 in 30s", ai_action: "Possible frustration signal — offer help or reset journey" }],
    ["F026", { id: "F026", category: FrictionCategory.NAVIGATION, scenario: "Horizontal scroll on mobile (broken layout)", detection_signal: "horizontal_scroll_detected == true AND device == mobile", ai_action: 'Flag layout issue; show "Try our app" or simplified view' }],
    ["F027", { id: "F027", category: FrictionCategory.NAVIGATION, scenario: "Footer links used as primary navigation", detection_signal: "footer_nav_click_count > 2 AND main_nav_click == 0", ai_action: "Improve main nav visibility; surface popular links higher" }],
    // =======================================================================
    // CATEGORY 03: SEARCH FRICTION (F028 – F041)
    // =======================================================================
    ["F028", { id: "F028", category: FrictionCategory.SEARCH, scenario: "Search returns zero results", detection_signal: "search_query AND result_count == 0", ai_action: 'Show "Did you mean...?" + popular products + AI suggestions' }],
    ["F029", { id: "F029", category: FrictionCategory.SEARCH, scenario: "Misspelled search query", detection_signal: "search_query fuzzy_match_score < 0.7", ai_action: 'Auto-correct with "Showing results for [corrected]"' }],
    ["F030", { id: "F030", category: FrictionCategory.SEARCH, scenario: "Vague/generic search term", detection_signal: "search_query word_count == 1 AND result_count > 200", ai_action: 'Show category disambiguation: "Are you looking for...?"' }],
    ["F031", { id: "F031", category: FrictionCategory.SEARCH, scenario: "Multiple refined searches (3+ in session)", detection_signal: "search_count >= 3 AND purchase == false", ai_action: 'Trigger AI assistant: "Let me help you find the right product"' }],
    ["F032", { id: "F032", category: FrictionCategory.SEARCH, scenario: "Search results irrelevant to query", detection_signal: "search_query vs results relevance_score < 0.4", ai_action: 'Offer "Did you mean?" + human chat handoff' }],
    ["F033", { id: "F033", category: FrictionCategory.SEARCH, scenario: "Searched but didn't click any result", detection_signal: "search_completed AND result_click == 0", ai_action: "Resurface results with better visual layout / filters" }],
    ["F034", { id: "F034", category: FrictionCategory.SEARCH, scenario: "Searched for competitor product/brand", detection_signal: "search_query matches competitor_brand_list", ai_action: "Show equivalent own-brand product with comparison" }],
    ["F035", { id: "F035", category: FrictionCategory.SEARCH, scenario: "Searched for coupon/discount/promo code", detection_signal: 'search_query contains ["coupon","discount","promo","deal"]', ai_action: "Surface active promotions or signup-for-discount offer" }],
    ["F036", { id: "F036", category: FrictionCategory.SEARCH, scenario: "Searched for return/refund/cancel", detection_signal: 'search_query contains ["return","refund","cancel","exchange"]', ai_action: 'Proactive support: "Need help with an order?" + link to policy' }],
    ["F037", { id: "F037", category: FrictionCategory.SEARCH, scenario: "Search autocomplete ignored", detection_signal: "autocomplete_shown == true AND autocomplete_selected == false", ai_action: "Improve autocomplete relevance; test visual prominence" }],
    ["F038", { id: "F038", category: FrictionCategory.SEARCH, scenario: "Voice search failed / not recognized", detection_signal: "voice_search_initiated AND result == error", ai_action: "Fallback to text search with pre-filled partial query" }],
    ["F039", { id: "F039", category: FrictionCategory.SEARCH, scenario: "Image/visual search returned poor matches", detection_signal: "visual_search_initiated AND result_click == 0", ai_action: 'Offer text-based refinement: "Describe what you\'re looking for"' }],
    ["F040", { id: "F040", category: FrictionCategory.SEARCH, scenario: "Searched for product that exists but is hidden/unlisted", detection_signal: "search_query matches unlisted_product", ai_action: "Review catalog visibility; show related available products" }],
    ["F041", { id: "F041", category: FrictionCategory.SEARCH, scenario: "Repeated identical search across sessions", detection_signal: "same_search_query across session_count >= 2", ai_action: 'Proactive notification: "Still looking for [X]? Here\'s what\'s new"' }],
    // =======================================================================
    // CATEGORY 04: PRODUCT PAGE FRICTION (F042 – F067)
    // =======================================================================
    ["F042", { id: "F042", category: FrictionCategory.PRODUCT, scenario: "Viewed product page but left quickly (<10s)", detection_signal: "pdp_dwell_time < 10s AND add_to_cart == false", ai_action: "Log as low engagement; retarget with product highlights" }],
    ["F043", { id: "F043", category: FrictionCategory.PRODUCT, scenario: "Long dwell on product page, no action (>3min)", detection_signal: "pdp_dwell_time > 180s AND add_to_cart == false", ai_action: 'Trigger "Have questions? Chat with us" or show social proof' }],
    ["F044", { id: "F044", category: FrictionCategory.PRODUCT, scenario: "Viewed product multiple times across sessions", detection_signal: "pdp_view_count >= 3 across sessions AND purchase == false", ai_action: "Show price drop alert signup or limited-time incentive" }],
    ["F045", { id: "F045", category: FrictionCategory.PRODUCT, scenario: "Scrolled to reviews but bounced after reading", detection_signal: "scroll_to_reviews == true AND exit_after_reviews == true", ai_action: "Proactively surface positive reviews; offer comparison" }],
    ["F046", { id: "F046", category: FrictionCategory.PRODUCT, scenario: "Read mostly negative reviews", detection_signal: "review_scroll_focus == negative_reviews", ai_action: "Show brand response to concerns; offer guarantee/warranty info" }],
    ["F047", { id: "F047", category: FrictionCategory.PRODUCT, scenario: "Zoomed into product images repeatedly", detection_signal: "image_zoom_count >= 3", ai_action: "Offer 360 view, video, or AR try-on if available" }],
    ["F048", { id: "F048", category: FrictionCategory.PRODUCT, scenario: "Size/variant selector interacted but not confirmed", detection_signal: "variant_change_count >= 3 AND add_to_cart == false", ai_action: 'Show size guide, fit recommendations, or "Ask about sizing" chat' }],
    ["F049", { id: "F049", category: FrictionCategory.PRODUCT, scenario: "Size guide opened but user still didn't add to cart", detection_signal: "size_guide_viewed == true AND add_to_cart == false within 60s", ai_action: 'Offer "Still unsure? Our fit assistant can help" + easy returns note' }],
    ["F050", { id: "F050", category: FrictionCategory.PRODUCT, scenario: "Product description not scrolled to", detection_signal: "description_in_viewport == false AND exit == true", ai_action: "Move key info above fold; add quick-view summary" }],
    ["F051", { id: "F051", category: FrictionCategory.PRODUCT, scenario: "Checked shipping info, then left", detection_signal: "shipping_info_viewed == true AND exit_within < 30s", ai_action: "Shipping cost may be the blocker — offer free shipping threshold" }],
    ["F052", { id: "F052", category: FrictionCategory.PRODUCT, scenario: "Checked return policy, then left", detection_signal: "return_policy_viewed == true AND exit_within < 30s", ai_action: 'Emphasize "hassle-free returns" with trust badge on product page' }],
    ["F053", { id: "F053", category: FrictionCategory.PRODUCT, scenario: "Out-of-stock product viewed", detection_signal: "stock_status == 0 AND pdp_viewed == true", ai_action: "Back-in-stock alert + show similar available products" }],
    ["F054", { id: "F054", category: FrictionCategory.PRODUCT, scenario: "Low stock but user didn't act", detection_signal: "stock_count <= 3 AND add_to_cart == false AND dwell > 30s", ai_action: 'Show urgency: "Only [X] left" with social proof' }],
    ["F055", { id: "F055", category: FrictionCategory.PRODUCT, scenario: "Compared variants but chose none", detection_signal: "variant_comparison_count >= 2 AND add_to_cart == false", ai_action: 'Offer quick comparison table or "Most popular choice" badge' }],
    ["F056", { id: "F056", category: FrictionCategory.PRODUCT, scenario: "Clicked on product from recommendation but left", detection_signal: "source == recommendation AND pdp_exit_within < 15s", ai_action: "Recommendation may be off — refine algorithm for this user" }],
    ["F057", { id: "F057", category: FrictionCategory.PRODUCT, scenario: "Product video not played (exists but ignored)", detection_signal: "video_available == true AND video_play == false", ai_action: "Auto-play muted preview or move video higher on page" }],
    ["F058", { id: "F058", category: FrictionCategory.PRODUCT, scenario: 'Hovered over "Add to Cart" but didn\'t click', detection_signal: "hover_atc_button == true AND click_atc == false within 10s", ai_action: 'Micro-nudge: tooltip with "Free shipping" or "Easy returns"' }],
    ["F059", { id: "F059", category: FrictionCategory.PRODUCT, scenario: "Price not visible without scrolling", detection_signal: "price_in_viewport == false on page_load", ai_action: "Restructure layout; pin price near product title" }],
    ["F060", { id: "F060", category: FrictionCategory.PRODUCT, scenario: "User copied product title/price (comparison shopping)", detection_signal: "copy_event on product_title OR price_element", ai_action: 'Show price match guarantee or "Best price" badge' }],
    ["F061", { id: "F061", category: FrictionCategory.PRODUCT, scenario: "Clicked on a trust badge / certification for more info", detection_signal: "trust_badge_click == true", ai_action: "Expand trust info inline; reinforce credibility" }],
    ["F062", { id: "F062", category: FrictionCategory.PRODUCT, scenario: "User tried to share product but feature missing/broken", detection_signal: "share_button_click == error OR share_button_absent", ai_action: "Enable/fix social sharing; track share intent" }],
    ["F063", { id: "F063", category: FrictionCategory.PRODUCT, scenario: "Product page has no reviews", detection_signal: "review_count == 0", ai_action: 'Show "Be the first to review" + industry/editorial endorsements' }],
    ["F064", { id: "F064", category: FrictionCategory.PRODUCT, scenario: "Specification/material info missing", detection_signal: "spec_section == empty AND exit_within < 30s", ai_action: "Flag content gap; show AI-generated summary or chat option" }],
    ["F065", { id: "F065", category: FrictionCategory.PRODUCT, scenario: "Clicked multiple color swatches without adding to cart", detection_signal: "swatch_click_count >= 4 AND add_to_cart == false", ai_action: 'Show "See it in your space" AR or styled product photos per color' }],
    ["F066", { id: "F066", category: FrictionCategory.PRODUCT, scenario: "Viewed product bundle option but didn't select", detection_signal: "bundle_viewed == true AND bundle_selected == false", ai_action: 'Highlight savings amount; show "Popular bundle" social proof' }],
    ["F067", { id: "F067", category: FrictionCategory.PRODUCT, scenario: "Pricing feels unclear (multiple prices, strikethrough confusion)", detection_signal: "price_area_hover_time > 5s OR rage_click on price", ai_action: 'Clarify pricing: "You pay [X] — You save [Y]"' }],
    // =======================================================================
    // CATEGORY 05: CART FRICTION (F068 – F088)
    // =======================================================================
    ["F068", { id: "F068", category: FrictionCategory.CART, scenario: "Added to cart but didn't proceed to checkout", detection_signal: "atc_event == true AND checkout_initiated == false within 600s", ai_action: "Trigger cart reminder notification or incentive" }],
    ["F069", { id: "F069", category: FrictionCategory.CART, scenario: "Cart idle for extended period (>30 min in session)", detection_signal: "cart_last_interaction > 1800s AND session_active == true", ai_action: 'Gentle nudge: "Your cart is waiting" + item availability alert' }],
    ["F070", { id: "F070", category: FrictionCategory.CART, scenario: "Removed item from cart", detection_signal: "cart_remove_event == true", ai_action: 'Ask "Why did you remove this?" (optional quick survey) or show alternative' }],
    ["F071", { id: "F071", category: FrictionCategory.CART, scenario: "Removed item after seeing subtotal", detection_signal: "cart_remove_event after subtotal_view within 10s", ai_action: "Price sensitivity detected — offer discount or show cheaper alternatives" }],
    ["F072", { id: "F072", category: FrictionCategory.CART, scenario: "Cleared entire cart", detection_signal: "cart_item_count from >0 to 0", ai_action: '"Changed your mind?" — offer to save cart for later + ask for feedback' }],
    ["F073", { id: "F073", category: FrictionCategory.CART, scenario: "Added then removed same item multiple times", detection_signal: "item_add_remove_loop >= 2", ai_action: "Hesitation detected — show social proof, reviews, or offer assistance" }],
    ["F074", { id: "F074", category: FrictionCategory.CART, scenario: "Cart total exceeds user's apparent budget threshold", detection_signal: "cart_total > user_avg_order_value * 2 AND hesitation_signals", ai_action: "Suggest breaking into multiple orders or show BNPL option" }],
    ["F075", { id: "F075", category: FrictionCategory.CART, scenario: "Applied coupon code — rejected", detection_signal: "coupon_attempt == true AND coupon_valid == false", ai_action: 'Show valid alternatives: "Try these instead" or signup discount' }],
    ["F076", { id: "F076", category: FrictionCategory.CART, scenario: "Tried multiple coupon codes (code hunting)", detection_signal: "coupon_attempt_count >= 3", ai_action: 'Auto-apply best available discount or show "Best deal applied"' }],
    ["F077", { id: "F077", category: FrictionCategory.CART, scenario: "Cart contains only sale items", detection_signal: "cart_items all discount == true", ai_action: 'Upsell with "Complete your look" full-price recommendations' }],
    ["F078", { id: "F078", category: FrictionCategory.CART, scenario: "Cart contains items from different categories (gift shopping?)", detection_signal: "cart_categories >= 3 AND distinct_sizes == true", ai_action: 'Offer gift wrapping + "Shopping for someone?" prompt' }],
    ["F079", { id: "F079", category: FrictionCategory.CART, scenario: "Cart item went out of stock", detection_signal: "cart_item_stock_status changed to 0", ai_action: 'Notify immediately: "This item just sold out" + show equivalent' }],
    ["F080", { id: "F080", category: FrictionCategory.CART, scenario: "Cart not synced across devices", detection_signal: "user_logged_in == true AND cart_mismatch across devices", ai_action: "Force cart sync; notify user of merged cart" }],
    ["F081", { id: "F081", category: FrictionCategory.CART, scenario: "Shipping cost revealed in cart (shock)", detection_signal: "shipping_cost_shown AND cart_page_exit_within < 20s", ai_action: 'Show free shipping threshold: "Add $X more for free shipping"' }],
    ["F082", { id: "F082", category: FrictionCategory.CART, scenario: "Mini-cart doesn't show enough info", detection_signal: "mini_cart_hover AND full_cart_page_click_immediately", ai_action: "Enhance mini-cart with product images, variant info, total" }],
    ["F083", { id: "F083", category: FrictionCategory.CART, scenario: "Cart page loads slowly", detection_signal: "cart_page_load_time > 3s", ai_action: "Optimize; show cached cart preview while loading" }],
    ["F084", { id: "F084", category: FrictionCategory.CART, scenario: "User edits quantity up then back down", detection_signal: "qty_increase then qty_decrease within 30s", ai_action: "Budget hesitation — show bundle deals or volume discounts" }],
    ["F085", { id: "F085", category: FrictionCategory.CART, scenario: "Cart page has distracting upsell overload", detection_signal: "upsell_sections > 3 AND checkout_button_below_fold", ai_action: "Reduce upsell noise; pin checkout CTA" }],
    ["F086", { id: "F086", category: FrictionCategory.CART, scenario: "Estimated delivery date too far out", detection_signal: "estimated_delivery_days > 7 AND exit == true", ai_action: "Offer express shipping option prominently" }],
    ["F087", { id: "F087", category: FrictionCategory.CART, scenario: "Tax/duty amount surprises user", detection_signal: "tax_calculated AND cart_page_exit_within < 15s", ai_action: 'Show "Price includes all taxes" or pre-calculate at product level' }],
    ["F088", { id: "F088", category: FrictionCategory.CART, scenario: "User returns to cart page 3+ times without checkout", detection_signal: "cart_page_view_count >= 3 AND checkout == false", ai_action: "Strong intent signal — offer time-limited incentive" }],
    // =======================================================================
    // CATEGORY 06: CHECKOUT FRICTION (F089 – F116)
    // =======================================================================
    ["F089", { id: "F089", category: FrictionCategory.CHECKOUT, scenario: "Forced account creation blocks checkout", detection_signal: "checkout_step == registration AND exit == true", ai_action: "Enable guest checkout; move registration to post-purchase" }],
    ["F090", { id: "F090", category: FrictionCategory.CHECKOUT, scenario: "Checkout form too long (too many fields)", detection_signal: "form_field_count > 12 AND form_completion_time > 120s", ai_action: "Reduce fields; auto-fill from address API; collapse optional fields" }],
    ["F091", { id: "F091", category: FrictionCategory.CHECKOUT, scenario: "Form validation errors on submit", detection_signal: "form_error_count >= 1", ai_action: "Inline real-time validation; highlight errors clearly with fix suggestion" }],
    ["F092", { id: "F092", category: FrictionCategory.CHECKOUT, scenario: "Repeated form validation errors (same field)", detection_signal: "same_field_error_count >= 2", ai_action: "Show specific help text for that field; offer chat support" }],
    ["F093", { id: "F093", category: FrictionCategory.CHECKOUT, scenario: "Address auto-complete not working", detection_signal: "address_autocomplete_fail == true", ai_action: "Fallback to manual entry with simplified fields" }],
    ["F094", { id: "F094", category: FrictionCategory.CHECKOUT, scenario: "User pauses at payment information entry", detection_signal: "payment_field_focus_time > 30s AND input == empty", ai_action: "Show security badges near payment fields; offer PayPal/wallet alternatives" }],
    ["F095", { id: "F095", category: FrictionCategory.CHECKOUT, scenario: "Preferred payment method not available", detection_signal: "payment_method_selected == null AND payment_page_exit", ai_action: "Add more payment options; show what's available upfront" }],
    ["F096", { id: "F096", category: FrictionCategory.CHECKOUT, scenario: "Payment failed / declined", detection_signal: "payment_status == declined", ai_action: 'Show clear error message + alternative payment options + "Try again"' }],
    ["F097", { id: "F097", category: FrictionCategory.CHECKOUT, scenario: "Multiple payment attempts failed", detection_signal: "payment_attempt_count >= 2 AND status == failed", ai_action: "Offer alternative methods; provide customer support contact" }],
    ["F098", { id: "F098", category: FrictionCategory.CHECKOUT, scenario: "3D Secure / OTP verification failed", detection_signal: "3ds_status == failed", ai_action: "Explain why; offer to retry or use different card" }],
    ["F099", { id: "F099", category: FrictionCategory.CHECKOUT, scenario: "Promo code field visible but no code to enter", detection_signal: "promo_field_visible AND promo_field_focus AND exit within 60s", ai_action: "User leaves to hunt for codes — auto-apply best deal or hide empty field" }],
    ["F100", { id: "F100", category: FrictionCategory.CHECKOUT, scenario: "Shipping options confusing (too many choices)", detection_signal: "shipping_option_count > 4 AND selection_time > 45s", ai_action: "Pre-select recommended option; simplify to 2-3 choices" }],
    ["F101", { id: "F101", category: FrictionCategory.CHECKOUT, scenario: "Checkout page redirects to third party (trust break)", detection_signal: "checkout_redirect_to_external == true AND exit == true", ai_action: "Keep checkout in-domain; or show trust messaging for redirect" }],
    ["F102", { id: "F102", category: FrictionCategory.CHECKOUT, scenario: "Progress indicator missing (user doesn't know how many steps)", detection_signal: "checkout_steps > 2 AND progress_bar == false", ai_action: 'Add step indicator: "Step 2 of 3"' }],
    ["F103", { id: "F103", category: FrictionCategory.CHECKOUT, scenario: "User backtracks in checkout flow", detection_signal: "checkout_step_backward == true", ai_action: "Something in current step caused doubt — review that step's UX" }],
    ["F104", { id: "F104", category: FrictionCategory.CHECKOUT, scenario: "Billing address form when same as shipping", detection_signal: "billing_form_shown AND same_as_shipping_checked == false", ai_action: 'Default to "Same as shipping" pre-checked' }],
    ["F105", { id: "F105", category: FrictionCategory.CHECKOUT, scenario: "Slow payment processing (spinner too long)", detection_signal: "payment_processing_time > 10s", ai_action: 'Show reassuring message: "Securely processing your payment..."' }],
    ["F106", { id: "F106", category: FrictionCategory.CHECKOUT, scenario: "Order summary not visible during checkout", detection_signal: "order_summary_visible == false on payment_step", ai_action: "Show persistent order summary sidebar/accordion" }],
    ["F107", { id: "F107", category: FrictionCategory.CHECKOUT, scenario: "Unexpected fee added at final step", detection_signal: "new_fee_shown_at_final_step == true", ai_action: "Reveal all costs earlier; show running total throughout" }],
    ["F108", { id: "F108", category: FrictionCategory.CHECKOUT, scenario: "Gift option not available when needed", detection_signal: "checkout_flow AND gift_option_absent AND cart_signals_gift", ai_action: "Add gift wrap / gift message option" }],
    ["F109", { id: "F109", category: FrictionCategory.CHECKOUT, scenario: "BNPL option not prominent enough", detection_signal: "bnpl_available == true AND bnpl_selection == 0 AND cart_value > $50", ai_action: 'Show BNPL installment amount on checkout: "Or pay $X/month"' }],
    ["F110", { id: "F110", category: FrictionCategory.CHECKOUT, scenario: "Mobile keyboard covers form fields", detection_signal: "device == mobile AND keyboard_overlap_detected", ai_action: "Ensure form scrolls above keyboard; auto-scroll to active field" }],
    ["F111", { id: "F111", category: FrictionCategory.CHECKOUT, scenario: "Autofill populates wrong fields", detection_signal: "autofill_mismatch_detected == true", ai_action: "Fix form field naming/autocomplete attributes" }],
    ["F112", { id: "F112", category: FrictionCategory.CHECKOUT, scenario: "Checkout timeout / session expired", detection_signal: "session_timeout during checkout_flow", ai_action: 'Save cart state; allow instant resume with "Pick up where you left off"' }],
    ["F113", { id: "F113", category: FrictionCategory.CHECKOUT, scenario: "Terms & conditions checkbox buried or confusing", detection_signal: "tnc_checkbox_miss_count >= 1", ai_action: "Make checkbox obvious; show brief summary instead of full legal text" }],
    ["F114", { id: "F114", category: FrictionCategory.CHECKOUT, scenario: 'Final "Place Order" button not prominent', detection_signal: "place_order_button_below_fold OR low_contrast", ai_action: "Pin CTA; use high-contrast, large button" }],
    ["F115", { id: "F115", category: FrictionCategory.CHECKOUT, scenario: "Currency mismatch at checkout", detection_signal: "user_currency != checkout_currency", ai_action: "Auto-convert to user's currency or show dual prices" }],
    ["F116", { id: "F116", category: FrictionCategory.CHECKOUT, scenario: "User toggles between shipping methods repeatedly", detection_signal: "shipping_method_change >= 3", ai_action: "Show delivery speed vs. cost comparison clearly" }],
    // =======================================================================
    // CATEGORY 07: PRICING & VALUE FRICTION (F117 – F130)
    // =======================================================================
    ["F117", { id: "F117", category: FrictionCategory.PRICING, scenario: "Price higher than expected (sticker shock)", detection_signal: "pdp_exit_within < 10s AND no_interaction", ai_action: "Show value justification, comparisons, or installment option" }],
    ["F118", { id: "F118", category: FrictionCategory.PRICING, scenario: "User checks price multiple times across sessions", detection_signal: "price_view_count >= 3 across sessions", ai_action: "Trigger price drop alert or limited-time discount" }],
    ["F119", { id: "F119", category: FrictionCategory.PRICING, scenario: "Price discrepancy between listing and product page", detection_signal: "listing_price != pdp_price", ai_action: 'Fix data consistency; show "Price updated" explanation' }],
    ["F120", { id: "F120", category: FrictionCategory.PRICING, scenario: "Competitor price found lower (user left to compare)", detection_signal: "session_exit AND return_from referrer == competitor", ai_action: "Price match offer or highlight unique value (warranty, shipping)" }],
    ["F121", { id: "F121", category: FrictionCategory.PRICING, scenario: "Total cost significantly higher than item price", detection_signal: "total_cost > item_price * 1.3 (taxes/shipping)", ai_action: "Break down costs early; offer free shipping threshold" }],
    ["F122", { id: "F122", category: FrictionCategory.PRICING, scenario: "BNPL/installment info not shown on product page", detection_signal: "bnpl_available == true AND bnpl_display_on_pdp == false", ai_action: 'Show "As low as $X/month" on product page' }],
    ["F123", { id: "F123", category: FrictionCategory.PRICING, scenario: "Struck-through original price not credible", detection_signal: "original_price display AND user_trust_signals low", ai_action: 'Show "Price history" or "Verified discount" badge' }],
    ["F124", { id: "F124", category: FrictionCategory.PRICING, scenario: "Bulk/volume discount not communicated", detection_signal: "qty > 1 potential AND volume_discount_exists AND not shown", ai_action: 'Display tiered pricing table: "Buy 2, save 10%"' }],
    ["F125", { id: "F125", category: FrictionCategory.PRICING, scenario: "User compares similar products by price only", detection_signal: "product_comparison focus == price_column", ai_action: "Highlight differentiating features beyond price" }],
    ["F126", { id: "F126", category: FrictionCategory.PRICING, scenario: "Free shipping threshold just out of reach", detection_signal: "cart_total < free_shipping_min AND gap < 20%", ai_action: '"Add $X more for FREE shipping" with product suggestions' }],
    ["F127", { id: "F127", category: FrictionCategory.PRICING, scenario: "International pricing / duty confusion", detection_signal: "user_geo == international AND duty_info_absent", ai_action: 'Show landed cost calculator or "Duties included" assurance' }],
    ["F128", { id: "F128", category: FrictionCategory.PRICING, scenario: "Subscription price vs one-time price unclear", detection_signal: "subscription_option AND one_time_option AND toggle_count >= 2", ai_action: 'Clarify savings: "Subscribe & save $X per month"' }],
    ["F129", { id: "F129", category: FrictionCategory.PRICING, scenario: "Sale countdown timer feels fake/manipulative", detection_signal: "countdown_timer_displayed AND user_returns_after_expiry_and_sees_same_timer", ai_action: "Ensure genuine scarcity or remove; damages trust" }],
    ["F130", { id: "F130", category: FrictionCategory.PRICING, scenario: "Membership/loyalty discount not visible to eligible user", detection_signal: "user_loyalty_tier > 0 AND member_price_hidden", ai_action: 'Show "Your member price: $X" personalized pricing' }],
    // =======================================================================
    // CATEGORY 08: TRUST & SECURITY FRICTION (F131 – F146)
    // =======================================================================
    ["F131", { id: "F131", category: FrictionCategory.TRUST, scenario: "No SSL/security indicator visible", detection_signal: "ssl_badge_absent AND checkout_page", ai_action: "Display security badges, SSL lock icon, PCI compliance" }],
    ["F132", { id: "F132", category: FrictionCategory.TRUST, scenario: "User checks About Us / Company info before purchasing", detection_signal: "about_page_viewed AND then checkout_hesitation", ai_action: "Strengthen About page; show social proof on checkout" }],
    ["F133", { id: "F133", category: FrictionCategory.TRUST, scenario: "User reads privacy policy during checkout", detection_signal: "privacy_policy_click during checkout_flow", ai_action: 'Show privacy summary badge: "We never share your data"' }],
    ["F134", { id: "F134", category: FrictionCategory.TRUST, scenario: "No customer reviews on product", detection_signal: "review_count == 0", ai_action: 'Show editorial reviews, expert endorsements, or "Trusted by X customers"' }],
    ["F135", { id: "F135", category: FrictionCategory.TRUST, scenario: "Only negative reviews visible (sorted by recent)", detection_signal: "visible_reviews avg_rating < 3", ai_action: 'Default sort to "Most helpful"; show brand responses' }],
    ["F136", { id: "F136", category: FrictionCategory.TRUST, scenario: 'User searches for "[brand] reviews" or "[brand] scam"', detection_signal: 'search_query contains ["scam","legit","reviews","trustworthy"]', ai_action: "Surface trust signals: Trustpilot widget, guarantees, media mentions" }],
    ["F137", { id: "F137", category: FrictionCategory.TRUST, scenario: "Payment page looks different from rest of site", detection_signal: "payment_page_style_mismatch == true", ai_action: "Maintain consistent branding throughout checkout" }],
    ["F138", { id: "F138", category: FrictionCategory.TRUST, scenario: "Third-party payment redirect without explanation", detection_signal: "redirect_to_payment_gateway AND no_explanation", ai_action: 'Show "You\'ll be redirected to [PayPal/Stripe] to complete securely"' }],
    ["F139", { id: "F139", category: FrictionCategory.TRUST, scenario: "Missing return/refund policy information", detection_signal: "return_policy_page == absent OR not_linked_from_pdp", ai_action: "Add visible return policy link on every product page and cart" }],
    ["F140", { id: "F140", category: FrictionCategory.TRUST, scenario: "User hovers on security badge for details", detection_signal: "trust_badge_hover_time > 2s", ai_action: "Expand tooltip with certification details" }],
    ["F141", { id: "F141", category: FrictionCategory.TRUST, scenario: "New brand / user has never purchased before", detection_signal: "user_order_count == 0 AND checkout_page", ai_action: "Show first-order guarantee, satisfaction promise, easy return" }],
    ["F142", { id: "F142", category: FrictionCategory.TRUST, scenario: "Social proof missing (no purchase count, no testimonials)", detection_signal: "social_proof_elements == 0 on pdp", ai_action: 'Add "X people bought this" or recent purchase notifications' }],
    ["F143", { id: "F143", category: FrictionCategory.TRUST, scenario: "User visited third-party review site during session", detection_signal: "tab_switch_to review_site_detected", ai_action: "Show aggregated review score on-site; link to verified reviews" }],
    ["F144", { id: "F144", category: FrictionCategory.TRUST, scenario: "Contact information hard to find", detection_signal: "contact_page_search OR footer_scan_for_contact", ai_action: "Make phone/email/chat visible in header or floating widget" }],
    ["F145", { id: "F145", category: FrictionCategory.TRUST, scenario: "Fake urgency / dark pattern detected by user", detection_signal: "urgency_element AND bounce_correlation_high", ai_action: "Remove manipulative elements; use genuine scarcity only" }],
    ["F146", { id: "F146", category: FrictionCategory.TRUST, scenario: "International buyer worried about legitimacy", detection_signal: "user_geo == international AND multiple trust_page_views", ai_action: "Show international shipping partners, customs support, local reviews" }],
    // =======================================================================
    // CATEGORY 09: MOBILE-SPECIFIC FRICTION (F147 – F160)
    // =======================================================================
    ["F147", { id: "F147", category: FrictionCategory.MOBILE, scenario: "Fat finger / misclick on mobile", detection_signal: "unintended_click_detected (click on wrong element)", ai_action: "Increase touch target sizes; add confirmation for critical actions" }],
    ["F148", { id: "F148", category: FrictionCategory.MOBILE, scenario: "Pinch-to-zoom required (text/images too small)", detection_signal: "pinch_zoom_event_count >= 2", ai_action: "Optimize responsive design; ensure readable font sizes" }],
    ["F149", { id: "F149", category: FrictionCategory.MOBILE, scenario: "Sticky header/footer covers content", detection_signal: "scroll_with_header_overlap > 30% viewport", ai_action: "Reduce sticky element height; auto-hide on scroll down" }],
    ["F150", { id: "F150", category: FrictionCategory.MOBILE, scenario: "Form input difficult on mobile", detection_signal: "form_field_focus AND keyboard_type_mismatch", ai_action: "Use correct input types (tel, email, number) for proper keyboard" }],
    ["F151", { id: "F151", category: FrictionCategory.MOBILE, scenario: "Horizontal scrolling required", detection_signal: "horizontal_scroll_detected", ai_action: "Fix responsive breakpoints; prevent overflow" }],
    ["F152", { id: "F152", category: FrictionCategory.MOBILE, scenario: "Pop-up/modal hard to close on mobile", detection_signal: "modal_shown AND close_button_too_small AND rage_click", ai_action: "Increase close button size; add tap-outside-to-dismiss" }],
    ["F153", { id: "F153", category: FrictionCategory.MOBILE, scenario: "Page jumps during load (CLS issues)", detection_signal: "cumulative_layout_shift > 0.25", ai_action: "Reserve space for ads/images; prevent layout shifts" }],
    ["F154", { id: "F154", category: FrictionCategory.MOBILE, scenario: "Checkout form too long on mobile (excessive scrolling)", detection_signal: "checkout_form_scroll_depth > 300% viewport", ai_action: "Collapse sections; use accordion; minimize fields" }],
    ["F155", { id: "F155", category: FrictionCategory.MOBILE, scenario: "App install banner blocks content", detection_signal: "app_banner_shown AND dismiss_time > 3s", ai_action: "Show non-intrusive inline banner instead" }],
    ["F156", { id: "F156", category: FrictionCategory.MOBILE, scenario: "Touch carousel difficult to use", detection_signal: "carousel_swipe_failure_count >= 2", ai_action: "Improve swipe sensitivity or switch to tap navigation" }],
    ["F157", { id: "F157", category: FrictionCategory.MOBILE, scenario: "Product images too small on mobile", detection_signal: "image_zoom_attempt on mobile >= 2", ai_action: "Enable tap-to-fullscreen gallery" }],
    ["F158", { id: "F158", category: FrictionCategory.MOBILE, scenario: "Slow network on mobile (3G/poor connection)", detection_signal: "connection_speed < 1mbps", ai_action: "Serve compressed images; lazy load; show offline-ready cached content" }],
    ["F159", { id: "F159", category: FrictionCategory.MOBILE, scenario: 'Bottom navigation covers "Add to Cart"', detection_signal: "atc_button_obscured_by_nav == true", ai_action: "Reposition ATC above bottom nav; or integrate into sticky bar" }],
    ["F160", { id: "F160", category: FrictionCategory.MOBILE, scenario: 'Mobile keyboard overlaps "Place Order" button', detection_signal: "keyboard_open AND place_order_obscured", ai_action: "Auto-scroll to keep CTA visible above keyboard" }],
    // =======================================================================
    // CATEGORY 10: TECHNICAL & PERFORMANCE FRICTION (F161 – F177)
    // =======================================================================
    ["F161", { id: "F161", category: FrictionCategory.TECHNICAL, scenario: "Page crash / unresponsive", detection_signal: "page_crash_event == true", ai_action: 'Auto-reload; save user state; show "Something went wrong" with retry' }],
    ["F162", { id: "F162", category: FrictionCategory.TECHNICAL, scenario: "JavaScript error preventing interaction", detection_signal: "js_error_count > 0 on critical_element", ai_action: "Fallback UI; error logging; degrade gracefully" }],
    ["F163", { id: "F163", category: FrictionCategory.TECHNICAL, scenario: "Image not loading (broken image)", detection_signal: "image_load_error == true on pdp", ai_action: "Show placeholder; lazy retry; log for content team" }],
    ["F164", { id: "F164", category: FrictionCategory.TECHNICAL, scenario: "Video won't play", detection_signal: "video_play_error == true", ai_action: "Show thumbnail + transcript; offer alternative format" }],
    ["F165", { id: "F165", category: FrictionCategory.TECHNICAL, scenario: "Checkout form submit fails silently", detection_signal: "form_submit AND no_response AND no_error_shown", ai_action: "Show explicit success/failure feedback" }],
    ["F166", { id: "F166", category: FrictionCategory.TECHNICAL, scenario: "Cart data lost after page refresh", detection_signal: "cart_items_before_refresh > 0 AND cart_items_after == 0", ai_action: "Persist cart server-side; recover on refresh" }],
    ["F167", { id: "F167", category: FrictionCategory.TECHNICAL, scenario: "Session expired during shopping", detection_signal: "session_expired AND cart_items > 0", ai_action: "Preserve cart; auto-restore on return; extend timeout" }],
    ["F168", { id: "F168", category: FrictionCategory.TECHNICAL, scenario: "Infinite loading spinner", detection_signal: "spinner_visible > 15s", ai_action: "Timeout and show error with retry; don't leave user hanging" }],
    ["F169", { id: "F169", category: FrictionCategory.TECHNICAL, scenario: "Search functionality broken", detection_signal: "search_submit AND response_error", ai_action: 'Show fallback: popular categories + "Browse instead"' }],
    ["F170", { id: "F170", category: FrictionCategory.TECHNICAL, scenario: "Filter/sort not responding", detection_signal: "filter_click AND no_result_change AND no_loader", ai_action: "Fix filter logic; show loading state" }],
    ["F171", { id: "F171", category: FrictionCategory.TECHNICAL, scenario: "Duplicate charges / double-submit", detection_signal: "place_order_click_count >= 2 within 5s", ai_action: "Disable button after first click; show processing state" }],
    ["F172", { id: "F172", category: FrictionCategory.TECHNICAL, scenario: "Add-to-cart button unresponsive", detection_signal: "atc_click AND no_cart_update", ai_action: "Fix handler; show loading feedback on click" }],
    ["F173", { id: "F173", category: FrictionCategory.TECHNICAL, scenario: "CAPTCHA blocks checkout flow", detection_signal: "captcha_shown at checkout AND captcha_fail", ai_action: "Use invisible CAPTCHA or risk-based challenge only" }],
    ["F174", { id: "F174", category: FrictionCategory.TECHNICAL, scenario: "Third-party script slowing page", detection_signal: "third_party_script_load > 2s", ai_action: "Async load; defer non-critical scripts" }],
    ["F175", { id: "F175", category: FrictionCategory.TECHNICAL, scenario: "Price rounding / calculation error displayed", detection_signal: "displayed_total != sum(items + tax + shipping)", ai_action: "Fix calculation logic; show itemized breakdown" }],
    ["F176", { id: "F176", category: FrictionCategory.TECHNICAL, scenario: "Browser back breaks checkout state", detection_signal: "back_button during checkout AND state_lost", ai_action: "Maintain checkout state with history API; warn before leaving" }],
    ["F177", { id: "F177", category: FrictionCategory.TECHNICAL, scenario: "WebSocket/live feature disconnection", detection_signal: "live_feature_disconnected == true", ai_action: 'Auto-reconnect; show "Reconnecting..." status' }],
    // =======================================================================
    // CATEGORY 11: CONTENT & INFORMATION FRICTION (F178 – F191)
    // =======================================================================
    ["F178", { id: "F178", category: FrictionCategory.CONTENT, scenario: "Product description too short / vague", detection_signal: "description_word_count < 30 AND bounce_rate_high", ai_action: "Enrich with AI-generated details; add specs and FAQs" }],
    ["F179", { id: "F179", category: FrictionCategory.CONTENT, scenario: "Product description too long / overwhelming", detection_signal: "description_word_count > 500 AND scroll_past_without_reading", ai_action: "Add TL;DR summary; use expandable sections" }],
    ["F180", { id: "F180", category: FrictionCategory.CONTENT, scenario: "Product images low quality / insufficient", detection_signal: "image_count < 3 OR image_resolution < 500px", ai_action: "Add more angles; enable user-uploaded photos" }],
    ["F181", { id: "F181", category: FrictionCategory.CONTENT, scenario: "No product video available", detection_signal: "video_available == false AND category_avg_has_video", ai_action: "Add product video; even simple 360-spin" }],
    ["F182", { id: "F182", category: FrictionCategory.CONTENT, scenario: "Missing size/fit information", detection_signal: "size_info_absent AND category == apparel/shoes", ai_action: "Add size guide, fit predictor, or AR try-on" }],
    ["F183", { id: "F183", category: FrictionCategory.CONTENT, scenario: "Product specs inconsistent with images", detection_signal: "spec_mismatch_flagged OR high_return_rate_for_product", ai_action: "Audit and fix content accuracy" }],
    ["F184", { id: "F184", category: FrictionCategory.CONTENT, scenario: "Delivery/shipping info not visible on product page", detection_signal: "shipping_info_on_pdp == false", ai_action: "Show estimated delivery date and cost on product page" }],
    ["F185", { id: "F185", category: FrictionCategory.CONTENT, scenario: "Return policy hard to find from product page", detection_signal: "return_policy_link_on_pdp == false", ai_action: 'Add inline return info: "Free returns within 30 days"' }],
    ["F186", { id: "F186", category: FrictionCategory.CONTENT, scenario: "Sustainability/ethical info missing when user looks for it", detection_signal: "sustainability_page_search AND content_absent", ai_action: "Add sustainability badges and info if applicable" }],
    ["F187", { id: "F187", category: FrictionCategory.CONTENT, scenario: "Comparison info missing between similar products", detection_signal: "user_views_similar_products >= 3 AND comparison_tool == false", ai_action: "Offer side-by-side comparison tool" }],
    ["F188", { id: "F188", category: FrictionCategory.CONTENT, scenario: "FAQ section missing or outdated", detection_signal: "faq_section == absent OR faq_last_updated > 180_days", ai_action: "Generate dynamic FAQ from common customer queries" }],
    ["F189", { id: "F189", category: FrictionCategory.CONTENT, scenario: "Product labels/badges confusing (too many)", detection_signal: "badge_count_on_product > 4", ai_action: "Limit to 2-3 most impactful badges" }],
    ["F190", { id: "F190", category: FrictionCategory.CONTENT, scenario: "Ingredient/material info missing for sensitive categories", detection_signal: "category in [beauty, food, supplements] AND ingredient_list == absent", ai_action: "Add ingredient list; required for informed purchasing" }],
    ["F191", { id: "F191", category: FrictionCategory.CONTENT, scenario: "Conflicting information between product page and cart", detection_signal: "pdp_info != cart_info (price, name, variant)", ai_action: "Sync all data sources; audit consistency" }],
    // =======================================================================
    // CATEGORY 12: PERSONALIZATION FRICTION (F192 – F202)
    // =======================================================================
    ["F192", { id: "F192", category: FrictionCategory.PERSONALIZATION, scenario: "Irrelevant product recommendations", detection_signal: "recommendation_click_rate < 2% for user_segment", ai_action: "Refine recommendation model; use collaborative filtering" }],
    ["F193", { id: "F193", category: FrictionCategory.PERSONALIZATION, scenario: "Recommendations show already-purchased items", detection_signal: "recommended_product in user_purchase_history", ai_action: "Exclude purchased items from recommendations" }],
    ["F194", { id: "F194", category: FrictionCategory.PERSONALIZATION, scenario: "Not recognizing returning customer", detection_signal: "returning_user AND experience == generic", ai_action: 'Personalize: "Welcome back" + recently viewed + saved cart' }],
    ["F195", { id: "F195", category: FrictionCategory.PERSONALIZATION, scenario: "Showing wrong gender/demographic products", detection_signal: "user_profile_gender != recommended_product_gender", ai_action: "Respect user preference data in recommendations" }],
    ["F196", { id: "F196", category: FrictionCategory.PERSONALIZATION, scenario: "Email personalization mismatch (wrong name/product)", detection_signal: "email_opened AND name_mismatch OR product_irrelevant", ai_action: "Audit personalization data pipeline" }],
    ["F197", { id: "F197", category: FrictionCategory.PERSONALIZATION, scenario: "Personalized pricing perceived as unfair", detection_signal: "same_product_different_price_for_different_users_detected", ai_action: "Ensure transparent pricing; avoid discriminatory pricing" }],
    ["F198", { id: "F198", category: FrictionCategory.PERSONALIZATION, scenario: "Quiz/preference tool result feels wrong", detection_signal: "quiz_completed AND result_page_exit_within < 15s", ai_action: 'Allow "Not quite right" refinement; show alternative results' }],
    ["F199", { id: "F199", category: FrictionCategory.PERSONALIZATION, scenario: '"Based on your browsing" shows embarrassing/private items', detection_signal: "sensitive_category in browsing_history AND recommendation_shown", ai_action: "Exclude sensitive categories from visible recommendations" }],
    ["F200", { id: "F200", category: FrictionCategory.PERSONALIZATION, scenario: "Geo-based content wrong (travel, VPN)", detection_signal: "geo_detected_location != actual_location", ai_action: "Allow manual location override" }],
    ["F201", { id: "F201", category: FrictionCategory.PERSONALIZATION, scenario: "Language auto-detection wrong", detection_signal: "detected_language != user_preferred_language", ai_action: "Show easy language switcher; remember preference" }],
    ["F202", { id: "F202", category: FrictionCategory.PERSONALIZATION, scenario: "Recently viewed section cluttered with irrelevant items", detection_signal: "recently_viewed_count > 20 AND relevance_score_low", ai_action: 'Show smart "Recently Viewed" with category grouping' }],
    // =======================================================================
    // CATEGORY 13: SOCIAL PROOF & URGENCY FRICTION (F203 – F211)
    // =======================================================================
    ["F203", { id: "F203", category: FrictionCategory.SOCIAL_PROOF, scenario: "No reviews on product", detection_signal: "review_count == 0", ai_action: 'Show "First to review" CTA; display category-level trust stats' }],
    ["F204", { id: "F204", category: FrictionCategory.SOCIAL_PROOF, scenario: "Reviews feel fake or unverified", detection_signal: "review_verified_badge_absent AND reviews_all_5_star", ai_action: 'Add "Verified Purchase" badges; show balanced reviews' }],
    ["F205", { id: "F205", category: FrictionCategory.SOCIAL_PROOF, scenario: "Social proof notifications annoying (too frequent)", detection_signal: "social_proof_popup_frequency > 1_per_30s", ai_action: "Reduce frequency; make dismissible; respect user preference" }],
    ["F206", { id: "F206", category: FrictionCategory.SOCIAL_PROOF, scenario: "Urgency timer feels manipulative", detection_signal: "timer_resets_on_refresh OR same_timer_across_days", ai_action: "Use genuine stock-based scarcity only" }],
    ["F207", { id: "F207", category: FrictionCategory.SOCIAL_PROOF, scenario: '"X people viewing this" feels fake', detection_signal: "concurrent_viewer_count_static OR inflated", ai_action: "Use real data or remove; authenticity builds trust" }],
    ["F208", { id: "F208", category: FrictionCategory.SOCIAL_PROOF, scenario: "Low stock warning but stock never decreases", detection_signal: "low_stock_shown AND stock_level_unchanged_for_days", ai_action: "Use real inventory data; remove if not genuine" }],
    ["F209", { id: "F209", category: FrictionCategory.SOCIAL_PROOF, scenario: "No social media presence / proof", detection_signal: "social_links_absent OR social_follower_count_low", ai_action: "Build social presence; show UGC if available" }],
    ["F210", { id: "F210", category: FrictionCategory.SOCIAL_PROOF, scenario: "Influencer endorsement feels inauthentic", detection_signal: "influencer_content AND negative_sentiment_in_comments", ai_action: "Use micro-influencer authentic reviews instead" }],
    ["F211", { id: "F211", category: FrictionCategory.SOCIAL_PROOF, scenario: 'Testimonials too generic ("Great product!")', detection_signal: "testimonial_word_count < 10 for all displayed", ai_action: "Curate detailed, specific testimonials with use cases" }],
    // =======================================================================
    // CATEGORY 14: COMMUNICATION & NOTIFICATION FRICTION (F212 – F224)
    // =======================================================================
    ["F212", { id: "F212", category: FrictionCategory.COMMUNICATION, scenario: "Abandoned cart email too early (within minutes)", detection_signal: "abandon_email_sent_within < 300s", ai_action: "Delay first email to 1-4 hours" }],
    ["F213", { id: "F213", category: FrictionCategory.COMMUNICATION, scenario: "Abandoned cart email too late (days later)", detection_signal: "abandon_email_sent_after > 72h", ai_action: "Optimize timing: 1h -> 24h -> 72h cadence" }],
    ["F214", { id: "F214", category: FrictionCategory.COMMUNICATION, scenario: "Too many marketing emails causing unsubscribe", detection_signal: "email_frequency > 5_per_week AND unsubscribe == true", ai_action: "Reduce frequency; let users set preferences" }],
    ["F215", { id: "F215", category: FrictionCategory.COMMUNICATION, scenario: "Push notifications too frequent / irrelevant", detection_signal: "push_frequency > 3_per_day OR push_relevance_low", ai_action: "Reduce; personalize based on behavior" }],
    ["F216", { id: "F216", category: FrictionCategory.COMMUNICATION, scenario: "SMS marketing without opt-in consent", detection_signal: "sms_sent AND opt_in == false", ai_action: "Ensure compliance; get explicit consent" }],
    ["F217", { id: "F217", category: FrictionCategory.COMMUNICATION, scenario: "Notification arrives at wrong time (timezone)", detection_signal: "notification_sent_at AND user_local_time == sleep_hours", ai_action: "Send in user's timezone during active hours" }],
    ["F218", { id: "F218", category: FrictionCategory.COMMUNICATION, scenario: "Customer service response too slow", detection_signal: "support_ticket_age > 24h AND unresolved", ai_action: "Escalate; send acknowledgment; offer alternatives" }],
    ["F219", { id: "F219", category: FrictionCategory.COMMUNICATION, scenario: "Live chat unavailable when needed", detection_signal: "chat_icon_clicked AND agents_online == 0", ai_action: 'Show chatbot fallback; collect contact for callback' }],
    ["F220", { id: "F220", category: FrictionCategory.COMMUNICATION, scenario: "Chatbot can't understand user query", detection_signal: "chatbot_intent_confidence < 0.3", ai_action: 'Escalate to human agent; show "Talk to a person" option' }],
    ["F221", { id: "F221", category: FrictionCategory.COMMUNICATION, scenario: "Chatbot loops without resolution", detection_signal: "chatbot_loop_count >= 3", ai_action: "Force human handoff; apologize for inconvenience" }],
    ["F222", { id: "F222", category: FrictionCategory.COMMUNICATION, scenario: "Order confirmation email delayed", detection_signal: "order_placed AND confirmation_email_sent_after > 300s", ai_action: "Send instant confirmation; queue detailed follow-up" }],
    ["F223", { id: "F223", category: FrictionCategory.COMMUNICATION, scenario: "Shipping notification missing", detection_signal: "order_shipped AND shipping_email_sent == false", ai_action: "Automate shipping notification with tracking link" }],
    ["F224", { id: "F224", category: FrictionCategory.COMMUNICATION, scenario: "Marketing email content doesn't match landing page", detection_signal: "email_offer != landing_page_offer", ai_action: "Sync email campaigns with live site content" }],
    // =======================================================================
    // CATEGORY 15: ACCOUNT & AUTHENTICATION FRICTION (F225 – F235)
    // =======================================================================
    ["F225", { id: "F225", category: FrictionCategory.ACCOUNT, scenario: "Forgot password during checkout", detection_signal: "password_reset_initiated during checkout_flow", ai_action: "Offer guest checkout immediately; simplify reset" }],
    ["F226", { id: "F226", category: FrictionCategory.ACCOUNT, scenario: "Social login fails", detection_signal: "social_login_attempt AND social_login_error", ai_action: "Offer alternative login methods; show clear error message" }],
    ["F227", { id: "F227", category: FrictionCategory.ACCOUNT, scenario: "Account creation form too long", detection_signal: "registration_form_fields > 6 AND registration_abandon == true", ai_action: "Reduce to email + password; collect details later" }],
    ["F228", { id: "F228", category: FrictionCategory.ACCOUNT, scenario: "Email verification blocks immediate shopping", detection_signal: "email_verification_required AND delay > 0", ai_action: "Allow shopping immediately; verify before checkout" }],
    ["F229", { id: "F229", category: FrictionCategory.ACCOUNT, scenario: "Password requirements too strict", detection_signal: "password_error_count >= 2 on strength_validation", ai_action: "Show requirements upfront; use password strength meter" }],
    ["F230", { id: "F230", category: FrictionCategory.ACCOUNT, scenario: "Two-factor auth friction at login", detection_signal: "2fa_step AND login_abandon == true", ai_action: 'Offer "Remember this device" option' }],
    ["F231", { id: "F231", category: FrictionCategory.ACCOUNT, scenario: "Account locked after failed attempts", detection_signal: "login_attempt_count >= 5 AND account_locked", ai_action: "Clear unlock path; offer alternative verification" }],
    ["F232", { id: "F232", category: FrictionCategory.ACCOUNT, scenario: "Guest checkout not remembered on return", detection_signal: "returning_user AND previous_order_as_guest AND no_recognition", ai_action: 'Offer "Link to account" with previous order data' }],
    ["F233", { id: "F233", category: FrictionCategory.ACCOUNT, scenario: "Saved payment method expired", detection_signal: "saved_payment_expired == true during checkout", ai_action: "Prompt to update; pre-fill card form" }],
    ["F234", { id: "F234", category: FrictionCategory.ACCOUNT, scenario: "Profile data outdated (old address, old name)", detection_signal: "profile_last_updated > 365d AND checkout_address_changed", ai_action: "Prompt profile update after checkout" }],
    ["F235", { id: "F235", category: FrictionCategory.ACCOUNT, scenario: "Login prompt during browsing interrupts flow", detection_signal: "login_modal_shown during browsing AND dismiss == true", ai_action: "Defer login to cart/checkout; don't interrupt browsing" }],
    // =======================================================================
    // CATEGORY 16: SHIPPING & DELIVERY FRICTION (F236 – F247)
    // =======================================================================
    ["F236", { id: "F236", category: FrictionCategory.SHIPPING, scenario: "Shipping cost too high", detection_signal: "shipping_cost > 15% of cart_value AND exit == true", ai_action: "Offer free shipping threshold; show cheaper options" }],
    ["F237", { id: "F237", category: FrictionCategory.SHIPPING, scenario: "Shipping cost not shown until checkout", detection_signal: "shipping_cost_first_shown_at == checkout", ai_action: "Show estimated shipping on product page and cart" }],
    ["F238", { id: "F238", category: FrictionCategory.SHIPPING, scenario: "Delivery estimate too slow", detection_signal: "estimated_delivery > 7_days AND exit == true", ai_action: "Offer express option; show competitor delivery comparison" }],
    ["F239", { id: "F239", category: FrictionCategory.SHIPPING, scenario: "No express/overnight shipping available", detection_signal: "express_shipping_available == false AND user_urgency_signals", ai_action: "Add express option or partner with faster carrier" }],
    ["F240", { id: "F240", category: FrictionCategory.SHIPPING, scenario: "International shipping not available", detection_signal: "user_geo == international AND intl_shipping == false", ai_action: 'Show "Coming soon to your country" + notify signup' }],
    ["F241", { id: "F241", category: FrictionCategory.SHIPPING, scenario: "No in-store pickup option", detection_signal: "bopis_available == false AND user_near_store", ai_action: "Enable BOPIS if feasible" }],
    ["F242", { id: "F242", category: FrictionCategory.SHIPPING, scenario: 'Delivery date range too wide ("5-15 business days")', detection_signal: "delivery_range > 10_days", ai_action: "Narrow estimates; use carrier API for precision" }],
    ["F243", { id: "F243", category: FrictionCategory.SHIPPING, scenario: "No order tracking available", detection_signal: "tracking_available == false", ai_action: "Partner with trackable carrier; send updates proactively" }],
    ["F244", { id: "F244", category: FrictionCategory.SHIPPING, scenario: "Shipping to PO Box not supported", detection_signal: "address_type == po_box AND shipping_error", ai_action: "Clearly state PO Box policy; offer alternatives" }],
    ["F245", { id: "F245", category: FrictionCategory.SHIPPING, scenario: "Shipping address validation failure", detection_signal: "address_validation_error == true", ai_action: 'Use address suggestion API; show "Did you mean...?"' }],
    ["F246", { id: "F246", category: FrictionCategory.SHIPPING, scenario: "Split shipment not communicated", detection_signal: "order_ships_in_multiple AND notification_absent", ai_action: 'Notify: "Your order will arrive in 2 packages"' }],
    ["F247", { id: "F247", category: FrictionCategory.SHIPPING, scenario: "Delivery attempted but failed", detection_signal: "delivery_failed AND no_redelivery_option", ai_action: "Offer redelivery scheduling or pickup location" }],
    // =======================================================================
    // CATEGORY 17: RETURN & REFUND FRICTION (F248 – F257)
    // =======================================================================
    ["F248", { id: "F248", category: FrictionCategory.RETURNS, scenario: "Return process too complicated", detection_signal: "return_steps > 4 OR return_page_bounce_rate_high", ai_action: "Simplify: one-click return initiation" }],
    ["F249", { id: "F249", category: FrictionCategory.RETURNS, scenario: "Return shipping cost falls on customer", detection_signal: "return_shipping_free == false AND return_initiation_abandon", ai_action: "Offer free returns or prepaid labels" }],
    ["F250", { id: "F250", category: FrictionCategory.RETURNS, scenario: "Refund processing too slow", detection_signal: "refund_initiated AND refund_completed_after > 14_days", ai_action: "Speed up refund; send status updates" }],
    ["F251", { id: "F251", category: FrictionCategory.RETURNS, scenario: "Return window too short", detection_signal: "return_window < 14_days AND return_policy_bounce", ai_action: "Extend return window; show prominently" }],
    ["F252", { id: "F252", category: FrictionCategory.RETURNS, scenario: "No exchange option (return only)", detection_signal: "exchange_option_available == false AND return_reason == wrong_size", ai_action: "Offer direct exchange with instant shipping" }],
    ["F253", { id: "F253", category: FrictionCategory.RETURNS, scenario: "Return label generation broken", detection_signal: "return_label_request AND error", ai_action: "Provide manual instructions; email label as backup" }],
    ["F254", { id: "F254", category: FrictionCategory.RETURNS, scenario: "No return status tracking", detection_signal: "return_shipped AND tracking_absent", ai_action: "Add return tracking; send confirmation emails" }],
    ["F255", { id: "F255", category: FrictionCategory.RETURNS, scenario: "Restocking fee not disclosed upfront", detection_signal: "restocking_fee_shown_at == return_confirmation_only", ai_action: "Disclose fees on product page and at purchase" }],
    ["F256", { id: "F256", category: FrictionCategory.RETURNS, scenario: "Return policy different for sale items", detection_signal: "sale_item_return_policy_different AND not_disclosed", ai_action: "Clearly flag non-returnable sale items before purchase" }],
    ["F257", { id: "F257", category: FrictionCategory.RETURNS, scenario: "Refund to original payment method only (no store credit option)", detection_signal: "refund_method == original_only AND user_wants_store_credit", ai_action: "Offer both options: refund or store credit (with bonus)" }],
    // =======================================================================
    // CATEGORY 18: POST-PURCHASE FRICTION (F258 – F268)
    // =======================================================================
    ["F258", { id: "F258", category: FrictionCategory.POST_PURCHASE, scenario: "Order confirmation page unclear", detection_signal: "confirmation_page AND support_contact_within < 300s", ai_action: "Clarify order details, delivery timeline, next steps" }],
    ["F259", { id: "F259", category: FrictionCategory.POST_PURCHASE, scenario: "No post-purchase engagement", detection_signal: "order_complete AND next_touchpoint == none for 30d", ai_action: "Send thank-you email, care tips, complementary product suggestions" }],
    ["F260", { id: "F260", category: FrictionCategory.POST_PURCHASE, scenario: "Product doesn't match expectations (returns)", detection_signal: 'return_reason == "not as described"', ai_action: "Improve product content accuracy for that SKU" }],
    ["F261", { id: "F261", category: FrictionCategory.POST_PURCHASE, scenario: "Reorder process difficult", detection_signal: "reorder_attempt AND friction_detected", ai_action: "Enable one-click reorder from order history" }],
    ["F262", { id: "F262", category: FrictionCategory.POST_PURCHASE, scenario: "Subscription management hard to find", detection_signal: 'subscription_manage_page_search OR support_ticket == "cancel subscription"', ai_action: "Make subscription management prominent in account" }],
    ["F263", { id: "F263", category: FrictionCategory.POST_PURCHASE, scenario: "Review request sent too early (before delivery)", detection_signal: "review_email_sent AND delivery_status != delivered", ai_action: "Trigger review request only after confirmed delivery" }],
    ["F264", { id: "F264", category: FrictionCategory.POST_PURCHASE, scenario: "No loyalty reward after purchase", detection_signal: "loyalty_eligible AND points_not_awarded", ai_action: "Auto-credit points; send confirmation" }],
    ["F265", { id: "F265", category: FrictionCategory.POST_PURCHASE, scenario: "Cross-sell email not relevant to purchase", detection_signal: "cross_sell_email AND product_relevance_score < 0.3", ai_action: "Improve recommendation model; use purchase context" }],
    ["F266", { id: "F266", category: FrictionCategory.POST_PURCHASE, scenario: "Package arrived damaged", detection_signal: "damage_report_filed == true", ai_action: "Expedite replacement; pre-approve refund" }],
    ["F267", { id: "F267", category: FrictionCategory.POST_PURCHASE, scenario: "Invoice/receipt not easily accessible", detection_signal: 'invoice_download_search OR support_ticket == "receipt"', ai_action: "Auto-email invoice; add to order history page" }],
    ["F268", { id: "F268", category: FrictionCategory.POST_PURCHASE, scenario: "Order modification not possible after placement", detection_signal: "order_edit_attempt AND edit_window_closed", ai_action: "Allow 30-min edit window; or show cancellation option" }],
    // =======================================================================
    // CATEGORY 19: RE-ENGAGEMENT FRICTION (F269 – F277)
    // =======================================================================
    ["F269", { id: "F269", category: FrictionCategory.RE_ENGAGEMENT, scenario: "Returning user's cart is empty (was full before)", detection_signal: "returning_user AND previous_cart_items > 0 AND current_cart == 0", ai_action: 'Restore saved cart: "Welcome back! Your items are still here"' }],
    ["F270", { id: "F270", category: FrictionCategory.RE_ENGAGEMENT, scenario: "Returning user can't find previously viewed product", detection_signal: "returning_user AND search_for_previous_product", ai_action: 'Show "Recently Viewed" prominently; enable persistent history' }],
    ["F271", { id: "F271", category: FrictionCategory.RE_ENGAGEMENT, scenario: "Win-back email ignored", detection_signal: "winback_email_sent_count >= 2 AND open_rate == 0", ai_action: "Try different channel (SMS, push, retargeting ad)" }],
    ["F272", { id: "F272", category: FrictionCategory.RE_ENGAGEMENT, scenario: "Previously purchased product now discontinued", detection_signal: "reorder_attempt AND product_status == discontinued", ai_action: "Show successor product or close alternative" }],
    ["F273", { id: "F273", category: FrictionCategory.RE_ENGAGEMENT, scenario: "Loyalty points about to expire", detection_signal: "loyalty_points_expiry < 30d AND user_inactive", ai_action: 'Notify: "You have $X in points expiring — use them now"' }],
    ["F274", { id: "F274", category: FrictionCategory.RE_ENGAGEMENT, scenario: "User downgraded (was VIP, now inactive)", detection_signal: "user_tier_decreased AND session_started", ai_action: "Offer win-back incentive to restore tier" }],
    ["F275", { id: "F275", category: FrictionCategory.RE_ENGAGEMENT, scenario: "Subscription cancelled user browsing again", detection_signal: "subscription_status == cancelled AND session_active", ai_action: 'Show "Restart and save" or "What\'s new since you left"' }],
    ["F276", { id: "F276", category: FrictionCategory.RE_ENGAGEMENT, scenario: "Seasonal shopper not returning this season", detection_signal: "seasonal_buyer AND no_visit_in_season", ai_action: "Proactive outreach with seasonal recommendations" }],
    ["F277", { id: "F277", category: FrictionCategory.RE_ENGAGEMENT, scenario: "Wishlist items on sale but user not notified", detection_signal: "wishlist_item_price_drop AND notification_sent == false", ai_action: "Send price drop alert for wishlisted items" }],
    // =======================================================================
    // CATEGORY 20: ACCESSIBILITY FRICTION (F278 – F286)
    // =======================================================================
    ["F278", { id: "F278", category: FrictionCategory.ACCESSIBILITY, scenario: "Screen reader can't parse product page", detection_signal: "aria_labels_missing OR heading_structure_broken", ai_action: "Fix semantic HTML; add ARIA labels" }],
    ["F279", { id: "F279", category: FrictionCategory.ACCESSIBILITY, scenario: "Keyboard navigation trapped in modal", detection_signal: "focus_trap_in_modal AND escape_key_not_working", ai_action: "Ensure keyboard trap release; add visible close" }],
    ["F280", { id: "F280", category: FrictionCategory.ACCESSIBILITY, scenario: "Color contrast insufficient", detection_signal: "contrast_ratio < 4.5:1 on text_elements", ai_action: "Increase contrast to WCAG AA compliance" }],
    ["F281", { id: "F281", category: FrictionCategory.ACCESSIBILITY, scenario: "No alt text on product images", detection_signal: "alt_text_missing on product_images", ai_action: "Add descriptive alt text for all images" }],
    ["F282", { id: "F282", category: FrictionCategory.ACCESSIBILITY, scenario: "Form labels missing / not associated", detection_signal: "label_for_mismatch OR label_absent", ai_action: "Fix label-input associations" }],
    ["F283", { id: "F283", category: FrictionCategory.ACCESSIBILITY, scenario: "Touch targets too small (mobile)", detection_signal: "touch_target_size < 44px", ai_action: "Increase to minimum 44x44px" }],
    ["F284", { id: "F284", category: FrictionCategory.ACCESSIBILITY, scenario: "Animation causes motion sickness", detection_signal: "animation_intense AND prefers_reduced_motion_ignored", ai_action: "Respect prefers-reduced-motion media query" }],
    ["F285", { id: "F285", category: FrictionCategory.ACCESSIBILITY, scenario: "Timeout without warning (accessibility need)", detection_signal: "session_timeout AND no_warning AND user_pace_slow", ai_action: "Extend timeout; add warning; allow extension" }],
    ["F286", { id: "F286", category: FrictionCategory.ACCESSIBILITY, scenario: "Error messages not announced to screen reader", detection_signal: "form_error AND aria_live_absent", ai_action: 'Add aria-live="assertive" on error regions' }],
    // =======================================================================
    // CATEGORY 21: MULTI-CHANNEL & CROSS-DEVICE FRICTION (F287 – F294)
    // =======================================================================
    ["F287", { id: "F287", category: FrictionCategory.CROSS_CHANNEL, scenario: "Cart not synced across devices", detection_signal: "cart_on_device_A != cart_on_device_B for same_user", ai_action: "Sync cart via user account in real-time" }],
    ["F288", { id: "F288", category: FrictionCategory.CROSS_CHANNEL, scenario: "Wishlist not accessible on other device", detection_signal: "wishlist_on_device_A AND not_on_device_B", ai_action: "Cloud-sync wishlist for logged-in users" }],
    ["F289", { id: "F289", category: FrictionCategory.CROSS_CHANNEL, scenario: "Mobile app experience inconsistent with web", detection_signal: "feature_parity_gap between app and web", ai_action: "Audit and align feature set" }],
    ["F290", { id: "F290", category: FrictionCategory.CROSS_CHANNEL, scenario: "In-store inventory shown as online-only", detection_signal: "stock_location_type == online_only AND user_near_store", ai_action: 'Show "Available at [Store]" with real-time inventory' }],
    ["F291", { id: "F291", category: FrictionCategory.CROSS_CHANNEL, scenario: "BOPIS item not ready at promised time", detection_signal: "bopis_ready_time > promised_time", ai_action: "Send delay notification; offer compensation" }],
    ["F292", { id: "F292", category: FrictionCategory.CROSS_CHANNEL, scenario: "Email link opens mobile web instead of app", detection_signal: "email_link_opens == mobile_web AND app_installed", ai_action: "Use deep links to open in app" }],
    ["F293", { id: "F293", category: FrictionCategory.CROSS_CHANNEL, scenario: "Promo code from email doesn't work online", detection_signal: "promo_code_from_email AND online_validation_fail", ai_action: "Sync promotional systems across all channels" }],
    ["F294", { id: "F294", category: FrictionCategory.CROSS_CHANNEL, scenario: "Different prices on app vs website", detection_signal: "app_price != web_price for same_product", ai_action: "Unify pricing engine across platforms" }],
    // =======================================================================
    // CATEGORY 22: DECISION PARALYSIS FRICTION (F295 – F302)
    // =======================================================================
    ["F295", { id: "F295", category: FrictionCategory.DECISION, scenario: "Too many similar products (overwhelm)", detection_signal: "category_viewed AND product_count > 50 AND scroll_depth < 20% AND exit", ai_action: 'Show "Top Picks" or AI-curated shortlist' }],
    ["F296", { id: "F296", category: FrictionCategory.DECISION, scenario: "User views 10+ products without adding any to cart", detection_signal: "pdp_view_count >= 10 AND add_to_cart == 0", ai_action: 'Offer "Need help deciding?" quiz or comparison tool' }],
    ["F297", { id: "F297", category: FrictionCategory.DECISION, scenario: "User toggles between 2-3 products repeatedly", detection_signal: "product_toggle_count >= 4 between same products", ai_action: "Show side-by-side comparison automatically" }],
    ["F298", { id: "F298", category: FrictionCategory.DECISION, scenario: "User adds multiple similar items then removes all but one", detection_signal: "add_similar_items >= 3 then remove_all_but_1", ai_action: 'Confirm choice: "Great pick! Here\'s why others love it"' }],
    ["F299", { id: "F299", category: FrictionCategory.DECISION, scenario: "Variant selection takes too long", detection_signal: "variant_interaction_time > 60s AND add_to_cart == false", ai_action: 'Offer "Most popular" variant badge or "Recommended for you"' }],
    ["F300", { id: "F300", category: FrictionCategory.DECISION, scenario: "Gift shopper doesn't know what to pick", detection_signal: "gift_signals == true AND session_duration > 600s AND cart == empty", ai_action: 'Offer gift guides, gift cards, or "Shop by recipient" tool' }],
    ["F301", { id: "F301", category: FrictionCategory.DECISION, scenario: "User reads comparisons but doesn't choose", detection_signal: "comparison_tool_used AND no_selection_within 300s", ai_action: 'Show "Editor\'s Pick" or "Best Value" recommendation' }],
    ["F302", { id: "F302", category: FrictionCategory.DECISION, scenario: "Bundle vs individual items confusion", detection_signal: "bundle_viewed AND individual_viewed AND toggle >= 3", ai_action: "Show clear savings breakdown: bundle vs individual" }],
    // =======================================================================
    // CATEGORY 23: PAYMENT-SPECIFIC FRICTION (F303 – F312)
    // =======================================================================
    ["F303", { id: "F303", category: FrictionCategory.PAYMENT, scenario: "Credit card type not accepted", detection_signal: "card_type_submitted AND card_type_not_supported", ai_action: "Show accepted cards upfront; offer alternative methods" }],
    ["F304", { id: "F304", category: FrictionCategory.PAYMENT, scenario: "Digital wallet not available", detection_signal: "user_device supports wallet AND wallet_option_absent", ai_action: "Enable Apple Pay / Google Pay" }],
    ["F305", { id: "F305", category: FrictionCategory.PAYMENT, scenario: "BNPL declined", detection_signal: "bnpl_application AND bnpl_declined", ai_action: "Offer alternative BNPL or standard payment with empathetic messaging" }],
    ["F306", { id: "F306", category: FrictionCategory.PAYMENT, scenario: "Installment terms unclear", detection_signal: "bnpl_viewed AND bnpl_terms_page_exit < 10s", ai_action: 'Show clear breakdown: "4 payments of $X, 0% interest"' }],
    ["F307", { id: "F307", category: FrictionCategory.PAYMENT, scenario: "Currency conversion at bank rate warning", detection_signal: "international_card AND no_multi_currency_support", ai_action: "Show price in user's currency; absorb conversion fee" }],
    ["F308", { id: "F308", category: FrictionCategory.PAYMENT, scenario: "Saved card details wrong / outdated", detection_signal: "saved_card_declined AND user_confusion_signals", ai_action: 'Prompt: "Update your card" with clear form' }],
    ["F309", { id: "F309", category: FrictionCategory.PAYMENT, scenario: "PayPal popup blocked by browser", detection_signal: "paypal_redirect AND popup_blocked", ai_action: 'Detect blocker; show "Please allow popups" guidance' }],
    ["F310", { id: "F310", category: FrictionCategory.PAYMENT, scenario: "Gift card balance insufficient for order", detection_signal: "gift_card_balance < order_total", ai_action: "Allow split payment: gift card + another method" }],
    ["F311", { id: "F311", category: FrictionCategory.PAYMENT, scenario: "Crypto payment option confusing", detection_signal: "crypto_payment_selected AND payment_abandon", ai_action: "Simplify instructions; show QR code with clear steps" }],
    ["F312", { id: "F312", category: FrictionCategory.PAYMENT, scenario: "Invoice / NET terms request not available (B2B)", detection_signal: "b2b_user AND invoice_payment_absent", ai_action: "Add invoice option for verified business accounts" }],
    // =======================================================================
    // CATEGORY 24: LEGAL & COMPLIANCE FRICTION (F313 – F318)
    // =======================================================================
    ["F313", { id: "F313", category: FrictionCategory.COMPLIANCE, scenario: "GDPR consent flow blocks shopping", detection_signal: "consent_modal AND interaction_blocked_until_consent", ai_action: "Use non-blocking consent bar; allow browsing immediately" }],
    ["F314", { id: "F314", category: FrictionCategory.COMPLIANCE, scenario: "Age verification gate too strict", detection_signal: "age_gate_shown AND exit_rate_high", ai_action: "Streamline: simple date input vs full document upload" }],
    ["F315", { id: "F315", category: FrictionCategory.COMPLIANCE, scenario: "Product restricted in user's region", detection_signal: "product_available == false for user_geo", ai_action: "Show message clearly; suggest available alternatives" }],
    ["F316", { id: "F316", category: FrictionCategory.COMPLIANCE, scenario: "Cookie preferences reset on every visit", detection_signal: "cookie_preferences AND repeat_modal_shown", ai_action: "Persist cookie choices properly" }],
    ["F317", { id: "F317", category: FrictionCategory.COMPLIANCE, scenario: "Terms of service too long to accept", detection_signal: "tos_page_length > 5000_words AND checkbox_hesitation", ai_action: "Show summary + expandable full text" }],
    ["F318", { id: "F318", category: FrictionCategory.COMPLIANCE, scenario: "Data export/deletion request difficult", detection_signal: "user_data_request AND process_steps > 3", ai_action: "Self-service data management in account settings" }],
    // =======================================================================
    // CATEGORY 25: SEASONAL & CONTEXTUAL FRICTION (F319 – F325)
    // =======================================================================
    ["F319", { id: "F319", category: FrictionCategory.SEASONAL, scenario: "Holiday gift deadline approaching but delivery won't make it", detection_signal: "order_date + delivery_estimate > holiday_date", ai_action: 'Show "Order by [date] for guaranteed delivery" warning' }],
    ["F320", { id: "F320", category: FrictionCategory.SEASONAL, scenario: "Gift wrapping unavailable during gift season", detection_signal: "holiday_season AND gift_wrap_absent", ai_action: "Enable seasonal gift wrapping option" }],
    ["F321", { id: "F321", category: FrictionCategory.SEASONAL, scenario: "Black Friday/sale site overloaded", detection_signal: "server_response_time > 5s during sale_event", ai_action: "Queue system with estimated wait; increase capacity" }],
    ["F322", { id: "F322", category: FrictionCategory.SEASONAL, scenario: "Seasonal product sold out", detection_signal: "seasonal_product AND stock == 0 AND demand_high", ai_action: "Waitlist + notification for restock or next season" }],
    ["F323", { id: "F323", category: FrictionCategory.SEASONAL, scenario: "Back-to-school items not grouped for easy shopping", detection_signal: "seasonal_context == back_to_school AND category_browse_high", ai_action: "Create curated seasonal landing page" }],
    ["F324", { id: "F324", category: FrictionCategory.SEASONAL, scenario: "Weather-triggered product need not served", detection_signal: "weather_api == extreme_cold/heat AND relevant_products_not_promoted", ai_action: "Dynamic merchandising based on local weather" }],
    ["F325", { id: "F325", category: FrictionCategory.SEASONAL, scenario: "Post-holiday return surge overwhelming support", detection_signal: "support_ticket_volume > 200% baseline AND response_time > 48h", ai_action: "Scale support; add self-service return portal" }],
]);
// ---------------------------------------------------------------------------
// Helper: get a friction scenario by ID
// ---------------------------------------------------------------------------
function getFrictionScenario(frictionId) {
    return exports.FRICTION_CATALOG.get(frictionId);
}
// ---------------------------------------------------------------------------
// Helper: get all scenarios for a category
// ---------------------------------------------------------------------------
function getScenariosByCategory(category) {
    const results = [];
    for (const scenario of exports.FRICTION_CATALOG.values()) {
        if (scenario.category === category) {
            results.push(scenario);
        }
    }
    return results;
}
// ---------------------------------------------------------------------------
// Helper: get all friction IDs
// ---------------------------------------------------------------------------
function getAllFrictionIds() {
    return Array.from(exports.FRICTION_CATALOG.keys());
}
//# sourceMappingURL=friction-catalog.js.map