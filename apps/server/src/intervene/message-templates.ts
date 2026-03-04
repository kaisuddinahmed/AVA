interface MessageTemplate {
  message: string;
  voiceScript?: string; // ≤12 words, direct store-associate style
  bubbleText?: string;
  ctaLabel?: string;
  ctaAction?: string;
  uiAdjustments?: Array<{
    adjustment_type: string;
    target_selector?: string;
    params: Record<string, unknown>;
  }>;
}

const CATEGORY_TEMPLATES: Record<string, MessageTemplate> = {
  // ── Core browsing ──────────────────────────────────────────────────────────
  landing: {
    message: "Welcome! Let me help you find what you're looking for.",
    voiceScript: "Hi! Looking for something specific today?",
    bubbleText: "Need help navigating? 👋",
  },
  navigation: {
    message: "It looks like you might be having trouble finding something. Can I help?",
    voiceScript: "Can't find it? I can guide you straight there.",
    bubbleText: "Looking for something specific?",
  },
  search: {
    message: "I can help refine your search and find exactly what you need.",
    voiceScript: "Let me help you find exactly what you need.",
    bubbleText: "Let me help with your search 🔍",
  },
  product: {
    message: "I have more details about this product that might help you decide.",
    voiceScript: "Questions about this item? I'm right here.",
    bubbleText: "Want to know more about this?",
  },

  // ── Purchase funnel ────────────────────────────────────────────────────────
  cart: {
    message: "I noticed your cart — can I help with anything before checkout?",
    voiceScript: "Ready to check out? I can help you finish.",
    bubbleText: "Ready to check out? 🛒",
  },
  checkout: {
    message: "I'm here to help you complete your purchase smoothly.",
    voiceScript: "Almost done — need help completing your order?",
    bubbleText: "Need help checking out?",
    ctaLabel: "Secure checkout",
    ctaAction: "checkout_help",
    uiAdjustments: [
      { adjustment_type: "highlight", target_selector: ".checkout-btn", params: { content: "secure-checkout" } },
    ],
  },
  pricing: {
    message: "Let me help you find the best value for what you're looking for.",
    voiceScript: "Worried about the price? Let me find you a deal.",
    bubbleText: "Looking for a better deal? 💰",
  },
  payment: {
    message: "I can help resolve any payment issues you're experiencing.",
    voiceScript: "Payment trouble? Let me walk you through options.",
    bubbleText: "Payment trouble? Let me help 💳",
  },

  // ── Decision support ───────────────────────────────────────────────────────
  decision: {
    message: "Having trouble deciding? I can help compare your options.",
    voiceScript: "Need help deciding? I can compare options for you.",
    bubbleText: "Want a comparison? 📊",
  },
  comparison: {
    message: "Want to see a side-by-side comparison of your top picks?",
    voiceScript: "Comparing options? Let me show you the differences.",
    bubbleText: "Compare options 📊",
  },
  size: {
    message: "Not sure about sizing? I can help you find the perfect fit.",
    voiceScript: "Not sure about sizing? I'll find your perfect fit.",
    bubbleText: "Find your size 📏",
  },

  // ── Trust & safety ─────────────────────────────────────────────────────────
  trust: {
    message: "Your security matters to us. Let me share some reassurances.",
    voiceScript: "Thousands trust us. Here's why you can too.",
    bubbleText: "Questions about security?",
    uiAdjustments: [
      { adjustment_type: "badge", params: { content: "trust-badge" } },
    ],
  },
  returns: {
    message: "We offer free, hassle-free returns — no questions asked.",
    voiceScript: "Free returns, no questions. Want me to show you?",
    bubbleText: "Easy returns 🔄",
  },
  shipping: {
    message: "You're close to free shipping! Let me show you how.",
    voiceScript: "Free shipping is close — want to see how?",
    bubbleText: "Unlock free shipping 🚚",
    uiAdjustments: [
      { adjustment_type: "inject_shipping_progress_bar", params: {} },
    ],
  },

  // ── Technical & accessibility ──────────────────────────────────────────────
  technical: {
    message: "I noticed something may not be working correctly. Let me help.",
    voiceScript: "Something's not working — let me fix that.",
    bubbleText: "Something wrong? 🔧",
  },
  mobile: {
    message: "Having trouble navigating on mobile? Let me walk you through it.",
    voiceScript: "Hard to navigate? Let me walk you through it.",
    bubbleText: "Need a hand? 📱",
  },
  stock: {
    message: "This item has limited availability. Want me to find alternatives?",
    voiceScript: "This item's limited — want me to find alternatives?",
    bubbleText: "Check availability 📦",
  },

  // ── Personalisation & discovery ────────────────────────────────────────────
  recommendation: {
    message: "Based on what you've been browsing, I have a suggestion for you.",
    voiceScript: "Based on your browsing, I have a suggestion.",
    bubbleText: "Recommended for you ✨",
  },
  cross_sell: {
    message: "This pairs perfectly with something else on our site.",
    voiceScript: "This pairs perfectly with something else here.",
    bubbleText: "Complete the look 🎁",
  },
  upsell: {
    message: "For just a little more, you can get something even better.",
    voiceScript: "For just a bit more, you can get something better.",
    bubbleText: "Upgrade your pick ⬆️",
  },
  social: {
    message: "Other shoppers love this product. Want to see what they say?",
    voiceScript: "Others love this. Want to see what they say?",
    bubbleText: "See what others say 💬",
  },

  // ── Urgency & incentives ───────────────────────────────────────────────────
  urgency: {
    message: "Only a few of these are left — want me to help you secure one?",
    voiceScript: "Only a few left — want me to hold one for you?",
    bubbleText: "Almost gone! ⏰",
  },
  discount: {
    message: "I found a discount that applies to your order right now.",
    voiceScript: "I found a discount code that applies right now.",
    bubbleText: "Discount available 🏷️",
  },

  // ── Loyalty & retention ───────────────────────────────────────────────────
  loyalty: {
    message: "You're close to earning a reward. Want me to show you how?",
    voiceScript: "You're close to a reward — want me to show you?",
    bubbleText: "Earn your reward 🏅",
  },
  wishlist: {
    message: "Saving this for later? Let me make sure you don't miss a deal.",
    voiceScript: "Saving for later? Let me remind you about this deal.",
    bubbleText: "Save for later 💛",
  },
  reengagement: {
    message: "Welcome back! Your cart is still waiting — ready to continue?",
    voiceScript: "Welcome back! Your cart is still waiting for you.",
    bubbleText: "Continue shopping 🔁",
  },
  exit: {
    message: "Before you go — I have something that might change your mind.",
    voiceScript: "Wait — before you go, I have something for you.",
    bubbleText: "Wait — one moment 🙋",
  },

  // ── Support & account ─────────────────────────────────────────────────────
  support: {
    message: "Having trouble? I can connect you with support right away.",
    voiceScript: "Having trouble? Let me connect you with support.",
    bubbleText: "Get support 💬",
  },
  account: {
    message: "Sign in to save your cart, track orders, and earn loyalty points.",
    voiceScript: "Sign in to save your cart and earn points.",
    bubbleText: "Sign in to save 👤",
  },

  // ── Catch-all ─────────────────────────────────────────────────────────────
  general: {
    message: "Hi! I'm AVA, your personal shopping assistant. How can I help?",
    voiceScript: "Hi, I'm AVA. How can I help you today?",
    bubbleText: "I'm here to help! 🤖",
  },
};

const DEFAULT_TEMPLATE: MessageTemplate = {
  message: "Hi! I'm AVA, your shopping assistant. How can I help?",
  voiceScript: "Need a hand? I'm your personal shopping guide.",
  bubbleText: "Can I help? 🤔",
};

/**
 * Get a message template based on intervention type and friction ID.
 */
export function getMessageTemplate(
  _type: string,
  frictionId: string
): MessageTemplate {
  const category = getFrictionCategory(frictionId);
  return CATEGORY_TEMPLATES[category] ?? DEFAULT_TEMPLATE;
}

/**
 * Map a friction ID (F001–F325) to a template category key.
 * Ranges derived from the AVA friction catalog (docs/friction_scenarios.md).
 */
function getFrictionCategory(frictionId: string): string {
  const num = parseInt(frictionId.replace("F", ""), 10);
  if (isNaN(num)) return "general";

  if (num <= 12)  return "landing";
  if (num <= 27)  return "navigation";
  if (num <= 41)  return "search";
  if (num <= 67)  return "product";      // content → product
  if (num <= 88)  return "cart";
  if (num <= 116) return "checkout";
  if (num <= 130) return "pricing";
  if (num <= 146) return "trust";
  if (num <= 160) return "mobile";       // accessibility → mobile
  if (num <= 177) return "technical";
  if (num <= 191) return "product";      // content → product
  if (num <= 202) return "recommendation"; // personalization → recommendation
  if (num <= 211) return "social";       // social_proof → social
  if (num <= 224) return "support";      // communication → support
  if (num <= 235) return "account";
  if (num <= 247) return "shipping";
  if (num <= 257) return "returns";
  if (num <= 268) return "reengagement"; // post_purchase → reengagement
  if (num <= 277) return "reengagement"; // re_engagement → reengagement
  if (num <= 286) return "mobile";       // accessibility → mobile
  if (num <= 294) return "general";      // cross_channel → general
  if (num <= 302) return "decision";
  if (num <= 312) return "payment";
  if (num <= 318) return "general";      // compliance → general
  return "discount";                     // seasonal → discount
}
