// Auto-generated from docs/friction_scenarios.md
// Friction category packs + subcategory options for demo scenario control

export const FRICTION_CATEGORY_CATALOG = [
  {
    "id": "landing_first_impression_friction",
    "order": 1,
    "label": "LANDING & FIRST IMPRESSION FRICTION",
    "categorySlug": "landing",
    "items": [
      {
        "id": "F001",
        "order": 1,
        "label": "Slow page load on entry",
        "categorySlug": "landing",
        "detectionSignal": "page_load_time > 3s",
        "aiAction": "Show skeleton loader + \"Almost there\" message"
      },
      {
        "id": "F002",
        "order": 2,
        "label": "Bounce within 5 seconds",
        "categorySlug": "landing",
        "detectionSignal": "session_duration < 5s AND pages_viewed == 1",
        "aiAction": "Trigger exit-intent overlay with value prop"
      },
      {
        "id": "F003",
        "order": 3,
        "label": "Lands on 404 / broken page",
        "categorySlug": "landing",
        "detectionSignal": "http_status == 404",
        "aiAction": "Redirect to smart search with original query parsed"
      },
      {
        "id": "F004",
        "order": 4,
        "label": "Lands on out-of-stock product (from ad/email)",
        "categorySlug": "landing",
        "detectionSignal": "landing_page == product AND stock == 0",
        "aiAction": "Show alternatives + back-in-stock signup"
      },
      {
        "id": "F005",
        "order": 5,
        "label": "Geo-mismatch (wrong currency/language)",
        "categorySlug": "landing",
        "detectionSignal": "geo_ip != store_locale",
        "aiAction": "Auto-suggest correct locale/currency switch"
      },
      {
        "id": "F006",
        "order": 6,
        "label": "Mobile user on non-responsive page",
        "categorySlug": "landing",
        "detectionSignal": "device == mobile AND viewport_mismatch == true",
        "aiAction": "Trigger mobile-optimized overlay or redirect"
      },
      {
        "id": "F007",
        "order": 7,
        "label": "First-time visitor with no context",
        "categorySlug": "landing",
        "detectionSignal": "is_new_visitor == true AND referrer == direct",
        "aiAction": "Show welcome guide / category highlights"
      },
      {
        "id": "F008",
        "order": 8,
        "label": "Lands from price comparison site",
        "categorySlug": "landing",
        "detectionSignal": "referrer contains comparison_site_domain",
        "aiAction": "Emphasize price match guarantee + free shipping"
      },
      {
        "id": "F009",
        "order": 9,
        "label": "Popup/modal blocks content immediately",
        "categorySlug": "landing",
        "detectionSignal": "modal_shown_at < 2s AND close_click_time == null",
        "aiAction": "Delay popup, or auto-dismiss after 3s"
      },
      {
        "id": "F010",
        "order": 10,
        "label": "Cookie consent banner covers key CTA",
        "categorySlug": "landing",
        "detectionSignal": "consent_banner == visible AND cta_obscured == true",
        "aiAction": "Minimize banner, float consent as bottom bar"
      },
      {
        "id": "F011",
        "order": 11,
        "label": "Aggressive popup triggers immediate exit",
        "categorySlug": "landing",
        "detectionSignal": "popup_shown AND exit_within < 3s",
        "aiAction": "Suppress popup for this user segment going forward"
      },
      {
        "id": "F012",
        "order": 12,
        "label": "Promotional banner links to expired offer",
        "categorySlug": "landing",
        "detectionSignal": "click_target == promo_banner AND offer_expired == true",
        "aiAction": "Show updated offer or nearest active promotion"
      }
    ]
  },
  {
    "id": "navigation_discovery_friction",
    "order": 2,
    "label": "NAVIGATION & DISCOVERY FRICTION",
    "categorySlug": "navigation",
    "items": [
      {
        "id": "F013",
        "order": 13,
        "label": "Can't find category (excessive menu depth)",
        "categorySlug": "navigation",
        "detectionSignal": "menu_hover_count > 5 AND no_click",
        "aiAction": "Surface AI search prompt: \"Looking for something?\""
      },
      {
        "id": "F014",
        "order": 14,
        "label": "Clicks wrong category, immediately backtracks",
        "categorySlug": "navigation",
        "detectionSignal": "page_back_within < 3s",
        "aiAction": "Show breadcrumb trail + \"Did you mean…?\" suggestions"
      },
      {
        "id": "F015",
        "order": 15,
        "label": "Scrolls entire page without clicking anything",
        "categorySlug": "navigation",
        "detectionSignal": "scroll_depth == 100% AND click_count == 0",
        "aiAction": "Trigger floating assistant: \"Need help finding something?\""
      },
      {
        "id": "F016",
        "order": 16,
        "label": "Uses browser back button repeatedly",
        "categorySlug": "navigation",
        "detectionSignal": "back_button_count >= 3 in 60s",
        "aiAction": "Show persistent navigation sidebar or sticky category menu"
      },
      {
        "id": "F017",
        "order": 17,
        "label": "Dead-end page (no next action visible)",
        "categorySlug": "navigation",
        "detectionSignal": "page_has_no_cta == true AND dwell_time > 10s",
        "aiAction": "Inject recommended products or related categories"
      },
      {
        "id": "F018",
        "order": 18,
        "label": "Excessive filter usage with no results",
        "categorySlug": "navigation",
        "detectionSignal": "filter_applied_count >= 4 AND results == 0",
        "aiAction": "Suggest relaxing filters, show nearest matches"
      },
      {
        "id": "F019",
        "order": 19,
        "label": "Filter combination returns 0 results",
        "categorySlug": "navigation",
        "detectionSignal": "applied_filters result_count == 0",
        "aiAction": "Show \"No exact match\" + auto-suggest closest results"
      },
      {
        "id": "F020",
        "order": 20,
        "label": "Pogo-sticking (repeatedly entering and leaving pages)",
        "categorySlug": "navigation",
        "detectionSignal": "page_enter_exit_loop >= 3",
        "aiAction": "Ask \"Not finding what you need?\" + offer guided search"
      },
      {
        "id": "F021",
        "order": 21,
        "label": "Hamburger menu not discovered (mobile)",
        "categorySlug": "navigation",
        "detectionSignal": "time_on_page > 30s AND menu_opened == false AND scroll_depth > 50%",
        "aiAction": "Highlight menu icon with subtle animation/tooltip"
      },
      {
        "id": "F022",
        "order": 22,
        "label": "Breadcrumb not used, user is lost",
        "categorySlug": "navigation",
        "detectionSignal": "page_depth > 4 AND breadcrumb_click == 0 AND back_button > 2",
        "aiAction": "Show floating \"Back to [Category]\" shortcut"
      },
      {
        "id": "F023",
        "order": 23,
        "label": "Clicked non-clickable element",
        "categorySlug": "navigation",
        "detectionSignal": "dead_click == true on image/text/banner",
        "aiAction": "Make element clickable or show tooltip: \"Click here for details\""
      },
      {
        "id": "F024",
        "order": 24,
        "label": "Category page has too many products (overwhelm)",
        "categorySlug": "navigation",
        "detectionSignal": "category_product_count > 100 AND scroll_depth < 20% AND exit == true",
        "aiAction": "Suggest sub-filters or \"Shop by\" curated collections"
      },
      {
        "id": "F025",
        "order": 25,
        "label": "User clicks logo repeatedly",
        "categorySlug": "navigation",
        "detectionSignal": "logo_click_count >= 2 in 30s",
        "aiAction": "Possible frustration signal — offer help or reset journey"
      },
      {
        "id": "F026",
        "order": 26,
        "label": "Horizontal scroll on mobile (broken layout)",
        "categorySlug": "navigation",
        "detectionSignal": "horizontal_scroll_detected == true AND device == mobile",
        "aiAction": "Flag layout issue; show \"Try our app\" or simplified view"
      },
      {
        "id": "F027",
        "order": 27,
        "label": "Footer links used as primary navigation",
        "categorySlug": "navigation",
        "detectionSignal": "footer_nav_click_count > 2 AND main_nav_click == 0",
        "aiAction": "Improve main nav visibility; surface popular links higher"
      }
    ]
  },
  {
    "id": "search_friction",
    "order": 3,
    "label": "SEARCH FRICTION",
    "categorySlug": "search",
    "items": [
      {
        "id": "F028",
        "order": 28,
        "label": "Search returns zero results",
        "categorySlug": "search",
        "detectionSignal": "search_query AND result_count == 0",
        "aiAction": "Show \"Did you mean…?\" + popular products + AI suggestions"
      },
      {
        "id": "F029",
        "order": 29,
        "label": "Misspelled search query",
        "categorySlug": "search",
        "detectionSignal": "search_query fuzzy_match_score < 0.7",
        "aiAction": "Auto-correct with \"Showing results for [corrected]\""
      },
      {
        "id": "F030",
        "order": 30,
        "label": "Vague/generic search term",
        "categorySlug": "search",
        "detectionSignal": "search_query word_count == 1 AND result_count > 200",
        "aiAction": "Show category disambiguation: \"Are you looking for…?\""
      },
      {
        "id": "F031",
        "order": 31,
        "label": "Multiple refined searches (3+ in session)",
        "categorySlug": "search",
        "detectionSignal": "search_count >= 3 AND purchase == false",
        "aiAction": "Trigger AI assistant: \"Let me help you find the right product\""
      },
      {
        "id": "F032",
        "order": 32,
        "label": "Search results irrelevant to query",
        "categorySlug": "search",
        "detectionSignal": "search_query vs results relevance_score < 0.4",
        "aiAction": "Offer \"Did you mean?\" + human chat handoff"
      },
      {
        "id": "F033",
        "order": 33,
        "label": "Searched but didn't click any result",
        "categorySlug": "search",
        "detectionSignal": "search_completed AND result_click == 0",
        "aiAction": "Resurface results with better visual layout / filters"
      },
      {
        "id": "F034",
        "order": 34,
        "label": "Searched for competitor product/brand",
        "categorySlug": "search",
        "detectionSignal": "search_query matches competitor_brand_list",
        "aiAction": "Show equivalent own-brand product with comparison"
      },
      {
        "id": "F035",
        "order": 35,
        "label": "Searched for coupon/discount/promo code",
        "categorySlug": "search",
        "detectionSignal": "search_query contains [\"coupon\",\"discount\",\"promo\",\"deal\"]",
        "aiAction": "Surface active promotions or signup-for-discount offer"
      },
      {
        "id": "F036",
        "order": 36,
        "label": "Searched for return/refund/cancel",
        "categorySlug": "search",
        "detectionSignal": "search_query contains [\"return\",\"refund\",\"cancel\",\"exchange\"]",
        "aiAction": "Proactive support: \"Need help with an order?\" + link to policy"
      },
      {
        "id": "F037",
        "order": 37,
        "label": "Search autocomplete ignored",
        "categorySlug": "search",
        "detectionSignal": "autocomplete_shown == true AND autocomplete_selected == false",
        "aiAction": "Improve autocomplete relevance; test visual prominence"
      },
      {
        "id": "F038",
        "order": 38,
        "label": "Voice search failed / not recognized",
        "categorySlug": "search",
        "detectionSignal": "voice_search_initiated AND result == error",
        "aiAction": "Fallback to text search with pre-filled partial query"
      },
      {
        "id": "F039",
        "order": 39,
        "label": "Image/visual search returned poor matches",
        "categorySlug": "search",
        "detectionSignal": "visual_search_initiated AND result_click == 0",
        "aiAction": "Offer text-based refinement: \"Describe what you're looking for\""
      },
      {
        "id": "F040",
        "order": 40,
        "label": "Searched for product that exists but is hidden/unlisted",
        "categorySlug": "search",
        "detectionSignal": "search_query matches unlisted_product",
        "aiAction": "Review catalog visibility; show related available products"
      },
      {
        "id": "F041",
        "order": 41,
        "label": "Repeated identical search across sessions",
        "categorySlug": "search",
        "detectionSignal": "same_search_query across session_count >= 2",
        "aiAction": "Proactive notification: \"Still looking for [X]? Here's what's new\""
      }
    ]
  },
  {
    "id": "product_page_friction",
    "order": 4,
    "label": "PRODUCT PAGE FRICTION",
    "categorySlug": "product",
    "items": [
      {
        "id": "F042",
        "order": 42,
        "label": "Viewed product page but left quickly (<10s)",
        "categorySlug": "product",
        "detectionSignal": "pdp_dwell_time < 10s AND add_to_cart == false",
        "aiAction": "Log as low engagement; retarget with product highlights"
      },
      {
        "id": "F043",
        "order": 43,
        "label": "Long dwell on product page, no action (>3min)",
        "categorySlug": "product",
        "detectionSignal": "pdp_dwell_time > 180s AND add_to_cart == false",
        "aiAction": "Trigger \"Have questions? Chat with us\" or show social proof"
      },
      {
        "id": "F044",
        "order": 44,
        "label": "Viewed product multiple times across sessions",
        "categorySlug": "product",
        "detectionSignal": "pdp_view_count >= 3 across sessions AND purchase == false",
        "aiAction": "Show price drop alert signup or limited-time incentive"
      },
      {
        "id": "F045",
        "order": 45,
        "label": "Scrolled to reviews but bounced after reading",
        "categorySlug": "product",
        "detectionSignal": "scroll_to_reviews == true AND exit_after_reviews == true",
        "aiAction": "Proactively surface positive reviews; offer comparison"
      },
      {
        "id": "F046",
        "order": 46,
        "label": "Read mostly negative reviews",
        "categorySlug": "product",
        "detectionSignal": "review_scroll_focus == negative_reviews",
        "aiAction": "Show brand response to concerns; offer guarantee/warranty info"
      },
      {
        "id": "F047",
        "order": 47,
        "label": "Zoomed into product images repeatedly",
        "categorySlug": "product",
        "detectionSignal": "image_zoom_count >= 3",
        "aiAction": "Offer 360° view, video, or AR try-on if available"
      },
      {
        "id": "F048",
        "order": 48,
        "label": "Size/variant selector interacted but not confirmed",
        "categorySlug": "product",
        "detectionSignal": "variant_change_count >= 3 AND add_to_cart == false",
        "aiAction": "Show size guide, fit recommendations, or \"Ask about sizing\" chat"
      },
      {
        "id": "F049",
        "order": 49,
        "label": "Size guide opened but user still didn't add to cart",
        "categorySlug": "product",
        "detectionSignal": "size_guide_viewed == true AND add_to_cart == false within 60s",
        "aiAction": "Offer \"Still unsure? Our fit assistant can help\" + easy returns note"
      },
      {
        "id": "F050",
        "order": 50,
        "label": "Product description not scrolled to",
        "categorySlug": "product",
        "detectionSignal": "description_in_viewport == false AND exit == true",
        "aiAction": "Move key info above fold; add quick-view summary"
      },
      {
        "id": "F051",
        "order": 51,
        "label": "Checked shipping info, then left",
        "categorySlug": "product",
        "detectionSignal": "shipping_info_viewed == true AND exit_within < 30s",
        "aiAction": "Shipping cost may be the blocker — offer free shipping threshold"
      },
      {
        "id": "F052",
        "order": 52,
        "label": "Checked return policy, then left",
        "categorySlug": "product",
        "detectionSignal": "return_policy_viewed == true AND exit_within < 30s",
        "aiAction": "Emphasize \"hassle-free returns\" with trust badge on product page"
      },
      {
        "id": "F053",
        "order": 53,
        "label": "Out-of-stock product viewed",
        "categorySlug": "product",
        "detectionSignal": "stock_status == 0 AND pdp_viewed == true",
        "aiAction": "Back-in-stock alert + show similar available products"
      },
      {
        "id": "F054",
        "order": 54,
        "label": "Low stock but user didn't act",
        "categorySlug": "product",
        "detectionSignal": "stock_count <= 3 AND add_to_cart == false AND dwell > 30s",
        "aiAction": "Show urgency: \"Only [X] left\" with social proof"
      },
      {
        "id": "F055",
        "order": 55,
        "label": "Compared variants but chose none",
        "categorySlug": "product",
        "detectionSignal": "variant_comparison_count >= 2 AND add_to_cart == false",
        "aiAction": "Offer quick comparison table or \"Most popular choice\" badge"
      },
      {
        "id": "F056",
        "order": 56,
        "label": "Clicked on product from recommendation but left",
        "categorySlug": "product",
        "detectionSignal": "source == recommendation AND pdp_exit_within < 15s",
        "aiAction": "Recommendation may be off — refine algorithm for this user"
      },
      {
        "id": "F057",
        "order": 57,
        "label": "Product video not played (exists but ignored)",
        "categorySlug": "product",
        "detectionSignal": "video_available == true AND video_play == false",
        "aiAction": "Auto-play muted preview or move video higher on page"
      },
      {
        "id": "F058",
        "order": 58,
        "label": "Hovered over \"Add to Cart\" but didn't click",
        "categorySlug": "product",
        "detectionSignal": "hover_atc_button == true AND click_atc == false within 10s",
        "aiAction": "Micro-nudge: tooltip with \"Free shipping\" or \"Easy returns\""
      },
      {
        "id": "F059",
        "order": 59,
        "label": "Price not visible without scrolling",
        "categorySlug": "product",
        "detectionSignal": "price_in_viewport == false on page_load",
        "aiAction": "Restructure layout; pin price near product title"
      },
      {
        "id": "F060",
        "order": 60,
        "label": "User copied product title/price (comparison shopping)",
        "categorySlug": "product",
        "detectionSignal": "copy_event on product_title OR price_element",
        "aiAction": "Show price match guarantee or \"Best price\" badge"
      },
      {
        "id": "F061",
        "order": 61,
        "label": "Clicked on a trust badge / certification for more info",
        "categorySlug": "product",
        "detectionSignal": "trust_badge_click == true",
        "aiAction": "Expand trust info inline; reinforce credibility"
      },
      {
        "id": "F062",
        "order": 62,
        "label": "User tried to share product but feature missing/broken",
        "categorySlug": "product",
        "detectionSignal": "share_button_click == error OR share_button_absent",
        "aiAction": "Enable/fix social sharing; track share intent"
      },
      {
        "id": "F063",
        "order": 63,
        "label": "Product page has no reviews",
        "categorySlug": "product",
        "detectionSignal": "review_count == 0",
        "aiAction": "Show \"Be the first to review\" + industry/editorial endorsements"
      },
      {
        "id": "F064",
        "order": 64,
        "label": "Specification/material info missing",
        "categorySlug": "product",
        "detectionSignal": "spec_section == empty AND exit_within < 30s",
        "aiAction": "Flag content gap; show AI-generated summary or chat option"
      },
      {
        "id": "F065",
        "order": 65,
        "label": "Clicked multiple color swatches without adding to cart",
        "categorySlug": "product",
        "detectionSignal": "swatch_click_count >= 4 AND add_to_cart == false",
        "aiAction": "Show \"See it in your space\" AR or styled product photos per color"
      },
      {
        "id": "F066",
        "order": 66,
        "label": "Viewed product bundle option but didn't select",
        "categorySlug": "product",
        "detectionSignal": "bundle_viewed == true AND bundle_selected == false",
        "aiAction": "Highlight savings amount; show \"Popular bundle\" social proof"
      },
      {
        "id": "F067",
        "order": 67,
        "label": "Pricing feels unclear (multiple prices, strikethrough confusion)",
        "categorySlug": "product",
        "detectionSignal": "price_area_hover_time > 5s OR rage_click on price",
        "aiAction": "Clarify pricing: \"You pay [X] — You save [Y]\""
      }
    ]
  },
  {
    "id": "cart_friction",
    "order": 5,
    "label": "CART FRICTION",
    "categorySlug": "cart",
    "items": [
      {
        "id": "F068",
        "order": 68,
        "label": "Added to cart but didn't proceed to checkout",
        "categorySlug": "cart",
        "detectionSignal": "atc_event == true AND checkout_initiated == false within 600s",
        "aiAction": "Trigger cart reminder notification or incentive"
      },
      {
        "id": "F069",
        "order": 69,
        "label": "Cart idle for extended period (>30 min in session)",
        "categorySlug": "cart",
        "detectionSignal": "cart_last_interaction > 1800s AND session_active == true",
        "aiAction": "Gentle nudge: \"Your cart is waiting\" + item availability alert"
      },
      {
        "id": "F070",
        "order": 70,
        "label": "Removed item from cart",
        "categorySlug": "cart",
        "detectionSignal": "cart_remove_event == true",
        "aiAction": "Ask \"Why did you remove this?\" (optional quick survey) or show alternative"
      },
      {
        "id": "F071",
        "order": 71,
        "label": "Removed item after seeing subtotal",
        "categorySlug": "cart",
        "detectionSignal": "cart_remove_event after subtotal_view within 10s",
        "aiAction": "Price sensitivity detected — offer discount or show cheaper alternatives"
      },
      {
        "id": "F072",
        "order": 72,
        "label": "Cleared entire cart",
        "categorySlug": "cart",
        "detectionSignal": "cart_item_count from >0 to 0",
        "aiAction": "\"Changed your mind?\" — offer to save cart for later + ask for feedback"
      },
      {
        "id": "F073",
        "order": 73,
        "label": "Added then removed same item multiple times",
        "categorySlug": "cart",
        "detectionSignal": "item_add_remove_loop >= 2",
        "aiAction": "Hesitation detected — show social proof, reviews, or offer assistance"
      },
      {
        "id": "F074",
        "order": 74,
        "label": "Cart total exceeds user's apparent budget threshold",
        "categorySlug": "cart",
        "detectionSignal": "cart_total > user_avg_order_value * 2 AND hesitation_signals",
        "aiAction": "Suggest breaking into multiple orders or show BNPL option"
      },
      {
        "id": "F075",
        "order": 75,
        "label": "Applied coupon code — rejected",
        "categorySlug": "cart",
        "detectionSignal": "coupon_attempt == true AND coupon_valid == false",
        "aiAction": "Show valid alternatives: \"Try these instead\" or signup discount"
      },
      {
        "id": "F076",
        "order": 76,
        "label": "Tried multiple coupon codes (code hunting)",
        "categorySlug": "cart",
        "detectionSignal": "coupon_attempt_count >= 3",
        "aiAction": "Auto-apply best available discount or show \"Best deal applied\""
      },
      {
        "id": "F077",
        "order": 77,
        "label": "Cart contains only sale items",
        "categorySlug": "cart",
        "detectionSignal": "cart_items all discount == true",
        "aiAction": "Upsell with \"Complete your look\" full-price recommendations"
      },
      {
        "id": "F078",
        "order": 78,
        "label": "Cart contains items from different categories (gift shopping?)",
        "categorySlug": "cart",
        "detectionSignal": "cart_categories >= 3 AND distinct_sizes == true",
        "aiAction": "Offer gift wrapping + \"Shopping for someone?\" prompt"
      },
      {
        "id": "F079",
        "order": 79,
        "label": "Cart item went out of stock",
        "categorySlug": "cart",
        "detectionSignal": "cart_item_stock_status changed to 0",
        "aiAction": "Notify immediately: \"This item just sold out\" + show equivalent"
      },
      {
        "id": "F080",
        "order": 80,
        "label": "Cart not synced across devices",
        "categorySlug": "cart",
        "detectionSignal": "user_logged_in == true AND cart_mismatch across devices",
        "aiAction": "Force cart sync; notify user of merged cart"
      },
      {
        "id": "F081",
        "order": 81,
        "label": "Shipping cost revealed in cart (shock)",
        "categorySlug": "cart",
        "detectionSignal": "shipping_cost_shown AND cart_page_exit_within < 20s",
        "aiAction": "Show free shipping threshold: \"Add $X more for free shipping\""
      },
      {
        "id": "F082",
        "order": 82,
        "label": "Mini-cart doesn't show enough info",
        "categorySlug": "cart",
        "detectionSignal": "mini_cart_hover AND full_cart_page_click_immediately",
        "aiAction": "Enhance mini-cart with product images, variant info, total"
      },
      {
        "id": "F083",
        "order": 83,
        "label": "Cart page loads slowly",
        "categorySlug": "cart",
        "detectionSignal": "cart_page_load_time > 3s",
        "aiAction": "Optimize; show cached cart preview while loading"
      },
      {
        "id": "F084",
        "order": 84,
        "label": "User edits quantity up then back down",
        "categorySlug": "cart",
        "detectionSignal": "qty_increase then qty_decrease within 30s",
        "aiAction": "Budget hesitation — show bundle deals or volume discounts"
      },
      {
        "id": "F085",
        "order": 85,
        "label": "Cart page has distracting upsell overload",
        "categorySlug": "cart",
        "detectionSignal": "upsell_sections > 3 AND checkout_button_below_fold",
        "aiAction": "Reduce upsell noise; pin checkout CTA"
      },
      {
        "id": "F086",
        "order": 86,
        "label": "Estimated delivery date too far out",
        "categorySlug": "cart",
        "detectionSignal": "estimated_delivery_days > 7 AND exit == true",
        "aiAction": "Offer express shipping option prominently"
      },
      {
        "id": "F087",
        "order": 87,
        "label": "Tax/duty amount surprises user",
        "categorySlug": "cart",
        "detectionSignal": "tax_calculated AND cart_page_exit_within < 15s",
        "aiAction": "Show \"Price includes all taxes\" or pre-calculate at product level"
      },
      {
        "id": "F088",
        "order": 88,
        "label": "User returns to cart page 3+ times without checkout",
        "categorySlug": "cart",
        "detectionSignal": "cart_page_view_count >= 3 AND checkout == false",
        "aiAction": "Strong intent signal — offer time-limited incentive"
      }
    ]
  },
  {
    "id": "checkout_friction",
    "order": 6,
    "label": "CHECKOUT FRICTION",
    "categorySlug": "checkout",
    "items": [
      {
        "id": "F089",
        "order": 89,
        "label": "Forced account creation blocks checkout",
        "categorySlug": "checkout",
        "detectionSignal": "checkout_step == registration AND exit == true",
        "aiAction": "Enable guest checkout; move registration to post-purchase"
      },
      {
        "id": "F090",
        "order": 90,
        "label": "Checkout form too long (too many fields)",
        "categorySlug": "checkout",
        "detectionSignal": "form_field_count > 12 AND form_completion_time > 120s",
        "aiAction": "Reduce fields; auto-fill from address API; collapse optional fields"
      },
      {
        "id": "F091",
        "order": 91,
        "label": "Form validation errors on submit",
        "categorySlug": "checkout",
        "detectionSignal": "form_error_count >= 1",
        "aiAction": "Inline real-time validation; highlight errors clearly with fix suggestion"
      },
      {
        "id": "F092",
        "order": 92,
        "label": "Repeated form validation errors (same field)",
        "categorySlug": "checkout",
        "detectionSignal": "same_field_error_count >= 2",
        "aiAction": "Show specific help text for that field; offer chat support"
      },
      {
        "id": "F093",
        "order": 93,
        "label": "Address auto-complete not working",
        "categorySlug": "checkout",
        "detectionSignal": "address_autocomplete_fail == true",
        "aiAction": "Fallback to manual entry with simplified fields"
      },
      {
        "id": "F094",
        "order": 94,
        "label": "User pauses at payment information entry",
        "categorySlug": "checkout",
        "detectionSignal": "payment_field_focus_time > 30s AND input == empty",
        "aiAction": "Show security badges near payment fields; offer PayPal/wallet alternatives"
      },
      {
        "id": "F095",
        "order": 95,
        "label": "Preferred payment method not available",
        "categorySlug": "checkout",
        "detectionSignal": "payment_method_selected == null AND payment_page_exit",
        "aiAction": "Add more payment options; show what's available upfront"
      },
      {
        "id": "F096",
        "order": 96,
        "label": "Payment failed / declined",
        "categorySlug": "checkout",
        "detectionSignal": "payment_status == declined",
        "aiAction": "Show clear error message + alternative payment options + \"Try again\""
      },
      {
        "id": "F097",
        "order": 97,
        "label": "Multiple payment attempts failed",
        "categorySlug": "checkout",
        "detectionSignal": "payment_attempt_count >= 2 AND status == failed",
        "aiAction": "Offer alternative methods; provide customer support contact"
      },
      {
        "id": "F098",
        "order": 98,
        "label": "3D Secure / OTP verification failed",
        "categorySlug": "checkout",
        "detectionSignal": "3ds_status == failed",
        "aiAction": "Explain why; offer to retry or use different card"
      },
      {
        "id": "F099",
        "order": 99,
        "label": "Promo code field visible but no code to enter",
        "categorySlug": "checkout",
        "detectionSignal": "promo_field_visible AND promo_field_focus AND exit within 60s",
        "aiAction": "User leaves to hunt for codes — auto-apply best deal or hide empty field"
      },
      {
        "id": "F100",
        "order": 100,
        "label": "Shipping options confusing (too many choices)",
        "categorySlug": "checkout",
        "detectionSignal": "shipping_option_count > 4 AND selection_time > 45s",
        "aiAction": "Pre-select recommended option; simplify to 2-3 choices"
      },
      {
        "id": "F101",
        "order": 101,
        "label": "Checkout page redirects to third party (trust break)",
        "categorySlug": "checkout",
        "detectionSignal": "checkout_redirect_to_external == true AND exit == true",
        "aiAction": "Keep checkout in-domain; or show trust messaging for redirect"
      },
      {
        "id": "F102",
        "order": 102,
        "label": "Progress indicator missing (user doesn't know how many steps)",
        "categorySlug": "checkout",
        "detectionSignal": "checkout_steps > 2 AND progress_bar == false",
        "aiAction": "Add step indicator: \"Step 2 of 3\""
      },
      {
        "id": "F103",
        "order": 103,
        "label": "User backtracks in checkout flow",
        "categorySlug": "checkout",
        "detectionSignal": "checkout_step_backward == true",
        "aiAction": "Something in current step caused doubt — review that step's UX"
      },
      {
        "id": "F104",
        "order": 104,
        "label": "Billing address form when same as shipping",
        "categorySlug": "checkout",
        "detectionSignal": "billing_form_shown AND same_as_shipping_checked == false",
        "aiAction": "Default to \"Same as shipping\" pre-checked"
      },
      {
        "id": "F105",
        "order": 105,
        "label": "Slow payment processing (spinner too long)",
        "categorySlug": "checkout",
        "detectionSignal": "payment_processing_time > 10s",
        "aiAction": "Show reassuring message: \"Securely processing your payment…\""
      },
      {
        "id": "F106",
        "order": 106,
        "label": "Order summary not visible during checkout",
        "categorySlug": "checkout",
        "detectionSignal": "order_summary_visible == false on payment_step",
        "aiAction": "Show persistent order summary sidebar/accordion"
      },
      {
        "id": "F107",
        "order": 107,
        "label": "Unexpected fee added at final step",
        "categorySlug": "checkout",
        "detectionSignal": "new_fee_shown_at_final_step == true",
        "aiAction": "Reveal all costs earlier; show running total throughout"
      },
      {
        "id": "F108",
        "order": 108,
        "label": "Gift option not available when needed",
        "categorySlug": "checkout",
        "detectionSignal": "checkout_flow AND gift_option_absent AND cart_signals_gift",
        "aiAction": "Add gift wrap / gift message option"
      },
      {
        "id": "F109",
        "order": 109,
        "label": "BNPL option not prominent enough",
        "categorySlug": "checkout",
        "detectionSignal": "bnpl_available == true AND bnpl_selection == 0 AND cart_value > $50",
        "aiAction": "Show BNPL installment amount on checkout: \"Or pay $X/month\""
      },
      {
        "id": "F110",
        "order": 110,
        "label": "Mobile keyboard covers form fields",
        "categorySlug": "checkout",
        "detectionSignal": "device == mobile AND keyboard_overlap_detected",
        "aiAction": "Ensure form scrolls above keyboard; auto-scroll to active field"
      },
      {
        "id": "F111",
        "order": 111,
        "label": "Autofill populates wrong fields",
        "categorySlug": "checkout",
        "detectionSignal": "autofill_mismatch_detected == true",
        "aiAction": "Fix form field naming/autocomplete attributes"
      },
      {
        "id": "F112",
        "order": 112,
        "label": "Checkout timeout / session expired",
        "categorySlug": "checkout",
        "detectionSignal": "session_timeout during checkout_flow",
        "aiAction": "Save cart state; allow instant resume with \"Pick up where you left off\""
      },
      {
        "id": "F113",
        "order": 113,
        "label": "Terms & conditions checkbox buried or confusing",
        "categorySlug": "checkout",
        "detectionSignal": "tnc_checkbox_miss_count >= 1",
        "aiAction": "Make checkbox obvious; show brief summary instead of full legal text"
      },
      {
        "id": "F114",
        "order": 114,
        "label": "Final \"Place Order\" button not prominent",
        "categorySlug": "checkout",
        "detectionSignal": "place_order_button_below_fold OR low_contrast",
        "aiAction": "Pin CTA; use high-contrast, large button"
      },
      {
        "id": "F115",
        "order": 115,
        "label": "Currency mismatch at checkout",
        "categorySlug": "checkout",
        "detectionSignal": "user_currency != checkout_currency",
        "aiAction": "Auto-convert to user's currency or show dual prices"
      },
      {
        "id": "F116",
        "order": 116,
        "label": "User toggles between shipping methods repeatedly",
        "categorySlug": "checkout",
        "detectionSignal": "shipping_method_change >= 3",
        "aiAction": "Show delivery speed vs. cost comparison clearly"
      }
    ]
  },
  {
    "id": "pricing_value_friction",
    "order": 7,
    "label": "PRICING & VALUE FRICTION",
    "categorySlug": "pricing",
    "items": [
      {
        "id": "F117",
        "order": 117,
        "label": "Price higher than expected (sticker shock)",
        "categorySlug": "pricing",
        "detectionSignal": "pdp_exit_within < 10s AND no_interaction",
        "aiAction": "Show value justification, comparisons, or installment option"
      },
      {
        "id": "F118",
        "order": 118,
        "label": "User checks price multiple times across sessions",
        "categorySlug": "pricing",
        "detectionSignal": "price_view_count >= 3 across sessions",
        "aiAction": "Trigger price drop alert or limited-time discount"
      },
      {
        "id": "F119",
        "order": 119,
        "label": "Price discrepancy between listing and product page",
        "categorySlug": "pricing",
        "detectionSignal": "listing_price != pdp_price",
        "aiAction": "Fix data consistency; show \"Price updated\" explanation"
      },
      {
        "id": "F120",
        "order": 120,
        "label": "Competitor price found lower (user left to compare)",
        "categorySlug": "pricing",
        "detectionSignal": "session_exit AND return_from referrer == competitor",
        "aiAction": "Price match offer or highlight unique value (warranty, shipping)"
      },
      {
        "id": "F121",
        "order": 121,
        "label": "Total cost significantly higher than item price",
        "categorySlug": "pricing",
        "detectionSignal": "total_cost > item_price * 1.3 (taxes/shipping)",
        "aiAction": "Break down costs early; offer free shipping threshold"
      },
      {
        "id": "F122",
        "order": 122,
        "label": "BNPL/installment info not shown on product page",
        "categorySlug": "pricing",
        "detectionSignal": "bnpl_available == true AND bnpl_display_on_pdp == false",
        "aiAction": "Show \"As low as $X/month\" on product page"
      },
      {
        "id": "F123",
        "order": 123,
        "label": "Struck-through original price not credible",
        "categorySlug": "pricing",
        "detectionSignal": "original_price display AND user_trust_signals low",
        "aiAction": "Show \"Price history\" or \"Verified discount\" badge"
      },
      {
        "id": "F124",
        "order": 124,
        "label": "Bulk/volume discount not communicated",
        "categorySlug": "pricing",
        "detectionSignal": "qty > 1 potential AND volume_discount_exists AND not shown",
        "aiAction": "Display tiered pricing table: \"Buy 2, save 10%\""
      },
      {
        "id": "F125",
        "order": 125,
        "label": "User compares similar products by price only",
        "categorySlug": "pricing",
        "detectionSignal": "product_comparison focus == price_column",
        "aiAction": "Highlight differentiating features beyond price"
      },
      {
        "id": "F126",
        "order": 126,
        "label": "Free shipping threshold just out of reach",
        "categorySlug": "pricing",
        "detectionSignal": "cart_total < free_shipping_min AND gap < 20%",
        "aiAction": "\"Add $X more for FREE shipping\" with product suggestions"
      },
      {
        "id": "F127",
        "order": 127,
        "label": "International pricing / duty confusion",
        "categorySlug": "pricing",
        "detectionSignal": "user_geo == international AND duty_info_absent",
        "aiAction": "Show landed cost calculator or \"Duties included\" assurance"
      },
      {
        "id": "F128",
        "order": 128,
        "label": "Subscription price vs one-time price unclear",
        "categorySlug": "pricing",
        "detectionSignal": "subscription_option AND one_time_option AND toggle_count >= 2",
        "aiAction": "Clarify savings: \"Subscribe & save $X per month\""
      },
      {
        "id": "F129",
        "order": 129,
        "label": "Sale countdown timer feels fake/manipulative",
        "categorySlug": "pricing",
        "detectionSignal": "countdown_timer_displayed AND user_returns_after_expiry_and_sees_same_timer",
        "aiAction": "Ensure genuine scarcity or remove; damages trust"
      },
      {
        "id": "F130",
        "order": 130,
        "label": "Membership/loyalty discount not visible to eligible user",
        "categorySlug": "pricing",
        "detectionSignal": "user_loyalty_tier > 0 AND member_price_hidden",
        "aiAction": "Show \"Your member price: $X\" personalized pricing"
      }
    ]
  },
  {
    "id": "trust_security_friction",
    "order": 8,
    "label": "TRUST & SECURITY FRICTION",
    "categorySlug": "trust",
    "items": [
      {
        "id": "F131",
        "order": 131,
        "label": "No SSL/security indicator visible",
        "categorySlug": "trust",
        "detectionSignal": "ssl_badge_absent AND checkout_page",
        "aiAction": "Display security badges, SSL lock icon, PCI compliance"
      },
      {
        "id": "F132",
        "order": 132,
        "label": "User checks About Us / Company info before purchasing",
        "categorySlug": "trust",
        "detectionSignal": "about_page_viewed AND then checkout_hesitation",
        "aiAction": "Strengthen About page; show social proof on checkout"
      },
      {
        "id": "F133",
        "order": 133,
        "label": "User reads privacy policy during checkout",
        "categorySlug": "trust",
        "detectionSignal": "privacy_policy_click during checkout_flow",
        "aiAction": "Show privacy summary badge: \"We never share your data\""
      },
      {
        "id": "F134",
        "order": 134,
        "label": "No customer reviews on product",
        "categorySlug": "trust",
        "detectionSignal": "review_count == 0",
        "aiAction": "Show editorial reviews, expert endorsements, or \"Trusted by X customers\""
      },
      {
        "id": "F135",
        "order": 135,
        "label": "Only negative reviews visible (sorted by recent)",
        "categorySlug": "trust",
        "detectionSignal": "visible_reviews avg_rating < 3",
        "aiAction": "Default sort to \"Most helpful\"; show brand responses"
      },
      {
        "id": "F136",
        "order": 136,
        "label": "User searches for \"[brand] reviews\" or \"[brand] scam\"",
        "categorySlug": "trust",
        "detectionSignal": "search_query contains [\"scam\",\"legit\",\"reviews\",\"trustworthy\"]",
        "aiAction": "Surface trust signals: Trustpilot widget, guarantees, media mentions"
      },
      {
        "id": "F137",
        "order": 137,
        "label": "Payment page looks different from rest of site",
        "categorySlug": "trust",
        "detectionSignal": "payment_page_style_mismatch == true",
        "aiAction": "Maintain consistent branding throughout checkout"
      },
      {
        "id": "F138",
        "order": 138,
        "label": "Third-party payment redirect without explanation",
        "categorySlug": "trust",
        "detectionSignal": "redirect_to_payment_gateway AND no_explanation",
        "aiAction": "Show \"You'll be redirected to [PayPal/Stripe] to complete securely\""
      },
      {
        "id": "F139",
        "order": 139,
        "label": "Missing return/refund policy information",
        "categorySlug": "trust",
        "detectionSignal": "return_policy_page == absent OR not_linked_from_pdp",
        "aiAction": "Add visible return policy link on every product page and cart"
      },
      {
        "id": "F140",
        "order": 140,
        "label": "User hovers on security badge for details",
        "categorySlug": "trust",
        "detectionSignal": "trust_badge_hover_time > 2s",
        "aiAction": "Expand tooltip with certification details"
      },
      {
        "id": "F141",
        "order": 141,
        "label": "New brand / user has never purchased before",
        "categorySlug": "trust",
        "detectionSignal": "user_order_count == 0 AND checkout_page",
        "aiAction": "Show first-order guarantee, satisfaction promise, easy return"
      },
      {
        "id": "F142",
        "order": 142,
        "label": "Social proof missing (no purchase count, no testimonials)",
        "categorySlug": "trust",
        "detectionSignal": "social_proof_elements == 0 on pdp",
        "aiAction": "Add \"X people bought this\" or recent purchase notifications"
      },
      {
        "id": "F143",
        "order": 143,
        "label": "User visited third-party review site during session",
        "categorySlug": "trust",
        "detectionSignal": "tab_switch_to review_site_detected",
        "aiAction": "Show aggregated review score on-site; link to verified reviews"
      },
      {
        "id": "F144",
        "order": 144,
        "label": "Contact information hard to find",
        "categorySlug": "trust",
        "detectionSignal": "contact_page_search OR footer_scan_for_contact",
        "aiAction": "Make phone/email/chat visible in header or floating widget"
      },
      {
        "id": "F145",
        "order": 145,
        "label": "Fake urgency / dark pattern detected by user",
        "categorySlug": "trust",
        "detectionSignal": "urgency_element AND bounce_correlation_high",
        "aiAction": "Remove manipulative elements; use genuine scarcity only"
      },
      {
        "id": "F146",
        "order": 146,
        "label": "International buyer worried about legitimacy",
        "categorySlug": "trust",
        "detectionSignal": "user_geo == international AND multiple trust_page_views",
        "aiAction": "Show international shipping partners, customs support, local reviews"
      }
    ]
  },
  {
    "id": "mobile_specific_friction",
    "order": 9,
    "label": "MOBILE-SPECIFIC FRICTION",
    "categorySlug": "mobile",
    "items": [
      {
        "id": "F147",
        "order": 147,
        "label": "Fat finger / misclick on mobile",
        "categorySlug": "mobile",
        "detectionSignal": "unintended_click_detected (click on wrong element)",
        "aiAction": "Increase touch target sizes; add confirmation for critical actions"
      },
      {
        "id": "F148",
        "order": 148,
        "label": "Pinch-to-zoom required (text/images too small)",
        "categorySlug": "mobile",
        "detectionSignal": "pinch_zoom_event_count >= 2",
        "aiAction": "Optimize responsive design; ensure readable font sizes"
      },
      {
        "id": "F149",
        "order": 149,
        "label": "Sticky header/footer covers content",
        "categorySlug": "mobile",
        "detectionSignal": "scroll_with_header_overlap > 30% viewport",
        "aiAction": "Reduce sticky element height; auto-hide on scroll down"
      },
      {
        "id": "F150",
        "order": 150,
        "label": "Form input difficult on mobile",
        "categorySlug": "mobile",
        "detectionSignal": "form_field_focus AND keyboard_type_mismatch",
        "aiAction": "Use correct input types (tel, email, number) for proper keyboard"
      },
      {
        "id": "F151",
        "order": 151,
        "label": "Horizontal scrolling required",
        "categorySlug": "mobile",
        "detectionSignal": "horizontal_scroll_detected",
        "aiAction": "Fix responsive breakpoints; prevent overflow"
      },
      {
        "id": "F152",
        "order": 152,
        "label": "Pop-up/modal hard to close on mobile",
        "categorySlug": "mobile",
        "detectionSignal": "modal_shown AND close_button_too_small AND rage_click",
        "aiAction": "Increase close button size; add tap-outside-to-dismiss"
      },
      {
        "id": "F153",
        "order": 153,
        "label": "Page jumps during load (CLS issues)",
        "categorySlug": "mobile",
        "detectionSignal": "cumulative_layout_shift > 0.25",
        "aiAction": "Reserve space for ads/images; prevent layout shifts"
      },
      {
        "id": "F154",
        "order": 154,
        "label": "Checkout form too long on mobile (excessive scrolling)",
        "categorySlug": "mobile",
        "detectionSignal": "checkout_form_scroll_depth > 300% viewport",
        "aiAction": "Collapse sections; use accordion; minimize fields"
      },
      {
        "id": "F155",
        "order": 155,
        "label": "App install banner blocks content",
        "categorySlug": "mobile",
        "detectionSignal": "app_banner_shown AND dismiss_time > 3s",
        "aiAction": "Show non-intrusive inline banner instead"
      },
      {
        "id": "F156",
        "order": 156,
        "label": "Touch carousel difficult to use",
        "categorySlug": "mobile",
        "detectionSignal": "carousel_swipe_failure_count >= 2",
        "aiAction": "Improve swipe sensitivity or switch to tap navigation"
      },
      {
        "id": "F157",
        "order": 157,
        "label": "Product images too small on mobile",
        "categorySlug": "mobile",
        "detectionSignal": "image_zoom_attempt on mobile >= 2",
        "aiAction": "Enable tap-to-fullscreen gallery"
      },
      {
        "id": "F158",
        "order": 158,
        "label": "Slow network on mobile (3G/poor connection)",
        "categorySlug": "mobile",
        "detectionSignal": "connection_speed < 1mbps",
        "aiAction": "Serve compressed images; lazy load; show offline-ready cached content"
      },
      {
        "id": "F159",
        "order": 159,
        "label": "Bottom navigation covers \"Add to Cart\"",
        "categorySlug": "mobile",
        "detectionSignal": "atc_button_obscured_by_nav == true",
        "aiAction": "Reposition ATC above bottom nav; or integrate into sticky bar"
      },
      {
        "id": "F160",
        "order": 160,
        "label": "Mobile keyboard overlaps \"Place Order\" button",
        "categorySlug": "mobile",
        "detectionSignal": "keyboard_open AND place_order_obscured",
        "aiAction": "Auto-scroll to keep CTA visible above keyboard"
      }
    ]
  },
  {
    "id": "technical_performance_friction",
    "order": 10,
    "label": "TECHNICAL & PERFORMANCE FRICTION",
    "categorySlug": "technical",
    "items": [
      {
        "id": "F161",
        "order": 161,
        "label": "Page crash / unresponsive",
        "categorySlug": "technical",
        "detectionSignal": "page_crash_event == true",
        "aiAction": "Auto-reload; save user state; show \"Something went wrong\" with retry"
      },
      {
        "id": "F162",
        "order": 162,
        "label": "JavaScript error preventing interaction",
        "categorySlug": "technical",
        "detectionSignal": "js_error_count > 0 on critical_element",
        "aiAction": "Fallback UI; error logging; degrade gracefully"
      },
      {
        "id": "F163",
        "order": 163,
        "label": "Image not loading (broken image)",
        "categorySlug": "technical",
        "detectionSignal": "image_load_error == true on pdp",
        "aiAction": "Show placeholder; lazy retry; log for content team"
      },
      {
        "id": "F164",
        "order": 164,
        "label": "Video won't play",
        "categorySlug": "technical",
        "detectionSignal": "video_play_error == true",
        "aiAction": "Show thumbnail + transcript; offer alternative format"
      },
      {
        "id": "F165",
        "order": 165,
        "label": "Checkout form submit fails silently",
        "categorySlug": "technical",
        "detectionSignal": "form_submit AND no_response AND no_error_shown",
        "aiAction": "Show explicit success/failure feedback"
      },
      {
        "id": "F166",
        "order": 166,
        "label": "Cart data lost after page refresh",
        "categorySlug": "technical",
        "detectionSignal": "cart_items_before_refresh > 0 AND cart_items_after == 0",
        "aiAction": "Persist cart server-side; recover on refresh"
      },
      {
        "id": "F167",
        "order": 167,
        "label": "Session expired during shopping",
        "categorySlug": "technical",
        "detectionSignal": "session_expired AND cart_items > 0",
        "aiAction": "Preserve cart; auto-restore on return; extend timeout"
      },
      {
        "id": "F168",
        "order": 168,
        "label": "Infinite loading spinner",
        "categorySlug": "technical",
        "detectionSignal": "spinner_visible > 15s",
        "aiAction": "Timeout and show error with retry; don't leave user hanging"
      },
      {
        "id": "F169",
        "order": 169,
        "label": "Search functionality broken",
        "categorySlug": "technical",
        "detectionSignal": "search_submit AND response_error",
        "aiAction": "Show fallback: popular categories + \"Browse instead\""
      },
      {
        "id": "F170",
        "order": 170,
        "label": "Filter/sort not responding",
        "categorySlug": "technical",
        "detectionSignal": "filter_click AND no_result_change AND no_loader",
        "aiAction": "Fix filter logic; show loading state"
      },
      {
        "id": "F171",
        "order": 171,
        "label": "Duplicate charges / double-submit",
        "categorySlug": "technical",
        "detectionSignal": "place_order_click_count >= 2 within 5s",
        "aiAction": "Disable button after first click; show processing state"
      },
      {
        "id": "F172",
        "order": 172,
        "label": "Add-to-cart button unresponsive",
        "categorySlug": "technical",
        "detectionSignal": "atc_click AND no_cart_update",
        "aiAction": "Fix handler; show loading feedback on click"
      },
      {
        "id": "F173",
        "order": 173,
        "label": "CAPTCHA blocks checkout flow",
        "categorySlug": "technical",
        "detectionSignal": "captcha_shown at checkout AND captcha_fail",
        "aiAction": "Use invisible CAPTCHA or risk-based challenge only"
      },
      {
        "id": "F174",
        "order": 174,
        "label": "Third-party script slowing page",
        "categorySlug": "technical",
        "detectionSignal": "third_party_script_load > 2s",
        "aiAction": "Async load; defer non-critical scripts"
      },
      {
        "id": "F175",
        "order": 175,
        "label": "Price rounding / calculation error displayed",
        "categorySlug": "technical",
        "detectionSignal": "displayed_total != sum(items + tax + shipping)",
        "aiAction": "Fix calculation logic; show itemized breakdown"
      },
      {
        "id": "F176",
        "order": 176,
        "label": "Browser back breaks checkout state",
        "categorySlug": "technical",
        "detectionSignal": "back_button during checkout AND state_lost",
        "aiAction": "Maintain checkout state with history API; warn before leaving"
      },
      {
        "id": "F177",
        "order": 177,
        "label": "WebSocket/live feature disconnection",
        "categorySlug": "technical",
        "detectionSignal": "live_feature_disconnected == true",
        "aiAction": "Auto-reconnect; show \"Reconnecting…\" status"
      }
    ]
  },
  {
    "id": "content_information_friction",
    "order": 11,
    "label": "CONTENT & INFORMATION FRICTION",
    "categorySlug": "content",
    "items": [
      {
        "id": "F178",
        "order": 178,
        "label": "Product description too short / vague",
        "categorySlug": "content",
        "detectionSignal": "description_word_count < 30 AND bounce_rate_high",
        "aiAction": "Enrich with AI-generated details; add specs and FAQs"
      },
      {
        "id": "F179",
        "order": 179,
        "label": "Product description too long / overwhelming",
        "categorySlug": "content",
        "detectionSignal": "description_word_count > 500 AND scroll_past_without_reading",
        "aiAction": "Add TL;DR summary; use expandable sections"
      },
      {
        "id": "F180",
        "order": 180,
        "label": "Product images low quality / insufficient",
        "categorySlug": "content",
        "detectionSignal": "image_count < 3 OR image_resolution < 500px",
        "aiAction": "Add more angles; enable user-uploaded photos"
      },
      {
        "id": "F181",
        "order": 181,
        "label": "No product video available",
        "categorySlug": "content",
        "detectionSignal": "video_available == false AND category_avg_has_video",
        "aiAction": "Add product video; even simple 360-spin"
      },
      {
        "id": "F182",
        "order": 182,
        "label": "Missing size/fit information",
        "categorySlug": "content",
        "detectionSignal": "size_info_absent AND category == apparel/shoes",
        "aiAction": "Add size guide, fit predictor, or AR try-on"
      },
      {
        "id": "F183",
        "order": 183,
        "label": "Product specs inconsistent with images",
        "categorySlug": "content",
        "detectionSignal": "spec_mismatch_flagged OR high_return_rate_for_product",
        "aiAction": "Audit and fix content accuracy"
      },
      {
        "id": "F184",
        "order": 184,
        "label": "Delivery/shipping info not visible on product page",
        "categorySlug": "content",
        "detectionSignal": "shipping_info_on_pdp == false",
        "aiAction": "Show estimated delivery date and cost on product page"
      },
      {
        "id": "F185",
        "order": 185,
        "label": "Return policy hard to find from product page",
        "categorySlug": "content",
        "detectionSignal": "return_policy_link_on_pdp == false",
        "aiAction": "Add inline return info: \"Free returns within 30 days\""
      },
      {
        "id": "F186",
        "order": 186,
        "label": "Sustainability/ethical info missing when user looks for it",
        "categorySlug": "content",
        "detectionSignal": "sustainability_page_search AND content_absent",
        "aiAction": "Add sustainability badges and info if applicable"
      },
      {
        "id": "F187",
        "order": 187,
        "label": "Comparison info missing between similar products",
        "categorySlug": "content",
        "detectionSignal": "user_views_similar_products >= 3 AND comparison_tool == false",
        "aiAction": "Offer side-by-side comparison tool"
      },
      {
        "id": "F188",
        "order": 188,
        "label": "FAQ section missing or outdated",
        "categorySlug": "content",
        "detectionSignal": "faq_section == absent OR faq_last_updated > 180_days",
        "aiAction": "Generate dynamic FAQ from common customer queries"
      },
      {
        "id": "F189",
        "order": 189,
        "label": "Product labels/badges confusing (too many)",
        "categorySlug": "content",
        "detectionSignal": "badge_count_on_product > 4",
        "aiAction": "Limit to 2-3 most impactful badges"
      },
      {
        "id": "F190",
        "order": 190,
        "label": "Ingredient/material info missing for sensitive categories",
        "categorySlug": "content",
        "detectionSignal": "category in [beauty, food, supplements] AND ingredient_list == absent",
        "aiAction": "Add ingredient list; required for informed purchasing"
      },
      {
        "id": "F191",
        "order": 191,
        "label": "Conflicting information between product page and cart",
        "categorySlug": "content",
        "detectionSignal": "pdp_info != cart_info (price, name, variant)",
        "aiAction": "Sync all data sources; audit consistency"
      }
    ]
  },
  {
    "id": "personalization_friction",
    "order": 12,
    "label": "PERSONALIZATION FRICTION",
    "categorySlug": "personalization",
    "items": [
      {
        "id": "F192",
        "order": 192,
        "label": "Irrelevant product recommendations",
        "categorySlug": "personalization",
        "detectionSignal": "recommendation_click_rate < 2% for user_segment",
        "aiAction": "Refine recommendation model; use collaborative filtering"
      },
      {
        "id": "F193",
        "order": 193,
        "label": "Recommendations show already-purchased items",
        "categorySlug": "personalization",
        "detectionSignal": "recommended_product in user_purchase_history",
        "aiAction": "Exclude purchased items from recommendations"
      },
      {
        "id": "F194",
        "order": 194,
        "label": "Not recognizing returning customer",
        "categorySlug": "personalization",
        "detectionSignal": "returning_user AND experience == generic",
        "aiAction": "Personalize: \"Welcome back\" + recently viewed + saved cart"
      },
      {
        "id": "F195",
        "order": 195,
        "label": "Showing wrong gender/demographic products",
        "categorySlug": "personalization",
        "detectionSignal": "user_profile_gender != recommended_product_gender",
        "aiAction": "Respect user preference data in recommendations"
      },
      {
        "id": "F196",
        "order": 196,
        "label": "Email personalization mismatch (wrong name/product)",
        "categorySlug": "personalization",
        "detectionSignal": "email_opened AND name_mismatch OR product_irrelevant",
        "aiAction": "Audit personalization data pipeline"
      },
      {
        "id": "F197",
        "order": 197,
        "label": "Personalized pricing perceived as unfair",
        "categorySlug": "personalization",
        "detectionSignal": "same_product_different_price_for_different_users_detected",
        "aiAction": "Ensure transparent pricing; avoid discriminatory pricing"
      },
      {
        "id": "F198",
        "order": 198,
        "label": "Quiz/preference tool result feels wrong",
        "categorySlug": "personalization",
        "detectionSignal": "quiz_completed AND result_page_exit_within < 15s",
        "aiAction": "Allow \"Not quite right\" refinement; show alternative results"
      },
      {
        "id": "F199",
        "order": 199,
        "label": "\"Based on your browsing\" shows embarrassing/private items",
        "categorySlug": "personalization",
        "detectionSignal": "sensitive_category in browsing_history AND recommendation_shown",
        "aiAction": "Exclude sensitive categories from visible recommendations"
      },
      {
        "id": "F200",
        "order": 200,
        "label": "Geo-based content wrong (travel, VPN)",
        "categorySlug": "personalization",
        "detectionSignal": "geo_detected_location != actual_location",
        "aiAction": "Allow manual location override"
      },
      {
        "id": "F201",
        "order": 201,
        "label": "Language auto-detection wrong",
        "categorySlug": "personalization",
        "detectionSignal": "detected_language != user_preferred_language",
        "aiAction": "Show easy language switcher; remember preference"
      },
      {
        "id": "F202",
        "order": 202,
        "label": "Recently viewed section cluttered with irrelevant items",
        "categorySlug": "personalization",
        "detectionSignal": "recently_viewed_count > 20 AND relevance_score_low",
        "aiAction": "Show smart \"Recently Viewed\" with category grouping"
      }
    ]
  },
  {
    "id": "social_proof_urgency_friction",
    "order": 13,
    "label": "SOCIAL PROOF & URGENCY FRICTION",
    "categorySlug": "social_proof",
    "items": [
      {
        "id": "F203",
        "order": 203,
        "label": "No reviews on product",
        "categorySlug": "social_proof",
        "detectionSignal": "review_count == 0",
        "aiAction": "Show \"First to review\" CTA; display category-level trust stats"
      },
      {
        "id": "F204",
        "order": 204,
        "label": "Reviews feel fake or unverified",
        "categorySlug": "social_proof",
        "detectionSignal": "review_verified_badge_absent AND reviews_all_5_star",
        "aiAction": "Add \"Verified Purchase\" badges; show balanced reviews"
      },
      {
        "id": "F205",
        "order": 205,
        "label": "Social proof notifications annoying (too frequent)",
        "categorySlug": "social_proof",
        "detectionSignal": "social_proof_popup_frequency > 1_per_30s",
        "aiAction": "Reduce frequency; make dismissible; respect user preference"
      },
      {
        "id": "F206",
        "order": 206,
        "label": "Urgency timer feels manipulative",
        "categorySlug": "social_proof",
        "detectionSignal": "timer_resets_on_refresh OR same_timer_across_days",
        "aiAction": "Use genuine stock-based scarcity only"
      },
      {
        "id": "F207",
        "order": 207,
        "label": "\"X people viewing this\" feels fake",
        "categorySlug": "social_proof",
        "detectionSignal": "concurrent_viewer_count_static OR inflated",
        "aiAction": "Use real data or remove; authenticity builds trust"
      },
      {
        "id": "F208",
        "order": 208,
        "label": "Low stock warning but stock never decreases",
        "categorySlug": "social_proof",
        "detectionSignal": "low_stock_shown AND stock_level_unchanged_for_days",
        "aiAction": "Use real inventory data; remove if not genuine"
      },
      {
        "id": "F209",
        "order": 209,
        "label": "No social media presence / proof",
        "categorySlug": "social_proof",
        "detectionSignal": "social_links_absent OR social_follower_count_low",
        "aiAction": "Build social presence; show UGC if available"
      },
      {
        "id": "F210",
        "order": 210,
        "label": "Influencer endorsement feels inauthentic",
        "categorySlug": "social_proof",
        "detectionSignal": "influencer_content AND negative_sentiment_in_comments",
        "aiAction": "Use micro-influencer authentic reviews instead"
      },
      {
        "id": "F211",
        "order": 211,
        "label": "Testimonials too generic (\"Great product!\")",
        "categorySlug": "social_proof",
        "detectionSignal": "testimonial_word_count < 10 for all displayed",
        "aiAction": "Curate detailed, specific testimonials with use cases"
      }
    ]
  },
  {
    "id": "communication_notification_friction",
    "order": 14,
    "label": "COMMUNICATION & NOTIFICATION FRICTION",
    "categorySlug": "communication",
    "items": [
      {
        "id": "F212",
        "order": 212,
        "label": "Abandoned cart email too early (within minutes)",
        "categorySlug": "communication",
        "detectionSignal": "abandon_email_sent_within < 300s",
        "aiAction": "Delay first email to 1-4 hours"
      },
      {
        "id": "F213",
        "order": 213,
        "label": "Abandoned cart email too late (days later)",
        "categorySlug": "communication",
        "detectionSignal": "abandon_email_sent_after > 72h",
        "aiAction": "Optimize timing: 1h → 24h → 72h cadence"
      },
      {
        "id": "F214",
        "order": 214,
        "label": "Too many marketing emails causing unsubscribe",
        "categorySlug": "communication",
        "detectionSignal": "email_frequency > 5_per_week AND unsubscribe == true",
        "aiAction": "Reduce frequency; let users set preferences"
      },
      {
        "id": "F215",
        "order": 215,
        "label": "Push notifications too frequent / irrelevant",
        "categorySlug": "communication",
        "detectionSignal": "push_frequency > 3_per_day OR push_relevance_low",
        "aiAction": "Reduce; personalize based on behavior"
      },
      {
        "id": "F216",
        "order": 216,
        "label": "SMS marketing without opt-in consent",
        "categorySlug": "communication",
        "detectionSignal": "sms_sent AND opt_in == false",
        "aiAction": "Ensure compliance; get explicit consent"
      },
      {
        "id": "F217",
        "order": 217,
        "label": "Notification arrives at wrong time (timezone)",
        "categorySlug": "communication",
        "detectionSignal": "notification_sent_at AND user_local_time == sleep_hours",
        "aiAction": "Send in user's timezone during active hours"
      },
      {
        "id": "F218",
        "order": 218,
        "label": "Customer service response too slow",
        "categorySlug": "communication",
        "detectionSignal": "support_ticket_age > 24h AND unresolved",
        "aiAction": "Escalate; send acknowledgment; offer alternatives"
      },
      {
        "id": "F219",
        "order": 219,
        "label": "Live chat unavailable when needed",
        "categorySlug": "communication",
        "detectionSignal": "chat_icon_clicked AND agents_online == 0",
        "aiAction": "Show chatbot fallback; collect contact for callback"
      },
      {
        "id": "F220",
        "order": 220,
        "label": "Chatbot can't understand user query",
        "categorySlug": "communication",
        "detectionSignal": "chatbot_intent_confidence < 0.3",
        "aiAction": "Escalate to human agent; show \"Talk to a person\" option"
      },
      {
        "id": "F221",
        "order": 221,
        "label": "Chatbot loops without resolution",
        "categorySlug": "communication",
        "detectionSignal": "chatbot_loop_count >= 3",
        "aiAction": "Force human handoff; apologize for inconvenience"
      },
      {
        "id": "F222",
        "order": 222,
        "label": "Order confirmation email delayed",
        "categorySlug": "communication",
        "detectionSignal": "order_placed AND confirmation_email_sent_after > 300s",
        "aiAction": "Send instant confirmation; queue detailed follow-up"
      },
      {
        "id": "F223",
        "order": 223,
        "label": "Shipping notification missing",
        "categorySlug": "communication",
        "detectionSignal": "order_shipped AND shipping_email_sent == false",
        "aiAction": "Automate shipping notification with tracking link"
      },
      {
        "id": "F224",
        "order": 224,
        "label": "Marketing email content doesn't match landing page",
        "categorySlug": "communication",
        "detectionSignal": "email_offer != landing_page_offer",
        "aiAction": "Sync email campaigns with live site content"
      }
    ]
  },
  {
    "id": "account_authentication_friction",
    "order": 15,
    "label": "ACCOUNT & AUTHENTICATION FRICTION",
    "categorySlug": "account",
    "items": [
      {
        "id": "F225",
        "order": 225,
        "label": "Forgot password during checkout",
        "categorySlug": "account",
        "detectionSignal": "password_reset_initiated during checkout_flow",
        "aiAction": "Offer guest checkout immediately; simplify reset"
      },
      {
        "id": "F226",
        "order": 226,
        "label": "Social login fails",
        "categorySlug": "account",
        "detectionSignal": "social_login_attempt AND social_login_error",
        "aiAction": "Offer alternative login methods; show clear error message"
      },
      {
        "id": "F227",
        "order": 227,
        "label": "Account creation form too long",
        "categorySlug": "account",
        "detectionSignal": "registration_form_fields > 6 AND registration_abandon == true",
        "aiAction": "Reduce to email + password; collect details later"
      },
      {
        "id": "F228",
        "order": 228,
        "label": "Email verification blocks immediate shopping",
        "categorySlug": "account",
        "detectionSignal": "email_verification_required AND delay > 0",
        "aiAction": "Allow shopping immediately; verify before checkout"
      },
      {
        "id": "F229",
        "order": 229,
        "label": "Password requirements too strict",
        "categorySlug": "account",
        "detectionSignal": "password_error_count >= 2 on strength_validation",
        "aiAction": "Show requirements upfront; use password strength meter"
      },
      {
        "id": "F230",
        "order": 230,
        "label": "Two-factor auth friction at login",
        "categorySlug": "account",
        "detectionSignal": "2fa_step AND login_abandon == true",
        "aiAction": "Offer \"Remember this device\" option"
      },
      {
        "id": "F231",
        "order": 231,
        "label": "Account locked after failed attempts",
        "categorySlug": "account",
        "detectionSignal": "login_attempt_count >= 5 AND account_locked",
        "aiAction": "Clear unlock path; offer alternative verification"
      },
      {
        "id": "F232",
        "order": 232,
        "label": "Guest checkout not remembered on return",
        "categorySlug": "account",
        "detectionSignal": "returning_user AND previous_order_as_guest AND no_recognition",
        "aiAction": "Offer \"Link to account\" with previous order data"
      },
      {
        "id": "F233",
        "order": 233,
        "label": "Saved payment method expired",
        "categorySlug": "account",
        "detectionSignal": "saved_payment_expired == true during checkout",
        "aiAction": "Prompt to update; pre-fill card form"
      },
      {
        "id": "F234",
        "order": 234,
        "label": "Profile data outdated (old address, old name)",
        "categorySlug": "account",
        "detectionSignal": "profile_last_updated > 365d AND checkout_address_changed",
        "aiAction": "Prompt profile update after checkout"
      },
      {
        "id": "F235",
        "order": 235,
        "label": "Login prompt during browsing interrupts flow",
        "categorySlug": "account",
        "detectionSignal": "login_modal_shown during browsing AND dismiss == true",
        "aiAction": "Defer login to cart/checkout; don't interrupt browsing"
      }
    ]
  },
  {
    "id": "shipping_delivery_friction",
    "order": 16,
    "label": "SHIPPING & DELIVERY FRICTION",
    "categorySlug": "shipping",
    "items": [
      {
        "id": "F236",
        "order": 236,
        "label": "Shipping cost too high",
        "categorySlug": "shipping",
        "detectionSignal": "shipping_cost > 15% of cart_value AND exit == true",
        "aiAction": "Offer free shipping threshold; show cheaper options"
      },
      {
        "id": "F237",
        "order": 237,
        "label": "Shipping cost not shown until checkout",
        "categorySlug": "shipping",
        "detectionSignal": "shipping_cost_first_shown_at == checkout",
        "aiAction": "Show estimated shipping on product page and cart"
      },
      {
        "id": "F238",
        "order": 238,
        "label": "Delivery estimate too slow",
        "categorySlug": "shipping",
        "detectionSignal": "estimated_delivery > 7_days AND exit == true",
        "aiAction": "Offer express option; show competitor delivery comparison"
      },
      {
        "id": "F239",
        "order": 239,
        "label": "No express/overnight shipping available",
        "categorySlug": "shipping",
        "detectionSignal": "express_shipping_available == false AND user_urgency_signals",
        "aiAction": "Add express option or partner with faster carrier"
      },
      {
        "id": "F240",
        "order": 240,
        "label": "International shipping not available",
        "categorySlug": "shipping",
        "detectionSignal": "user_geo == international AND intl_shipping == false",
        "aiAction": "Show \"Coming soon to your country\" + notify signup"
      },
      {
        "id": "F241",
        "order": 241,
        "label": "No in-store pickup option",
        "categorySlug": "shipping",
        "detectionSignal": "bopis_available == false AND user_near_store",
        "aiAction": "Enable BOPIS if feasible"
      },
      {
        "id": "F242",
        "order": 242,
        "label": "Delivery date range too wide (\"5-15 business days\")",
        "categorySlug": "shipping",
        "detectionSignal": "delivery_range > 10_days",
        "aiAction": "Narrow estimates; use carrier API for precision"
      },
      {
        "id": "F243",
        "order": 243,
        "label": "No order tracking available",
        "categorySlug": "shipping",
        "detectionSignal": "tracking_available == false",
        "aiAction": "Partner with trackable carrier; send updates proactively"
      },
      {
        "id": "F244",
        "order": 244,
        "label": "Shipping to PO Box not supported",
        "categorySlug": "shipping",
        "detectionSignal": "address_type == po_box AND shipping_error",
        "aiAction": "Clearly state PO Box policy; offer alternatives"
      },
      {
        "id": "F245",
        "order": 245,
        "label": "Shipping address validation failure",
        "categorySlug": "shipping",
        "detectionSignal": "address_validation_error == true",
        "aiAction": "Use address suggestion API; show \"Did you mean…?\""
      },
      {
        "id": "F246",
        "order": 246,
        "label": "Split shipment not communicated",
        "categorySlug": "shipping",
        "detectionSignal": "order_ships_in_multiple AND notification_absent",
        "aiAction": "Notify: \"Your order will arrive in 2 packages\""
      },
      {
        "id": "F247",
        "order": 247,
        "label": "Delivery attempted but failed",
        "categorySlug": "shipping",
        "detectionSignal": "delivery_failed AND no_redelivery_option",
        "aiAction": "Offer redelivery scheduling or pickup location"
      }
    ]
  },
  {
    "id": "return_refund_friction",
    "order": 17,
    "label": "RETURN & REFUND FRICTION",
    "categorySlug": "returns",
    "items": [
      {
        "id": "F248",
        "order": 248,
        "label": "Return process too complicated",
        "categorySlug": "returns",
        "detectionSignal": "return_steps > 4 OR return_page_bounce_rate_high",
        "aiAction": "Simplify: one-click return initiation"
      },
      {
        "id": "F249",
        "order": 249,
        "label": "Return shipping cost falls on customer",
        "categorySlug": "returns",
        "detectionSignal": "return_shipping_free == false AND return_initiation_abandon",
        "aiAction": "Offer free returns or prepaid labels"
      },
      {
        "id": "F250",
        "order": 250,
        "label": "Refund processing too slow",
        "categorySlug": "returns",
        "detectionSignal": "refund_initiated AND refund_completed_after > 14_days",
        "aiAction": "Speed up refund; send status updates"
      },
      {
        "id": "F251",
        "order": 251,
        "label": "Return window too short",
        "categorySlug": "returns",
        "detectionSignal": "return_window < 14_days AND return_policy_bounce",
        "aiAction": "Extend return window; show prominently"
      },
      {
        "id": "F252",
        "order": 252,
        "label": "No exchange option (return only)",
        "categorySlug": "returns",
        "detectionSignal": "exchange_option_available == false AND return_reason == wrong_size",
        "aiAction": "Offer direct exchange with instant shipping"
      },
      {
        "id": "F253",
        "order": 253,
        "label": "Return label generation broken",
        "categorySlug": "returns",
        "detectionSignal": "return_label_request AND error",
        "aiAction": "Provide manual instructions; email label as backup"
      },
      {
        "id": "F254",
        "order": 254,
        "label": "No return status tracking",
        "categorySlug": "returns",
        "detectionSignal": "return_shipped AND tracking_absent",
        "aiAction": "Add return tracking; send confirmation emails"
      },
      {
        "id": "F255",
        "order": 255,
        "label": "Restocking fee not disclosed upfront",
        "categorySlug": "returns",
        "detectionSignal": "restocking_fee_shown_at == return_confirmation_only",
        "aiAction": "Disclose fees on product page and at purchase"
      },
      {
        "id": "F256",
        "order": 256,
        "label": "Return policy different for sale items",
        "categorySlug": "returns",
        "detectionSignal": "sale_item_return_policy_different AND not_disclosed",
        "aiAction": "Clearly flag non-returnable sale items before purchase"
      },
      {
        "id": "F257",
        "order": 257,
        "label": "Refund to original payment method only (no store credit option)",
        "categorySlug": "returns",
        "detectionSignal": "refund_method == original_only AND user_wants_store_credit",
        "aiAction": "Offer both options: refund or store credit (with bonus)"
      }
    ]
  },
  {
    "id": "post_purchase_friction",
    "order": 18,
    "label": "POST-PURCHASE FRICTION",
    "categorySlug": "post_purchase",
    "items": [
      {
        "id": "F258",
        "order": 258,
        "label": "Order confirmation page unclear",
        "categorySlug": "post_purchase",
        "detectionSignal": "confirmation_page AND support_contact_within < 300s",
        "aiAction": "Clarify order details, delivery timeline, next steps"
      },
      {
        "id": "F259",
        "order": 259,
        "label": "No post-purchase engagement",
        "categorySlug": "post_purchase",
        "detectionSignal": "order_complete AND next_touchpoint == none for 30d",
        "aiAction": "Send thank-you email, care tips, complementary product suggestions"
      },
      {
        "id": "F260",
        "order": 260,
        "label": "Product doesn't match expectations (returns)",
        "categorySlug": "post_purchase",
        "detectionSignal": "return_reason == \"not as described\"",
        "aiAction": "Improve product content accuracy for that SKU"
      },
      {
        "id": "F261",
        "order": 261,
        "label": "Reorder process difficult",
        "categorySlug": "post_purchase",
        "detectionSignal": "reorder_attempt AND friction_detected",
        "aiAction": "Enable one-click reorder from order history"
      },
      {
        "id": "F262",
        "order": 262,
        "label": "Subscription management hard to find",
        "categorySlug": "post_purchase",
        "detectionSignal": "subscription_manage_page_search OR support_ticket == \"cancel subscription\"",
        "aiAction": "Make subscription management prominent in account"
      },
      {
        "id": "F263",
        "order": 263,
        "label": "Review request sent too early (before delivery)",
        "categorySlug": "post_purchase",
        "detectionSignal": "review_email_sent AND delivery_status != delivered",
        "aiAction": "Trigger review request only after confirmed delivery"
      },
      {
        "id": "F264",
        "order": 264,
        "label": "No loyalty reward after purchase",
        "categorySlug": "post_purchase",
        "detectionSignal": "loyalty_eligible AND points_not_awarded",
        "aiAction": "Auto-credit points; send confirmation"
      },
      {
        "id": "F265",
        "order": 265,
        "label": "Cross-sell email not relevant to purchase",
        "categorySlug": "post_purchase",
        "detectionSignal": "cross_sell_email AND product_relevance_score < 0.3",
        "aiAction": "Improve recommendation model; use purchase context"
      },
      {
        "id": "F266",
        "order": 266,
        "label": "Package arrived damaged",
        "categorySlug": "post_purchase",
        "detectionSignal": "damage_report_filed == true",
        "aiAction": "Expedite replacement; pre-approve refund"
      },
      {
        "id": "F267",
        "order": 267,
        "label": "Invoice/receipt not easily accessible",
        "categorySlug": "post_purchase",
        "detectionSignal": "invoice_download_search OR support_ticket == \"receipt\"",
        "aiAction": "Auto-email invoice; add to order history page"
      },
      {
        "id": "F268",
        "order": 268,
        "label": "Order modification not possible after placement",
        "categorySlug": "post_purchase",
        "detectionSignal": "order_edit_attempt AND edit_window_closed",
        "aiAction": "Allow 30-min edit window; or show cancellation option"
      }
    ]
  },
  {
    "id": "re_engagement_friction",
    "order": 19,
    "label": "RE-ENGAGEMENT FRICTION",
    "categorySlug": "re_engagement",
    "items": [
      {
        "id": "F269",
        "order": 269,
        "label": "Returning user's cart is empty (was full before)",
        "categorySlug": "re_engagement",
        "detectionSignal": "returning_user AND previous_cart_items > 0 AND current_cart == 0",
        "aiAction": "Restore saved cart: \"Welcome back! Your items are still here\""
      },
      {
        "id": "F270",
        "order": 270,
        "label": "Returning user can't find previously viewed product",
        "categorySlug": "re_engagement",
        "detectionSignal": "returning_user AND search_for_previous_product",
        "aiAction": "Show \"Recently Viewed\" prominently; enable persistent history"
      },
      {
        "id": "F271",
        "order": 271,
        "label": "Win-back email ignored",
        "categorySlug": "re_engagement",
        "detectionSignal": "winback_email_sent_count >= 2 AND open_rate == 0",
        "aiAction": "Try different channel (SMS, push, retargeting ad)"
      },
      {
        "id": "F272",
        "order": 272,
        "label": "Previously purchased product now discontinued",
        "categorySlug": "re_engagement",
        "detectionSignal": "reorder_attempt AND product_status == discontinued",
        "aiAction": "Show successor product or close alternative"
      },
      {
        "id": "F273",
        "order": 273,
        "label": "Loyalty points about to expire",
        "categorySlug": "re_engagement",
        "detectionSignal": "loyalty_points_expiry < 30d AND user_inactive",
        "aiAction": "Notify: \"You have $X in points expiring — use them now\""
      },
      {
        "id": "F274",
        "order": 274,
        "label": "User downgraded (was VIP, now inactive)",
        "categorySlug": "re_engagement",
        "detectionSignal": "user_tier_decreased AND session_started",
        "aiAction": "Offer win-back incentive to restore tier"
      },
      {
        "id": "F275",
        "order": 275,
        "label": "Subscription cancelled user browsing again",
        "categorySlug": "re_engagement",
        "detectionSignal": "subscription_status == cancelled AND session_active",
        "aiAction": "Show \"Restart and save\" or \"What's new since you left\""
      },
      {
        "id": "F276",
        "order": 276,
        "label": "Seasonal shopper not returning this season",
        "categorySlug": "re_engagement",
        "detectionSignal": "seasonal_buyer AND no_visit_in_season",
        "aiAction": "Proactive outreach with seasonal recommendations"
      },
      {
        "id": "F277",
        "order": 277,
        "label": "Wishlist items on sale but user not notified",
        "categorySlug": "re_engagement",
        "detectionSignal": "wishlist_item_price_drop AND notification_sent == false",
        "aiAction": "Send price drop alert for wishlisted items"
      }
    ]
  },
  {
    "id": "accessibility_friction",
    "order": 20,
    "label": "ACCESSIBILITY FRICTION",
    "categorySlug": "accessibility",
    "items": [
      {
        "id": "F278",
        "order": 278,
        "label": "Screen reader can't parse product page",
        "categorySlug": "accessibility",
        "detectionSignal": "aria_labels_missing OR heading_structure_broken",
        "aiAction": "Fix semantic HTML; add ARIA labels"
      },
      {
        "id": "F279",
        "order": 279,
        "label": "Keyboard navigation trapped in modal",
        "categorySlug": "accessibility",
        "detectionSignal": "focus_trap_in_modal AND escape_key_not_working",
        "aiAction": "Ensure keyboard trap release; add visible close"
      },
      {
        "id": "F280",
        "order": 280,
        "label": "Color contrast insufficient",
        "categorySlug": "accessibility",
        "detectionSignal": "contrast_ratio < 4.5:1 on text_elements",
        "aiAction": "Increase contrast to WCAG AA compliance"
      },
      {
        "id": "F281",
        "order": 281,
        "label": "No alt text on product images",
        "categorySlug": "accessibility",
        "detectionSignal": "alt_text_missing on product_images",
        "aiAction": "Add descriptive alt text for all images"
      },
      {
        "id": "F282",
        "order": 282,
        "label": "Form labels missing / not associated",
        "categorySlug": "accessibility",
        "detectionSignal": "label_for_mismatch OR label_absent",
        "aiAction": "Fix label-input associations"
      },
      {
        "id": "F283",
        "order": 283,
        "label": "Touch targets too small (mobile)",
        "categorySlug": "accessibility",
        "detectionSignal": "touch_target_size < 44px",
        "aiAction": "Increase to minimum 44x44px"
      },
      {
        "id": "F284",
        "order": 284,
        "label": "Animation causes motion sickness",
        "categorySlug": "accessibility",
        "detectionSignal": "animation_intense AND prefers_reduced_motion_ignored",
        "aiAction": "Respect prefers-reduced-motion media query"
      },
      {
        "id": "F285",
        "order": 285,
        "label": "Timeout without warning (accessibility need)",
        "categorySlug": "accessibility",
        "detectionSignal": "session_timeout AND no_warning AND user_pace_slow",
        "aiAction": "Extend timeout; add warning; allow extension"
      },
      {
        "id": "F286",
        "order": 286,
        "label": "Error messages not announced to screen reader",
        "categorySlug": "accessibility",
        "detectionSignal": "form_error AND aria_live_absent",
        "aiAction": "Add aria-live=\"assertive\" on error regions"
      }
    ]
  },
  {
    "id": "multi_channel_cross_device_friction",
    "order": 21,
    "label": "MULTI-CHANNEL & CROSS-DEVICE FRICTION",
    "categorySlug": "cross_channel",
    "items": [
      {
        "id": "F287",
        "order": 287,
        "label": "Cart not synced across devices",
        "categorySlug": "cross_channel",
        "detectionSignal": "cart_on_device_A != cart_on_device_B for same_user",
        "aiAction": "Sync cart via user account in real-time"
      },
      {
        "id": "F288",
        "order": 288,
        "label": "Wishlist not accessible on other device",
        "categorySlug": "cross_channel",
        "detectionSignal": "wishlist_on_device_A AND not_on_device_B",
        "aiAction": "Cloud-sync wishlist for logged-in users"
      },
      {
        "id": "F289",
        "order": 289,
        "label": "Mobile app experience inconsistent with web",
        "categorySlug": "cross_channel",
        "detectionSignal": "feature_parity_gap between app and web",
        "aiAction": "Audit and align feature set"
      },
      {
        "id": "F290",
        "order": 290,
        "label": "In-store inventory shown as online-only",
        "categorySlug": "cross_channel",
        "detectionSignal": "stock_location_type == online_only AND user_near_store",
        "aiAction": "Show \"Available at [Store]\" with real-time inventory"
      },
      {
        "id": "F291",
        "order": 291,
        "label": "BOPIS item not ready at promised time",
        "categorySlug": "cross_channel",
        "detectionSignal": "bopis_ready_time > promised_time",
        "aiAction": "Send delay notification; offer compensation"
      },
      {
        "id": "F292",
        "order": 292,
        "label": "Email link opens mobile web instead of app",
        "categorySlug": "cross_channel",
        "detectionSignal": "email_link_opens == mobile_web AND app_installed",
        "aiAction": "Use deep links to open in app"
      },
      {
        "id": "F293",
        "order": 293,
        "label": "Promo code from email doesn't work online",
        "categorySlug": "cross_channel",
        "detectionSignal": "promo_code_from_email AND online_validation_fail",
        "aiAction": "Sync promotional systems across all channels"
      },
      {
        "id": "F294",
        "order": 294,
        "label": "Different prices on app vs website",
        "categorySlug": "cross_channel",
        "detectionSignal": "app_price != web_price for same_product",
        "aiAction": "Unify pricing engine across platforms"
      }
    ]
  },
  {
    "id": "decision_paralysis_friction",
    "order": 22,
    "label": "DECISION PARALYSIS FRICTION",
    "categorySlug": "decision",
    "items": [
      {
        "id": "F295",
        "order": 295,
        "label": "Too many similar products (overwhelm)",
        "categorySlug": "decision",
        "detectionSignal": "category_viewed AND product_count > 50 AND scroll_depth < 20% AND exit",
        "aiAction": "Show \"Top Picks\" or AI-curated shortlist"
      },
      {
        "id": "F296",
        "order": 296,
        "label": "User views 10+ products without adding any to cart",
        "categorySlug": "decision",
        "detectionSignal": "pdp_view_count >= 10 AND add_to_cart == 0",
        "aiAction": "Offer \"Need help deciding?\" quiz or comparison tool"
      },
      {
        "id": "F297",
        "order": 297,
        "label": "User toggles between 2-3 products repeatedly",
        "categorySlug": "decision",
        "detectionSignal": "product_toggle_count >= 4 between same products",
        "aiAction": "Show side-by-side comparison automatically"
      },
      {
        "id": "F298",
        "order": 298,
        "label": "User adds multiple similar items then removes all but one",
        "categorySlug": "decision",
        "detectionSignal": "add_similar_items >= 3 then remove_all_but_1",
        "aiAction": "Confirm choice: \"Great pick! Here's why others love it\""
      },
      {
        "id": "F299",
        "order": 299,
        "label": "Variant selection takes too long",
        "categorySlug": "decision",
        "detectionSignal": "variant_interaction_time > 60s AND add_to_cart == false",
        "aiAction": "Offer \"Most popular\" variant badge or \"Recommended for you\""
      },
      {
        "id": "F300",
        "order": 300,
        "label": "Gift shopper doesn't know what to pick",
        "categorySlug": "decision",
        "detectionSignal": "gift_signals == true AND session_duration > 600s AND cart == empty",
        "aiAction": "Offer gift guides, gift cards, or \"Shop by recipient\" tool"
      },
      {
        "id": "F301",
        "order": 301,
        "label": "User reads comparisons but doesn't choose",
        "categorySlug": "decision",
        "detectionSignal": "comparison_tool_used AND no_selection_within 300s",
        "aiAction": "Show \"Editor's Pick\" or \"Best Value\" recommendation"
      },
      {
        "id": "F302",
        "order": 302,
        "label": "Bundle vs individual items confusion",
        "categorySlug": "decision",
        "detectionSignal": "bundle_viewed AND individual_viewed AND toggle >= 3",
        "aiAction": "Show clear savings breakdown: bundle vs individual"
      }
    ]
  },
  {
    "id": "payment_specific_friction",
    "order": 23,
    "label": "PAYMENT-SPECIFIC FRICTION",
    "categorySlug": "payment",
    "items": [
      {
        "id": "F303",
        "order": 303,
        "label": "Credit card type not accepted",
        "categorySlug": "payment",
        "detectionSignal": "card_type_submitted AND card_type_not_supported",
        "aiAction": "Show accepted cards upfront; offer alternative methods"
      },
      {
        "id": "F304",
        "order": 304,
        "label": "Digital wallet not available",
        "categorySlug": "payment",
        "detectionSignal": "user_device supports wallet AND wallet_option_absent",
        "aiAction": "Enable Apple Pay / Google Pay"
      },
      {
        "id": "F305",
        "order": 305,
        "label": "BNPL declined",
        "categorySlug": "payment",
        "detectionSignal": "bnpl_application AND bnpl_declined",
        "aiAction": "Offer alternative BNPL or standard payment with empathetic messaging"
      },
      {
        "id": "F306",
        "order": 306,
        "label": "Installment terms unclear",
        "categorySlug": "payment",
        "detectionSignal": "bnpl_viewed AND bnpl_terms_page_exit < 10s",
        "aiAction": "Show clear breakdown: \"4 payments of $X, 0% interest\""
      },
      {
        "id": "F307",
        "order": 307,
        "label": "Currency conversion at bank rate warning",
        "categorySlug": "payment",
        "detectionSignal": "international_card AND no_multi_currency_support",
        "aiAction": "Show price in user's currency; absorb conversion fee"
      },
      {
        "id": "F308",
        "order": 308,
        "label": "Saved card details wrong / outdated",
        "categorySlug": "payment",
        "detectionSignal": "saved_card_declined AND user_confusion_signals",
        "aiAction": "Prompt: \"Update your card\" with clear form"
      },
      {
        "id": "F309",
        "order": 309,
        "label": "PayPal popup blocked by browser",
        "categorySlug": "payment",
        "detectionSignal": "paypal_redirect AND popup_blocked",
        "aiAction": "Detect blocker; show \"Please allow popups\" guidance"
      },
      {
        "id": "F310",
        "order": 310,
        "label": "Gift card balance insufficient for order",
        "categorySlug": "payment",
        "detectionSignal": "gift_card_balance < order_total",
        "aiAction": "Allow split payment: gift card + another method"
      },
      {
        "id": "F311",
        "order": 311,
        "label": "Crypto payment option confusing",
        "categorySlug": "payment",
        "detectionSignal": "crypto_payment_selected AND payment_abandon",
        "aiAction": "Simplify instructions; show QR code with clear steps"
      },
      {
        "id": "F312",
        "order": 312,
        "label": "Invoice / NET terms request not available (B2B)",
        "categorySlug": "payment",
        "detectionSignal": "b2b_user AND invoice_payment_absent",
        "aiAction": "Add invoice option for verified business accounts"
      }
    ]
  },
  {
    "id": "legal_compliance_friction",
    "order": 24,
    "label": "LEGAL & COMPLIANCE FRICTION",
    "categorySlug": "compliance",
    "items": [
      {
        "id": "F313",
        "order": 313,
        "label": "GDPR consent flow blocks shopping",
        "categorySlug": "compliance",
        "detectionSignal": "consent_modal AND interaction_blocked_until_consent",
        "aiAction": "Use non-blocking consent bar; allow browsing immediately"
      },
      {
        "id": "F314",
        "order": 314,
        "label": "Age verification gate too strict",
        "categorySlug": "compliance",
        "detectionSignal": "age_gate_shown AND exit_rate_high",
        "aiAction": "Streamline: simple date input vs full document upload"
      },
      {
        "id": "F315",
        "order": 315,
        "label": "Product restricted in user's region",
        "categorySlug": "compliance",
        "detectionSignal": "product_available == false for user_geo",
        "aiAction": "Show message clearly; suggest available alternatives"
      },
      {
        "id": "F316",
        "order": 316,
        "label": "Cookie preferences reset on every visit",
        "categorySlug": "compliance",
        "detectionSignal": "cookie_preferences AND repeat_modal_shown",
        "aiAction": "Persist cookie choices properly"
      },
      {
        "id": "F317",
        "order": 317,
        "label": "Terms of service too long to accept",
        "categorySlug": "compliance",
        "detectionSignal": "tos_page_length > 5000_words AND checkbox_hesitation",
        "aiAction": "Show summary + expandable full text"
      },
      {
        "id": "F318",
        "order": 318,
        "label": "Data export/deletion request difficult",
        "categorySlug": "compliance",
        "detectionSignal": "user_data_request AND process_steps > 3",
        "aiAction": "Self-service data management in account settings"
      }
    ]
  },
  {
    "id": "seasonal_contextual_friction",
    "order": 25,
    "label": "SEASONAL & CONTEXTUAL FRICTION",
    "categorySlug": "seasonal",
    "items": [
      {
        "id": "F319",
        "order": 319,
        "label": "Holiday gift deadline approaching but delivery won't make it",
        "categorySlug": "seasonal",
        "detectionSignal": "order_date + delivery_estimate > holiday_date",
        "aiAction": "Show \"Order by [date] for guaranteed delivery\" warning"
      },
      {
        "id": "F320",
        "order": 320,
        "label": "Gift wrapping unavailable during gift season",
        "categorySlug": "seasonal",
        "detectionSignal": "holiday_season AND gift_wrap_absent",
        "aiAction": "Enable seasonal gift wrapping option"
      },
      {
        "id": "F321",
        "order": 321,
        "label": "Black Friday/sale site overloaded",
        "categorySlug": "seasonal",
        "detectionSignal": "server_response_time > 5s during sale_event",
        "aiAction": "Queue system with estimated wait; increase capacity"
      },
      {
        "id": "F322",
        "order": 322,
        "label": "Seasonal product sold out",
        "categorySlug": "seasonal",
        "detectionSignal": "seasonal_product AND stock == 0 AND demand_high",
        "aiAction": "Waitlist + notification for restock or next season"
      },
      {
        "id": "F323",
        "order": 323,
        "label": "Back-to-school items not grouped for easy shopping",
        "categorySlug": "seasonal",
        "detectionSignal": "seasonal_context == back_to_school AND category_browse_high",
        "aiAction": "Create curated seasonal landing page"
      },
      {
        "id": "F324",
        "order": 324,
        "label": "Weather-triggered product need not served",
        "categorySlug": "seasonal",
        "detectionSignal": "weather_api == extreme_cold/heat AND relevant_products_not_promoted",
        "aiAction": "Dynamic merchandising based on local weather"
      },
      {
        "id": "F325",
        "order": 325,
        "label": "Post-holiday return surge overwhelming support",
        "categorySlug": "seasonal",
        "detectionSignal": "support_ticket_volume > 200% baseline AND response_time > 48h",
        "aiAction": "Scale support; add self-service return portal"
      }
    ]
  }
];

export const FRICTION_CATEGORY_PACKS = FRICTION_CATEGORY_CATALOG.map((category) => ({
  id: category.id,
  label: category.label,
  description: String(category.items.length) + " frictions",
  frictionIds: category.items.map((item) => item.id),
}));

export const FRICTION_SUBCATEGORY_OPTIONS = FRICTION_CATEGORY_CATALOG.flatMap((category) =>
  category.items.map((item) => ({
    ...item,
    categoryId: category.id,
    categoryLabel: category.label,
  })),
);

export const FRICTION_SUBCATEGORY_BY_ID = new Map(
  FRICTION_SUBCATEGORY_OPTIONS.map((item) => [item.id, item]),
);

export const FRICTION_CATEGORY_BY_ID = new Map(
  FRICTION_CATEGORY_CATALOG.map((category) => [category.id, category]),
);
