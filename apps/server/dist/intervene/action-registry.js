export const ACTION_REGISTRY = [
    // Passive actions
    { code: "passive_trust_badge", tier: "passive", description: "Add trust badge near CTA" },
    { code: "passive_shipping_bar", tier: "passive", description: "Show free shipping threshold bar" },
    { code: "passive_bnpl_callout", tier: "passive", description: "Show BNPL installment info" },
    { code: "passive_stock_urgency", tier: "passive", description: "Show low stock indicator" },
    { code: "passive_price_pin", tier: "passive", description: "Pin price to visible area" },
    { code: "passive_info_adjust", tier: "passive", description: "Adjust page info layout" },
    // Nudge actions
    { code: "nudge_suggestion", tier: "nudge", description: "Subtle suggestion bubble" },
    { code: "nudge_size_guide", tier: "nudge", description: "Suggest size guide" },
    { code: "nudge_search_help", tier: "nudge", description: "Offer search refinement" },
    { code: "nudge_cart_reminder", tier: "nudge", description: "Cart reminder nudge" },
    { code: "nudge_comparison_offer", tier: "nudge", description: "Offer product comparison" },
    { code: "nudge_review_highlight", tier: "nudge", description: "Highlight positive reviews" },
    // Active actions
    { code: "active_comparison", tier: "active", description: "Full product comparison panel" },
    { code: "active_alternative", tier: "active", description: "Show alternative products" },
    { code: "active_discount_offer", tier: "active", description: "Offer time-limited discount" },
    { code: "active_chat", tier: "active", description: "Open interactive chat" },
    { code: "active_bundle_suggest", tier: "active", description: "Suggest product bundle" },
    // Escalate actions
    { code: "escalate_full_assist", tier: "escalate", description: "Full shopping assistant mode" },
    { code: "escalate_payment_help", tier: "escalate", description: "Payment failure assistance" },
    { code: "escalate_checkout_save", tier: "escalate", description: "Save checkout and offer help" },
    { code: "escalate_human_handoff", tier: "escalate", description: "Connect to human support" },
];
export function getAction(code) {
    return ACTION_REGISTRY.find((a) => a.code === code);
}
export function getActionsByTier(tier) {
    return ACTION_REGISTRY.filter((a) => a.tier === tier);
}
//# sourceMappingURL=action-registry.js.map