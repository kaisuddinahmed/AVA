// ── Tier selection ────────────────────────────────────────────────────────────
// tier3: repeat visitor who has dismissed before, or meaningful cart present
// tier2: any repeat signal (returning visitor, prior dismissal, prior interaction)
// tier1: first visit, no signals
function selectTier(ctx) {
    const highIntent = (ctx.isRepeatVisitor && ctx.totalDismissals >= 1) ||
        ctx.cartValue >= 30 ||
        ctx.totalConversions > 0;
    if (highIntent)
        return 3;
    const hasSignal = ctx.isRepeatVisitor ||
        ctx.totalDismissals >= 1 ||
        ctx.totalInterventionsFired >= 3;
    if (hasSignal)
        return 2;
    return 1;
}
// ── Category templates ────────────────────────────────────────────────────────
const CATEGORY_TEMPLATES = {
    // ── Core browsing ──────────────────────────────────────────────────────────
    landing: {
        tier1: {
            message: "Hi, I am AVA. I am here to assist you with your shopping today. Just let me know if you need any assistance.",
            voiceScript: "Hi, I am AVA. I am here to assist you with your shopping today. Just let me know if you need any assistance.",
            bubbleText: "Need help navigating? 👋",
        },
        tier2: {
            message: "Welcome back! I remember you from your last visit. Can I pick up where we left off?",
            voiceScript: "Welcome back! Want me to pick up where we left off?",
            bubbleText: "Welcome back! 👋",
        },
        tier3: {
            message: "Great to see you again! Your saved items are still here. Ready to complete your purchase?",
            voiceScript: "Great to see you again! Your saved items are still here.",
            bubbleText: "Continue your session 🛒",
        },
    },
    navigation: {
        tier1: {
            message: "It looks like you might be having trouble finding something. Can I help?",
            voiceScript: "Can't find it? I can guide you straight there.",
            bubbleText: "Looking for something specific?",
        },
        tier2: {
            message: "Still looking? Tell me what you need and I'll take you straight there.",
            voiceScript: "Tell me what you're after and I'll take you straight there.",
            bubbleText: "Let me guide you 🧭",
        },
        tier3: {
            message: "I can see you've been browsing for a while. Let me find exactly what you're looking for in seconds.",
            voiceScript: "I'll find exactly what you need in seconds. What is it?",
            bubbleText: "Find it now ⚡",
        },
    },
    search: {
        tier1: {
            message: "I can help refine your search and find exactly what you need.",
            voiceScript: "Let me help you find exactly what you need.",
            bubbleText: "Let me help with your search 🔍",
        },
        tier2: {
            message: "Not finding the right results? Describe what you want and I'll search for you.",
            voiceScript: "Describe what you want and I'll find it for you.",
            bubbleText: "Smarter search 🔍",
        },
        tier3: {
            message: "Based on what you've been browsing, I can narrow this down to the best match right now.",
            voiceScript: "I can narrow this to the perfect match right now.",
            bubbleText: "Best match found ✅",
        },
    },
    product: {
        tier1: {
            message: "I have more details about this product that might help you decide.",
            voiceScript: "Questions about this item? I'm right here.",
            bubbleText: "Want to know more about this?",
        },
        tier2: {
            message: "Comparing this with something else? I can show you a side-by-side breakdown.",
            voiceScript: "Want me to compare this with other options?",
            bubbleText: "Compare products 📊",
        },
        tier3: {
            message: "This is one of our top picks and stock is moving fast. Want me to hold one while you decide?",
            voiceScript: "This one's popular and stock is moving. Want to secure yours?",
            bubbleText: "Reserve yours now ⚡",
            ctaLabel: "Reserve",
            ctaAction: "reserve_item",
        },
    },
    // ── Purchase funnel ────────────────────────────────────────────────────────
    cart: {
        tier1: {
            message: "I noticed your cart — can I help with anything before checkout?",
            voiceScript: "Ready to check out? I can help you finish.",
            bubbleText: "Ready to check out? 🛒",
        },
        tier2: {
            message: "Your cart looks good! You're just a few steps from completing your order.",
            voiceScript: "Your cart looks great — let's get you checked out.",
            bubbleText: "Almost there 🛒",
        },
        tier3: {
            message: "You've been close to checkout a few times. I can walk you through it in under a minute.",
            voiceScript: "I can get you checked out in under a minute. Ready?",
            bubbleText: "Finish in 60 seconds ⏱️",
            ctaLabel: "Checkout now",
            ctaAction: "checkout_help",
        },
    },
    checkout: {
        tier1: {
            message: "I'm here to help you complete your purchase smoothly.",
            voiceScript: "Almost done — need help completing your order?",
            bubbleText: "Need help checking out?",
            ctaLabel: "Secure checkout",
            ctaAction: "checkout_help",
            uiAdjustments: [
                { adjustment_type: "highlight", target_selector: ".checkout-btn", params: { content: "secure-checkout" } },
            ],
        },
        tier2: {
            message: "Checkout is quick and secure. Want me to walk you through each step?",
            voiceScript: "Checkout is quick. Want me to walk you through it?",
            bubbleText: "Quick checkout guide 🔐",
            ctaLabel: "Step-by-step",
            ctaAction: "checkout_help",
        },
        tier3: {
            message: "Your order is ready to go. One click and it's confirmed — shall I help you finish?",
            voiceScript: "One click and your order is confirmed. Shall I help?",
            bubbleText: "Confirm order ✅",
            ctaLabel: "Complete order",
            ctaAction: "checkout_help",
        },
    },
    pricing: {
        tier1: {
            message: "Let me help you find the best value for what you're looking for.",
            voiceScript: "Worried about the price? Let me find you a deal.",
            bubbleText: "Looking for a better deal? 💰",
        },
        tier2: {
            message: "I can check for active promotions that apply to what you're viewing right now.",
            voiceScript: "Let me check for promotions that apply to this right now.",
            bubbleText: "Check for deals 🏷️",
        },
        tier3: {
            message: "I found a way to save on this order. Want me to apply it before you check out?",
            voiceScript: "I found a saving on your order. Want me to apply it?",
            bubbleText: "Savings ready 💰",
            ctaLabel: "Apply savings",
            ctaAction: "apply_discount",
        },
    },
    payment: {
        tier1: {
            message: "I can help resolve any payment issues you're experiencing.",
            voiceScript: "Payment trouble? Let me walk you through options.",
            bubbleText: "Payment trouble? Let me help 💳",
        },
        tier2: {
            message: "Having trouble with payment? We support several methods — let me show you the easiest one.",
            voiceScript: "We support several payment methods. Let me show you the easiest.",
            bubbleText: "Payment options 💳",
        },
        tier3: {
            message: "Don't let a payment hiccup stop your order. I can walk you through an alternative right now.",
            voiceScript: "I can walk you through an alternative payment right now.",
            bubbleText: "Fix payment now 🔧",
            ctaLabel: "Try another way",
            ctaAction: "payment_help",
        },
    },
    // ── Decision support ───────────────────────────────────────────────────────
    decision: {
        tier1: {
            message: "Having trouble deciding? I can help compare your options.",
            voiceScript: "Need help deciding? I can compare options for you.",
            bubbleText: "Want a comparison? 📊",
        },
        tier2: {
            message: "Still on the fence? Tell me your must-haves and I'll narrow it to one recommendation.",
            voiceScript: "Tell me your must-haves and I'll pick the best one.",
            bubbleText: "Get a recommendation 🎯",
        },
        tier3: {
            message: "Based on what you've been browsing, this is the one I'd go with — want to know why?",
            voiceScript: "Based on your browsing, I'd go with this one. Want to know why?",
            bubbleText: "My top pick for you ✨",
        },
    },
    comparison: {
        tier1: {
            message: "Want to see a side-by-side comparison of your top picks?",
            voiceScript: "Comparing options? Let me show you the differences.",
            bubbleText: "Compare options 📊",
        },
        tier2: {
            message: "I can build you a quick comparison table — just tell me which items to include.",
            voiceScript: "Tell me which items and I'll build a comparison table.",
            bubbleText: "Build comparison 📊",
        },
        tier3: {
            message: "I've already pulled together a comparison based on what you've been viewing. Want to see it?",
            voiceScript: "I've already pulled your comparison. Want to see it now?",
            bubbleText: "View comparison ✅",
        },
    },
    size: {
        tier1: {
            message: "Not sure about sizing? I can help you find the perfect fit.",
            voiceScript: "Not sure about sizing? I'll find your perfect fit.",
            bubbleText: "Find your size 📏",
        },
        tier2: {
            message: "Sizing can be tricky. Tell me your measurements and I'll give you the exact size.",
            voiceScript: "Tell me your measurements and I'll give you the exact size.",
            bubbleText: "Get your exact size 📏",
        },
        tier3: {
            message: "Wrong size is the top reason for returns. Let me confirm your size before you order.",
            voiceScript: "Let me confirm your size before you order to avoid returns.",
            bubbleText: "Confirm size before ordering ✅",
        },
    },
    // ── Trust & safety ─────────────────────────────────────────────────────────
    trust: {
        tier1: {
            message: "Your security matters to us. Let me share some reassurances.",
            voiceScript: "Thousands trust us. Here's why you can too.",
            bubbleText: "Questions about security?",
            uiAdjustments: [
                { adjustment_type: "badge", params: { content: "trust-badge" } },
            ],
        },
        tier2: {
            message: "We're verified and trusted by thousands of shoppers. Want to see our reviews and guarantees?",
            voiceScript: "We're trusted by thousands. Want to see our reviews and guarantees?",
            bubbleText: "See our trust signals 🛡️",
        },
        tier3: {
            message: "100% secure checkout, free returns, and a money-back guarantee — here's proof before you buy.",
            voiceScript: "Secure checkout, free returns, money-back guarantee. I'll show you.",
            bubbleText: "We guarantee it 🛡️",
            ctaLabel: "See guarantees",
            ctaAction: "show_trust",
        },
    },
    returns: {
        tier1: {
            message: "We offer free, hassle-free returns — no questions asked.",
            voiceScript: "Free returns, no questions. Want me to show you?",
            bubbleText: "Easy returns 🔄",
        },
        tier2: {
            message: "Worried about buying the wrong thing? Our return process takes under 2 minutes.",
            voiceScript: "Our return process takes under 2 minutes. No stress.",
            bubbleText: "Returns made easy 🔄",
        },
        tier3: {
            message: "Order with confidence — free returns within 30 days, no receipt needed. Shall I add a return label?",
            voiceScript: "Free returns for 30 days, no receipt needed. Order with confidence.",
            bubbleText: "30-day free returns ✅",
        },
    },
    shipping: {
        tier1: {
            message: "You're close to free shipping! Let me show you how.",
            voiceScript: "Free shipping is close — want to see how?",
            bubbleText: "Unlock free shipping 🚚",
            uiAdjustments: [
                { adjustment_type: "inject_shipping_progress_bar", params: {} },
            ],
        },
        tier2: {
            message: "Add just a little more to your cart and shipping is free. Want a suggestion?",
            voiceScript: "Add a little more and shipping is free. Want a suggestion?",
            bubbleText: "Almost free shipping 🚚",
        },
        tier3: {
            message: "I found the perfect add-on to unlock free shipping and it's something you'll actually want.",
            voiceScript: "I found the perfect add-on to unlock free shipping.",
            bubbleText: "Unlock free shipping ✅",
            ctaLabel: "See suggestion",
            ctaAction: "show_shipping_add_on",
        },
    },
    // ── Technical & accessibility ──────────────────────────────────────────────
    technical: {
        tier1: {
            message: "I noticed something may not be working correctly. Let me help.",
            voiceScript: "Something's not working — let me fix that.",
            bubbleText: "Something wrong? 🔧",
        },
        tier2: {
            message: "Still having trouble? Let me try a quick fix or connect you with support.",
            voiceScript: "Still having trouble? Let me try a quick fix.",
            bubbleText: "Quick fix available 🔧",
        },
        tier3: {
            message: "This seems like a technical issue on our end. Let me escalate this so you're not stuck.",
            voiceScript: "This looks like our issue. Let me escalate it right now.",
            bubbleText: "Escalating for you 🔧",
            ctaLabel: "Get help now",
            ctaAction: "escalate_support",
        },
    },
    mobile: {
        tier1: {
            message: "Having trouble navigating on mobile? Let me walk you through it.",
            voiceScript: "Hard to navigate? Let me walk you through it.",
            bubbleText: "Need a hand? 📱",
        },
        tier2: {
            message: "Mobile shopping can be tricky. I can guide you with simple tap-by-tap instructions.",
            voiceScript: "I can guide you step by step. Just follow my lead.",
            bubbleText: "Tap-by-tap guide 📱",
        },
        tier3: {
            message: "You've been here a while on mobile. Want me to simplify the page so you can check out faster?",
            voiceScript: "Want me to simplify things so you can check out faster?",
            bubbleText: "Simplify for mobile ⚡",
        },
    },
    stock: {
        tier1: {
            message: "This item has limited availability. Want me to find alternatives?",
            voiceScript: "This item's limited — want me to find alternatives?",
            bubbleText: "Check availability 📦",
        },
        tier2: {
            message: "Inventory on this is low. I can notify you if it restocks or suggest something similar.",
            voiceScript: "Inventory is low. Shall I notify you or find something similar?",
            bubbleText: "Low stock alert 📦",
        },
        tier3: {
            message: "Only a few left and this size goes fast. Shall I add it to your cart right now to secure it?",
            voiceScript: "Only a few left. Shall I add it to your cart to secure it?",
            bubbleText: "Secure yours now ⚡",
            ctaLabel: "Add to cart",
            ctaAction: "add_to_cart",
        },
    },
    // ── Personalisation & discovery ────────────────────────────────────────────
    recommendation: {
        tier1: {
            message: "Based on what you've been browsing, I have a suggestion for you.",
            voiceScript: "Based on your browsing, I have a suggestion.",
            bubbleText: "Recommended for you ✨",
        },
        tier2: {
            message: "You'd love this — it matches what you've been looking at and it's in stock.",
            voiceScript: "You'd love this — it matches your browsing and it's in stock.",
            bubbleText: "Perfect match ✨",
        },
        tier3: {
            message: "This is my top pick for you based on your history here. Customers with similar taste love it.",
            voiceScript: "This is my top pick based on your history. Want to see it?",
            bubbleText: "Your top pick 🎯",
        },
    },
    cross_sell: {
        tier1: {
            message: "This pairs perfectly with something else on our site.",
            voiceScript: "This pairs perfectly with something else here.",
            bubbleText: "Complete the look 🎁",
        },
        tier2: {
            message: "Most customers who buy this also grab one other item — want me to show you what it is?",
            voiceScript: "Most buyers grab one more thing with this. Want to see?",
            bubbleText: "Frequently bought together 🎁",
        },
        tier3: {
            message: "Adding this companion item also unlocks free shipping on your whole order.",
            voiceScript: "Adding this companion item unlocks free shipping on your order.",
            bubbleText: "Bundle & save 🎁",
            ctaLabel: "Add companion",
            ctaAction: "add_companion",
        },
    },
    upsell: {
        tier1: {
            message: "For just a little more, you can get something even better.",
            voiceScript: "For just a bit more, you can get something better.",
            bubbleText: "Upgrade your pick ⬆️",
        },
        tier2: {
            message: "The upgraded version has features you've been searching for. Want a quick comparison?",
            voiceScript: "The upgrade has what you've been searching for. Quick comparison?",
            bubbleText: "See the upgrade ⬆️",
        },
        tier3: {
            message: "This premium version is what most returning customers choose. I can show you exactly why.",
            voiceScript: "Most returning customers choose this premium version. Want to know why?",
            bubbleText: "Top choice ⭐",
        },
    },
    social: {
        tier1: {
            message: "Other shoppers love this product. Want to see what they say?",
            voiceScript: "Others love this. Want to see what they say?",
            bubbleText: "See what others say 💬",
        },
        tier2: {
            message: "This has over 4.5 stars from verified buyers. Want me to pull up the most helpful reviews?",
            voiceScript: "Over 4.5 stars from verified buyers. Want the best reviews?",
            bubbleText: "Top reviews 💬",
        },
        tier3: {
            message: "Customers who hesitated like you ended up rating this 5 stars. I can show you the reviews.",
            voiceScript: "Customers who hesitated ended up rating this 5 stars. Want to see?",
            bubbleText: "They don't regret it ⭐",
        },
    },
    // ── Urgency & incentives ───────────────────────────────────────────────────
    urgency: {
        tier1: {
            message: "Only a few of these are left — want me to help you secure one?",
            voiceScript: "Only a few left — want me to hold one for you?",
            bubbleText: "Almost gone! ⏰",
        },
        tier2: {
            message: "This item has been in your area's top-sellers and is selling out fast. Want to act now?",
            voiceScript: "This is selling out fast in your area. Want to act now?",
            bubbleText: "Selling fast ⏰",
        },
        tier3: {
            message: "Someone else just added this to their cart. Want me to secure yours before it's gone?",
            voiceScript: "Someone just added this to their cart. Secure yours now?",
            bubbleText: "Last chance ⏰",
            ctaLabel: "Secure mine",
            ctaAction: "add_to_cart",
        },
    },
    discount: {
        tier1: {
            message: "I found a discount that applies to your order right now.",
            voiceScript: "I found a discount code that applies right now.",
            bubbleText: "Discount available 🏷️",
        },
        tier2: {
            message: "There's a promo active right now that drops the price on what you're looking at.",
            voiceScript: "There's a promo active that drops the price on this item.",
            bubbleText: "Price drop active 🏷️",
        },
        tier3: {
            message: "I can apply a loyalty discount to your cart right now — no code needed.",
            voiceScript: "I can apply a loyalty discount to your cart right now.",
            bubbleText: "Apply discount now 💰",
            ctaLabel: "Apply discount",
            ctaAction: "apply_discount",
        },
    },
    // ── Loyalty & retention ───────────────────────────────────────────────────
    loyalty: {
        tier1: {
            message: "You're close to earning a reward. Want me to show you how?",
            voiceScript: "You're close to a reward — want me to show you?",
            bubbleText: "Earn your reward 🏅",
        },
        tier2: {
            message: "You're only a few points away from your next reward. Want to see what qualifies?",
            voiceScript: "A few more points and you unlock your next reward. Shall I show you?",
            bubbleText: "Points update 🏅",
        },
        tier3: {
            message: "Adding one more item to your cart unlocks your reward tier today. Want my suggestion?",
            voiceScript: "One more item unlocks your reward tier today. Want my suggestion?",
            bubbleText: "Unlock reward tier 🏅",
            ctaLabel: "Unlock reward",
            ctaAction: "show_reward_path",
        },
    },
    wishlist: {
        tier1: {
            message: "Saving this for later? Let me make sure you don't miss a deal.",
            voiceScript: "Saving for later? Let me remind you about this deal.",
            bubbleText: "Save for later 💛",
        },
        tier2: {
            message: "An item on your wishlist just dropped in price. Want to add it to your cart now?",
            voiceScript: "An item on your wishlist just dropped in price. Add it now?",
            bubbleText: "Wishlist price drop 💛",
        },
        tier3: {
            message: "This wishlist item is almost out of stock. It's time to grab it before it's gone.",
            voiceScript: "Your wishlist item is nearly out of stock. Time to grab it.",
            bubbleText: "Wishlist going fast ⚡",
            ctaLabel: "Add to cart",
            ctaAction: "add_to_cart",
        },
    },
    reengagement: {
        tier1: {
            message: "Welcome back! Your cart is still waiting — ready to continue?",
            voiceScript: "Welcome back! Your cart is still waiting for you.",
            bubbleText: "Continue shopping 🔁",
        },
        tier2: {
            message: "Good to see you again. The items you saved are still available — shall we pick up where you left off?",
            voiceScript: "The items you saved are still available. Shall we continue?",
            bubbleText: "Pick up where you left off 🔁",
        },
        tier3: {
            message: "You're back! I saved everything from your last session. Ready to finish what you started?",
            voiceScript: "Everything from your last session is saved. Ready to finish?",
            bubbleText: "Finish your order ✅",
            ctaLabel: "Finish order",
            ctaAction: "restore_cart",
        },
    },
    exit: {
        tier1: {
            message: "Before you go — I have something that might change your mind.",
            voiceScript: "Wait — before you go, I have something for you.",
            bubbleText: "Wait — one moment 🙋",
        },
        tier2: {
            message: "Still thinking? I can hold your cart and send you a reminder when you're ready.",
            voiceScript: "I can hold your cart and remind you later. Shall I?",
            bubbleText: "Save and come back 💛",
        },
        tier3: {
            message: "Don't leave empty-handed — here's an exclusive offer just for you, valid for the next 10 minutes.",
            voiceScript: "Here's an exclusive offer just for you, valid for 10 minutes.",
            bubbleText: "Exclusive offer ⏰",
            ctaLabel: "Claim offer",
            ctaAction: "apply_exit_offer",
        },
    },
    // ── Support & account ─────────────────────────────────────────────────────
    support: {
        tier1: {
            message: "Having trouble? I can connect you with support right away.",
            voiceScript: "Having trouble? Let me connect you with support.",
            bubbleText: "Get support 💬",
        },
        tier2: {
            message: "Still stuck? I can solve most issues instantly or escalate to a human agent.",
            voiceScript: "Still stuck? I can solve this instantly or get you a human agent.",
            bubbleText: "Instant support 💬",
        },
        tier3: {
            message: "I'm connecting you to a live agent right now — you've waited long enough.",
            voiceScript: "Connecting you to a live agent right now. You've waited long enough.",
            bubbleText: "Live agent now 🎧",
            ctaLabel: "Talk to agent",
            ctaAction: "escalate_live_agent",
        },
    },
    account: {
        tier1: {
            message: "Sign in to save your cart, track orders, and earn loyalty points.",
            voiceScript: "Sign in to save your cart and earn points.",
            bubbleText: "Sign in to save 👤",
        },
        tier2: {
            message: "Signing in takes 10 seconds and your cart carries over automatically.",
            voiceScript: "Signing in takes 10 seconds. Your cart carries over automatically.",
            bubbleText: "Quick sign in 👤",
        },
        tier3: {
            message: "Sign in now to apply your loyalty points and get a better price on this order.",
            voiceScript: "Sign in to apply your points and get a better price right now.",
            bubbleText: "Sign in to save more 👤",
            ctaLabel: "Sign in",
            ctaAction: "prompt_login",
        },
    },
    // ── Catch-all ─────────────────────────────────────────────────────────────
    general: {
        tier1: {
            message: "Hi! I'm AVA, your personal shopping assistant. How can I help?",
            voiceScript: "Hi, I'm AVA. How can I help you today?",
            bubbleText: "I'm here to help! 🤖",
        },
        tier2: {
            message: "Need a hand? I can search, compare, and guide you — just ask.",
            voiceScript: "Need a hand? I can search, compare, and guide you.",
            bubbleText: "Ask me anything 🤖",
        },
        tier3: {
            message: "I'm here and I know your preferences. What can I find for you today?",
            voiceScript: "I know your preferences. What can I find for you today?",
            bubbleText: "I know what you like 🎯",
        },
    },
};
const DEFAULT_TEMPLATE = {
    message: "Hi! I'm AVA, your shopping assistant. How can I help?",
    voiceScript: "Need a hand? I'm your personal shopping guide.",
    bubbleText: "Can I help? 🤔",
};
/**
 * Get a message template based on intervention type, friction ID, and session context.
 * Selects the appropriate tier based on visitor signals.
 */
export function getMessageTemplate(_type, frictionId, ctx) {
    const category = getFrictionCategory(frictionId);
    const tiered = CATEGORY_TEMPLATES[category];
    if (!tiered)
        return DEFAULT_TEMPLATE;
    const tier = ctx ? selectTier(ctx) : 1;
    return tiered[`tier${tier}`];
}
/**
 * Map a friction ID (F001–F325) to a template category key.
 * Ranges derived from the AVA friction catalog (docs/friction_scenarios.md).
 */
function getFrictionCategory(frictionId) {
    const num = parseInt(frictionId.replace("F", ""), 10);
    if (isNaN(num))
        return "general";
    if (num <= 12)
        return "landing";
    if (num <= 27)
        return "navigation";
    if (num <= 41)
        return "search";
    if (num <= 67)
        return "product"; // content → product
    if (num <= 88)
        return "cart";
    if (num <= 116)
        return "checkout";
    if (num <= 130)
        return "pricing";
    if (num <= 146)
        return "trust";
    if (num <= 160)
        return "mobile"; // accessibility → mobile
    if (num <= 177)
        return "technical";
    if (num <= 191)
        return "product"; // content → product
    if (num <= 202)
        return "recommendation"; // personalization → recommendation
    if (num <= 211)
        return "social"; // social_proof → social
    if (num <= 224)
        return "support"; // communication → support
    if (num <= 235)
        return "account";
    if (num <= 247)
        return "shipping";
    if (num <= 257)
        return "returns";
    if (num <= 268)
        return "reengagement"; // post_purchase → reengagement
    if (num <= 277)
        return "reengagement"; // re_engagement → reengagement
    if (num <= 286)
        return "mobile"; // accessibility → mobile
    if (num <= 294)
        return "general"; // cross_channel → general
    if (num <= 302)
        return "decision";
    if (num <= 312)
        return "payment";
    if (num <= 318)
        return "general"; // compliance → general
    return "discount"; // seasonal → discount
}
//# sourceMappingURL=message-templates.js.map