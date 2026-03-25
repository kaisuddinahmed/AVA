"use strict";
/**
 * AVA Severity Scores — lookup table for all 325 friction IDs (F001–F325)
 *
 * Explicitly defined scores (from ava_project_structure.md MSWIM spec):
 *   F001 = 45, F002 = 30, F028 = 65, F058 = 55, F068 = 80, F089 = 90,
 *   F091 = 60, F094 = 75, F117 = 70, F131 = 50, F297 = 65
 *
 * Remaining scores assigned by category severity band:
 *   Landing/navigation: 30–55   |  Search: 45–70        |  Product: 35–65
 *   Cart: 55–85                 |  Checkout: 60–90       |  Pricing: 50–75
 *   Trust: 40–60                |  Mobile: 35–55         |  Technical: 50–80
 *   Content: 30–50              |  Personalization: 25–45 |  Social proof: 25–45
 *   Communication: 30–50        |  Account: 40–65        |  Shipping: 45–70
 *   Returns: 40–60              |  Post-purchase: 30–50  |  Re-engagement: 35–55
 *   Accessibility: 35–55        |  Cross-channel: 35–55  |  Decision: 50–70
 *   Payment: 65–90              |  Compliance: 35–55     |  Seasonal: 40–60
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEVERITY_SCORES = void 0;
exports.getSeverity = getSeverity;
exports.SEVERITY_SCORES = {
    // =========================================================================
    // CATEGORY 01: LANDING & FIRST IMPRESSION (F001–F012) — Range 30–55
    // =========================================================================
    F001: 45, // Slow page load on entry (explicitly defined)
    F002: 30, // Bounce within 5 seconds (explicitly defined)
    F003: 50, // Lands on 404 / broken page
    F004: 48, // Lands on out-of-stock product (from ad/email)
    F005: 40, // Geo-mismatch (wrong currency/language)
    F006: 45, // Mobile user on non-responsive page
    F007: 32, // First-time visitor with no context
    F008: 35, // Lands from price comparison site
    F009: 42, // Popup/modal blocks content immediately
    F010: 38, // Cookie consent banner covers key CTA
    F011: 44, // Aggressive popup triggers immediate exit
    F012: 36, // Promotional banner links to expired offer
    // =========================================================================
    // CATEGORY 02: NAVIGATION & DISCOVERY (F013–F027) — Range 30–55
    // =========================================================================
    F013: 42, // Can't find category (excessive menu depth)
    F014: 35, // Clicks wrong category, immediately backtracks
    F015: 40, // Scrolls entire page without clicking anything
    F016: 48, // Uses browser back button repeatedly
    F017: 38, // Dead-end page (no next action visible)
    F018: 50, // Excessive filter usage with no results
    F019: 48, // Filter combination returns 0 results
    F020: 52, // Pogo-sticking (repeatedly entering and leaving pages)
    F021: 35, // Hamburger menu not discovered (mobile)
    F022: 44, // Breadcrumb not used, user is lost
    F023: 36, // Clicked non-clickable element
    F024: 40, // Category page has too many products (overwhelm)
    F025: 46, // User clicks logo repeatedly
    F026: 42, // Horizontal scroll on mobile (broken layout)
    F027: 32, // Footer links used as primary navigation
    // =========================================================================
    // CATEGORY 03: SEARCH (F028–F041) — Range 45–70
    // =========================================================================
    F028: 65, // Search returns zero results (explicitly defined)
    F029: 50, // Misspelled search query
    F030: 48, // Vague/generic search term
    F031: 58, // Multiple refined searches (3+ in session)
    F032: 62, // Search results irrelevant to query
    F033: 52, // Searched but didn't click any result
    F034: 55, // Searched for competitor product/brand
    F035: 45, // Searched for coupon/discount/promo code
    F036: 60, // Searched for return/refund/cancel
    F037: 46, // Search autocomplete ignored
    F038: 58, // Voice search failed / not recognized
    F039: 55, // Image/visual search returned poor matches
    F040: 50, // Searched for product that exists but is hidden/unlisted
    F041: 48, // Repeated identical search across sessions
    // =========================================================================
    // CATEGORY 04: PRODUCT PAGE (F042–F067) — Range 35–65
    // =========================================================================
    F042: 35, // Viewed product page but left quickly (<10s)
    F043: 50, // Long dwell on product page, no action (>3min)
    F044: 48, // Viewed product multiple times across sessions
    F045: 52, // Scrolled to reviews but bounced after reading
    F046: 55, // Read mostly negative reviews
    F047: 40, // Zoomed into product images repeatedly
    F048: 50, // Size/variant selector interacted but not confirmed
    F049: 48, // Size guide opened but user still didn't add to cart
    F050: 38, // Product description not scrolled to
    F051: 58, // Checked shipping info, then left
    F052: 55, // Checked return policy, then left
    F053: 60, // Out-of-stock product viewed
    F054: 45, // Low stock but user didn't act
    F055: 48, // Compared variants but chose none
    F056: 36, // Clicked on product from recommendation but left
    F057: 35, // Product video not played (exists but ignored)
    F058: 55, // Hovered over "Add to Cart" but didn't click (explicitly defined)
    F059: 42, // Price not visible without scrolling
    F060: 52, // User copied product title/price (comparison shopping)
    F061: 38, // Clicked on a trust badge / certification for more info
    F062: 40, // User tried to share product but feature missing/broken
    F063: 42, // Product page has no reviews
    F064: 46, // Specification/material info missing
    F065: 44, // Clicked multiple color swatches without adding to cart
    F066: 40, // Viewed product bundle option but didn't select
    F067: 50, // Pricing feels unclear (multiple prices, strikethrough confusion)
    // =========================================================================
    // CATEGORY 05: CART (F068–F088) — Range 55–85
    // =========================================================================
    F068: 80, // Added to cart but didn't proceed to checkout (explicitly defined)
    F069: 65, // Cart idle for extended period (>30 min in session)
    F070: 60, // Removed item from cart
    F071: 72, // Removed item after seeing subtotal
    F072: 78, // Cleared entire cart
    F073: 68, // Added then removed same item multiple times
    F074: 70, // Cart total exceeds user's apparent budget threshold
    F075: 62, // Applied coupon code — rejected
    F076: 65, // Tried multiple coupon codes (code hunting)
    F077: 55, // Cart contains only sale items
    F078: 56, // Cart contains items from different categories (gift shopping?)
    F079: 82, // Cart item went out of stock
    F080: 60, // Cart not synced across devices
    F081: 75, // Shipping cost revealed in cart (shock)
    F082: 55, // Mini-cart doesn't show enough info
    F083: 62, // Cart page loads slowly
    F084: 58, // User edits quantity up then back down
    F085: 56, // Cart page has distracting upsell overload
    F086: 68, // Estimated delivery date too far out
    F087: 74, // Tax/duty amount surprises user
    F088: 78, // User returns to cart page 3+ times without checkout
    // =========================================================================
    // CATEGORY 06: CHECKOUT (F089–F116) — Range 60–90
    // =========================================================================
    F089: 90, // Forced account creation blocks checkout (explicitly defined)
    F090: 72, // Checkout form too long (too many fields)
    F091: 60, // Form validation errors on submit (explicitly defined)
    F092: 68, // Repeated form validation errors (same field)
    F093: 65, // Address auto-complete not working
    F094: 75, // User pauses at payment information entry (explicitly defined)
    F095: 78, // Preferred payment method not available
    F096: 85, // Payment failed / declined
    F097: 88, // Multiple payment attempts failed
    F098: 82, // 3D Secure / OTP verification failed
    F099: 70, // Promo code field visible but no code to enter
    F100: 62, // Shipping options confusing (too many choices)
    F101: 76, // Checkout page redirects to third party (trust break)
    F102: 60, // Progress indicator missing
    F103: 66, // User backtracks in checkout flow
    F104: 62, // Billing address form when same as shipping
    F105: 68, // Slow payment processing (spinner too long)
    F106: 64, // Order summary not visible during checkout
    F107: 82, // Unexpected fee added at final step
    F108: 60, // Gift option not available when needed
    F109: 65, // BNPL option not prominent enough
    F110: 66, // Mobile keyboard covers form fields
    F111: 70, // Autofill populates wrong fields
    F112: 80, // Checkout timeout / session expired
    F113: 62, // Terms & conditions checkbox buried or confusing
    F114: 68, // Final "Place Order" button not prominent
    F115: 72, // Currency mismatch at checkout
    F116: 64, // User toggles between shipping methods repeatedly
    // =========================================================================
    // CATEGORY 07: PRICING & VALUE (F117–F130) — Range 50–75
    // =========================================================================
    F117: 70, // Price higher than expected / sticker shock (explicitly defined)
    F118: 60, // User checks price multiple times across sessions
    F119: 68, // Price discrepancy between listing and product page
    F120: 72, // Competitor price found lower (user left to compare)
    F121: 66, // Total cost significantly higher than item price
    F122: 52, // BNPL/installment info not shown on product page
    F123: 55, // Struck-through original price not credible
    F124: 50, // Bulk/volume discount not communicated
    F125: 54, // User compares similar products by price only
    F126: 58, // Free shipping threshold just out of reach
    F127: 62, // International pricing / duty confusion
    F128: 56, // Subscription price vs one-time price unclear
    F129: 65, // Sale countdown timer feels fake/manipulative
    F130: 52, // Membership/loyalty discount not visible to eligible user
    // =========================================================================
    // CATEGORY 08: TRUST & SECURITY (F131–F146) — Range 40–60
    // =========================================================================
    F131: 50, // No SSL/security indicator visible (explicitly defined)
    F132: 42, // User checks About Us / Company info before purchasing
    F133: 44, // User reads privacy policy during checkout
    F134: 48, // No customer reviews on product
    F135: 52, // Only negative reviews visible (sorted by recent)
    F136: 55, // User searches for "[brand] reviews/scam"
    F137: 56, // Payment page looks different from rest of site
    F138: 54, // Third-party payment redirect without explanation
    F139: 50, // Missing return/refund policy information
    F140: 40, // User hovers on security badge for details
    F141: 46, // New brand / user has never purchased before
    F142: 45, // Social proof missing (no purchase count, no testimonials)
    F143: 42, // User visited third-party review site during session
    F144: 48, // Contact information hard to find
    F145: 58, // Fake urgency / dark pattern detected by user
    F146: 52, // International buyer worried about legitimacy
    // =========================================================================
    // CATEGORY 09: MOBILE-SPECIFIC (F147–F160) — Range 35–55
    // =========================================================================
    F147: 40, // Fat finger / misclick on mobile
    F148: 42, // Pinch-to-zoom required (text/images too small)
    F149: 45, // Sticky header/footer covers content
    F150: 48, // Form input difficult on mobile
    F151: 44, // Horizontal scrolling required
    F152: 50, // Pop-up/modal hard to close on mobile
    F153: 46, // Page jumps during load (CLS issues)
    F154: 52, // Checkout form too long on mobile (excessive scrolling)
    F155: 38, // App install banner blocks content
    F156: 42, // Touch carousel difficult to use
    F157: 40, // Product images too small on mobile
    F158: 50, // Slow network on mobile (3G/poor connection)
    F159: 48, // Bottom navigation covers "Add to Cart"
    F160: 52, // Mobile keyboard overlaps "Place Order" button
    // =========================================================================
    // CATEGORY 10: TECHNICAL & PERFORMANCE (F161–F177) — Range 50–80
    // =========================================================================
    F161: 80, // Page crash / unresponsive
    F162: 75, // JavaScript error preventing interaction
    F163: 55, // Image not loading (broken image)
    F164: 52, // Video won't play
    F165: 78, // Checkout form submit fails silently
    F166: 76, // Cart data lost after page refresh
    F167: 72, // Session expired during shopping
    F168: 68, // Infinite loading spinner
    F169: 70, // Search functionality broken
    F170: 62, // Filter/sort not responding
    F171: 80, // Duplicate charges / double-submit
    F172: 72, // Add-to-cart button unresponsive
    F173: 68, // CAPTCHA blocks checkout flow
    F174: 55, // Third-party script slowing page
    F175: 74, // Price rounding / calculation error displayed
    F176: 70, // Browser back breaks checkout state
    F177: 58, // WebSocket/live feature disconnection
    // =========================================================================
    // CATEGORY 11: CONTENT & INFORMATION (F178–F191) — Range 30–50
    // =========================================================================
    F178: 40, // Product description too short / vague
    F179: 35, // Product description too long / overwhelming
    F180: 42, // Product images low quality / insufficient
    F181: 34, // No product video available
    F182: 48, // Missing size/fit information
    F183: 46, // Product specs inconsistent with images
    F184: 44, // Delivery/shipping info not visible on product page
    F185: 42, // Return policy hard to find from product page
    F186: 32, // Sustainability/ethical info missing when user looks for it
    F187: 44, // Comparison info missing between similar products
    F188: 36, // FAQ section missing or outdated
    F189: 30, // Product labels/badges confusing (too many)
    F190: 48, // Ingredient/material info missing for sensitive categories
    F191: 50, // Conflicting information between product page and cart
    // =========================================================================
    // CATEGORY 12: PERSONALIZATION (F192–F202) — Range 25–45
    // =========================================================================
    F192: 35, // Irrelevant product recommendations
    F193: 30, // Recommendations show already-purchased items
    F194: 38, // Not recognizing returning customer
    F195: 40, // Showing wrong gender/demographic products
    F196: 35, // Email personalization mismatch (wrong name/product)
    F197: 45, // Personalized pricing perceived as unfair
    F198: 32, // Quiz/preference tool result feels wrong
    F199: 42, // "Based on your browsing" shows embarrassing/private items
    F200: 36, // Geo-based content wrong (travel, VPN)
    F201: 38, // Language auto-detection wrong
    F202: 28, // Recently viewed section cluttered with irrelevant items
    // =========================================================================
    // CATEGORY 13: SOCIAL PROOF & URGENCY (F203–F211) — Range 25–45
    // =========================================================================
    F203: 35, // No reviews on product
    F204: 42, // Reviews feel fake or unverified
    F205: 30, // Social proof notifications annoying (too frequent)
    F206: 40, // Urgency timer feels manipulative
    F207: 38, // "X people viewing this" feels fake
    F208: 36, // Low stock warning but stock never decreases
    F209: 28, // No social media presence / proof
    F210: 32, // Influencer endorsement feels inauthentic
    F211: 25, // Testimonials too generic
    // =========================================================================
    // CATEGORY 14: COMMUNICATION & NOTIFICATION (F212–F224) — Range 30–50
    // =========================================================================
    F212: 35, // Abandoned cart email too early (within minutes)
    F213: 38, // Abandoned cart email too late (days later)
    F214: 42, // Too many marketing emails causing unsubscribe
    F215: 40, // Push notifications too frequent / irrelevant
    F216: 50, // SMS marketing without opt-in consent
    F217: 35, // Notification arrives at wrong time (timezone)
    F218: 48, // Customer service response too slow
    F219: 45, // Live chat unavailable when needed
    F220: 42, // Chatbot can't understand user query
    F221: 46, // Chatbot loops without resolution
    F222: 38, // Order confirmation email delayed
    F223: 40, // Shipping notification missing
    F224: 36, // Marketing email content doesn't match landing page
    // =========================================================================
    // CATEGORY 15: ACCOUNT & AUTHENTICATION (F225–F235) — Range 40–65
    // =========================================================================
    F225: 62, // Forgot password during checkout
    F226: 52, // Social login fails
    F227: 55, // Account creation form too long
    F228: 50, // Email verification blocks immediate shopping
    F229: 48, // Password requirements too strict
    F230: 55, // Two-factor auth friction at login
    F231: 65, // Account locked after failed attempts
    F232: 42, // Guest checkout not remembered on return
    F233: 58, // Saved payment method expired
    F234: 40, // Profile data outdated (old address, old name)
    F235: 44, // Login prompt during browsing interrupts flow
    // =========================================================================
    // CATEGORY 16: SHIPPING & DELIVERY (F236–F247) — Range 45–70
    // =========================================================================
    F236: 68, // Shipping cost too high
    F237: 62, // Shipping cost not shown until checkout
    F238: 58, // Delivery estimate too slow
    F239: 55, // No express/overnight shipping available
    F240: 52, // International shipping not available
    F241: 48, // No in-store pickup option
    F242: 50, // Delivery date range too wide
    F243: 55, // No order tracking available
    F244: 48, // Shipping to PO Box not supported
    F245: 60, // Shipping address validation failure
    F246: 46, // Split shipment not communicated
    F247: 65, // Delivery attempted but failed
    // =========================================================================
    // CATEGORY 17: RETURN & REFUND (F248–F257) — Range 40–60
    // =========================================================================
    F248: 55, // Return process too complicated
    F249: 58, // Return shipping cost falls on customer
    F250: 52, // Refund processing too slow
    F251: 50, // Return window too short
    F252: 48, // No exchange option (return only)
    F253: 56, // Return label generation broken
    F254: 45, // No return status tracking
    F255: 54, // Restocking fee not disclosed upfront
    F256: 48, // Return policy different for sale items
    F257: 42, // Refund to original payment method only
    // =========================================================================
    // CATEGORY 18: POST-PURCHASE (F258–F268) — Range 30–50
    // =========================================================================
    F258: 42, // Order confirmation page unclear
    F259: 32, // No post-purchase engagement
    F260: 48, // Product doesn't match expectations (returns)
    F261: 40, // Reorder process difficult
    F262: 44, // Subscription management hard to find
    F263: 35, // Review request sent too early (before delivery)
    F264: 38, // No loyalty reward after purchase
    F265: 32, // Cross-sell email not relevant to purchase
    F266: 50, // Package arrived damaged
    F267: 36, // Invoice/receipt not easily accessible
    F268: 45, // Order modification not possible after placement
    // =========================================================================
    // CATEGORY 19: RE-ENGAGEMENT (F269–F277) — Range 35–55
    // =========================================================================
    F269: 50, // Returning user's cart is empty (was full before)
    F270: 42, // Returning user can't find previously viewed product
    F271: 38, // Win-back email ignored
    F272: 45, // Previously purchased product now discontinued
    F273: 48, // Loyalty points about to expire
    F274: 44, // User downgraded (was VIP, now inactive)
    F275: 40, // Subscription cancelled user browsing again
    F276: 36, // Seasonal shopper not returning this season
    F277: 52, // Wishlist items on sale but user not notified
    // =========================================================================
    // CATEGORY 20: ACCESSIBILITY (F278–F286) — Range 35–55
    // =========================================================================
    F278: 50, // Screen reader can't parse product page
    F279: 52, // Keyboard navigation trapped in modal
    F280: 48, // Color contrast insufficient
    F281: 44, // No alt text on product images
    F282: 46, // Form labels missing / not associated
    F283: 42, // Touch targets too small (mobile)
    F284: 40, // Animation causes motion sickness
    F285: 50, // Timeout without warning (accessibility need)
    F286: 48, // Error messages not announced to screen reader
    // =========================================================================
    // CATEGORY 21: CROSS-CHANNEL & CROSS-DEVICE (F287–F294) — Range 35–55
    // =========================================================================
    F287: 52, // Cart not synced across devices
    F288: 42, // Wishlist not accessible on other device
    F289: 40, // Mobile app experience inconsistent with web
    F290: 45, // In-store inventory shown as online-only
    F291: 50, // BOPIS item not ready at promised time
    F292: 36, // Email link opens mobile web instead of app
    F293: 48, // Promo code from email doesn't work online
    F294: 52, // Different prices on app vs website
    // =========================================================================
    // CATEGORY 22: DECISION PARALYSIS (F295–F302) — Range 50–70
    // =========================================================================
    F295: 58, // Too many similar products (overwhelm)
    F296: 62, // User views 10+ products without adding any to cart
    F297: 65, // User toggles between 2-3 products repeatedly (explicitly defined)
    F298: 52, // User adds multiple similar items then removes all but one
    F299: 56, // Variant selection takes too long
    F300: 60, // Gift shopper doesn't know what to pick
    F301: 64, // User reads comparisons but doesn't choose
    F302: 55, // Bundle vs individual items confusion
    // =========================================================================
    // CATEGORY 23: PAYMENT-SPECIFIC (F303–F312) — Range 65–90
    // =========================================================================
    F303: 78, // Credit card type not accepted
    F304: 68, // Digital wallet not available
    F305: 82, // BNPL declined
    F306: 70, // Installment terms unclear
    F307: 72, // Currency conversion at bank rate warning
    F308: 76, // Saved card details wrong / outdated
    F309: 74, // PayPal popup blocked by browser
    F310: 70, // Gift card balance insufficient for order
    F311: 65, // Crypto payment option confusing
    F312: 68, // Invoice / NET terms request not available (B2B)
    // =========================================================================
    // CATEGORY 24: LEGAL & COMPLIANCE (F313–F318) — Range 35–55
    // =========================================================================
    F313: 48, // GDPR consent flow blocks shopping
    F314: 44, // Age verification gate too strict
    F315: 50, // Product restricted in user's region
    F316: 38, // Cookie preferences reset on every visit
    F317: 40, // Terms of service too long to accept
    F318: 46, // Data export/deletion request difficult
    // =========================================================================
    // CATEGORY 25: SEASONAL & CONTEXTUAL (F319–F325) — Range 40–60
    // =========================================================================
    F319: 58, // Holiday gift deadline approaching but delivery won't make it
    F320: 42, // Gift wrapping unavailable during gift season
    F321: 55, // Black Friday/sale site overloaded
    F322: 52, // Seasonal product sold out
    F323: 40, // Back-to-school items not grouped for easy shopping
    F324: 44, // Weather-triggered product need not served
    F325: 50, // Post-holiday return surge overwhelming support
};
/**
 * Get the severity score for a friction ID.
 * Returns the cataloged severity or a default of 50 if the ID is unknown.
 */
function getSeverity(frictionId) {
    return exports.SEVERITY_SCORES[frictionId] ?? 50;
}
//# sourceMappingURL=severity-scores.js.map