interface MessageTemplate {
  message: string;
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
  landing: {
    message: "Welcome! Let me help you find what you're looking for.",
    bubbleText: "Need help navigating? 👋",
  },
  navigation: {
    message: "It looks like you might be having trouble finding something. Can I help?",
    bubbleText: "Looking for something specific?",
  },
  search: {
    message: "I can help refine your search and find exactly what you need.",
    bubbleText: "Let me help with your search 🔍",
  },
  product: {
    message: "I have more details about this product that might help you decide.",
    bubbleText: "Want to know more about this?",
  },
  cart: {
    message: "I noticed your cart — can I help with anything before checkout?",
    bubbleText: "Ready to check out? 🛒",
  },
  checkout: {
    message: "I'm here to help you complete your purchase smoothly.",
    bubbleText: "Need help checking out?",
    ctaLabel: "Secure checkout",
    ctaAction: "checkout_help",
    uiAdjustments: [
      { adjustment_type: "highlight", target_selector: ".checkout-btn", params: { content: "secure-checkout" } },
    ],
  },
  pricing: {
    message: "Let me help you find the best value for what you're looking for.",
    bubbleText: "Looking for a better deal? 💰",
  },
  trust: {
    message: "Your security matters to us. Let me share some reassurances.",
    bubbleText: "Questions about security?",
    uiAdjustments: [
      { adjustment_type: "badge", params: { content: "trust-badge" } },
    ],
  },
  payment: {
    message: "I can help resolve any payment issues you're experiencing.",
    bubbleText: "Payment trouble? Let me help 💳",
  },
  decision: {
    message: "Having trouble deciding? I can help compare your options.",
    bubbleText: "Want a comparison? 📊",
  },
};

const DEFAULT_TEMPLATE: MessageTemplate = {
  message: "Hi! I'm AVA, your shopping assistant. How can I help?",
  bubbleText: "Can I help? 🤔",
};

/**
 * Get a message template based on intervention type and friction ID.
 */
export function getMessageTemplate(
  _type: string,
  frictionId: string
): MessageTemplate {
  // Map friction ID to category
  const category = getFrictionCategory(frictionId);
  return CATEGORY_TEMPLATES[category] ?? DEFAULT_TEMPLATE;
}

function getFrictionCategory(frictionId: string): string {
  const num = parseInt(frictionId.replace("F", ""), 10);
  if (isNaN(num)) return "unknown";

  if (num <= 12) return "landing";
  if (num <= 27) return "navigation";
  if (num <= 41) return "search";
  if (num <= 67) return "product";
  if (num <= 88) return "cart";
  if (num <= 116) return "checkout";
  if (num <= 130) return "pricing";
  if (num <= 146) return "trust";
  if (num <= 160) return "mobile";
  if (num <= 177) return "technical";
  if (num <= 191) return "content";
  if (num <= 202) return "personalization";
  if (num <= 211) return "social_proof";
  if (num <= 224) return "communication";
  if (num <= 235) return "account";
  if (num <= 247) return "shipping";
  if (num <= 257) return "returns";
  if (num <= 268) return "post_purchase";
  if (num <= 277) return "re_engagement";
  if (num <= 286) return "accessibility";
  if (num <= 294) return "cross_channel";
  if (num <= 302) return "decision";
  if (num <= 312) return "payment";
  if (num <= 318) return "compliance";
  return "seasonal";
}
