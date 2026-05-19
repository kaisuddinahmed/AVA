// ============================================================================
// F-code sales playbooks.
//
// Phase 2.3 baseline + Thinking-Layer step 3 (2026-05-19) expansion.
//
// Each step carries:
//
//   - `voice_script` (string, ≤80 chars) — exact words spoken via TTS. The
//     80-char ceiling is the same one in CLAUDE.md's hard rules: keeps
//     TTS pacing natural, no audio mid-sentence cutoff.
//
//   - `sales_dialog` (string, ≤500 chars) — richer internal context shown
//     as the chat-bubble message. Per Codex Phase 2.3 wording: "sales_dialog
//     can contain multi-step dialogue, emitted as ≤80-char spoken chunks."
//     The bubble text and the spoken text are intentionally allowed to
//     differ in length; both reinforce the same recovery angle.
//
//   - `objective` (string) — what this step is trying to accomplish.
//     Surfaced into the payload for analytics + dashboard transparency.
//
//   - `intent` (MoveIntent) — added 2026-05-19. The salesperson move
//     category. Read by think/ and propagated onto SalespersonMove so the
//     dashboard, attribution, and step-4 content selection can branch on
//     it.
//
//   - `objection_type` (ObjectionType, optional) — populated when the step
//     is meant to address a specific category of objection. Step 4 uses
//     this to match the live objection in ConversationState /
//     VisitorMind.inferred_objections.
//
// Module-load invariant: every voice_script in every playbook is asserted to
// be ≤80 chars. If you add a step, the assertion will fail at boot if you
// blow the budget. No surprises.
// ============================================================================

import type {
  MoveIntent,
  ObjectionType,
} from "../think/think.types.js";

export interface PlaybookStep {
  /** Spoken via TTS — capped at 80 chars (CLAUDE.md hard rule). */
  voice_script: string;
  /** Richer bubble text — up to 500 chars. */
  sales_dialog: string;
  /** What this step intends to do (operator-facing prose). */
  objective: string;
  /** Salesperson move category. */
  intent: MoveIntent;
  /** Specific objection addressed, when intent === objection_handle. */
  objection_type?: ObjectionType;
}

export interface Playbook {
  /** F-code this playbook addresses, e.g. "F042". */
  frictionId: string;
  /** Short human label. */
  name: string;
  /** Ordered dialog steps. First step is the opener. */
  steps: PlaybookStep[];
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const PLAYBOOKS: Record<string, Playbook> = {
  // F002 — Bounce within 5 seconds. Catch them on the way out the door.
  F002: {
    frictionId: "F002",
    name: "Quick-bounce re-engage",
    steps: [
      {
        intent: "greet",
        voice_script: "Saw you pop in — looking for anything specific?",
        sales_dialog:
          "Welcome! Anything in particular caught your eye, or are you just browsing? Tell me a category and I'll get you straight to the good stuff.",
        objective: "Engage the bouncing visitor before they leave.",
      },
      {
        intent: "clarify",
        voice_script: "30 seconds to tell me what you want — I'll find it.",
        sales_dialog:
          "Give me 30 seconds — describe what you're after in plain words and I'll pull a short list. Faster than scrolling.",
        objective: "Lower the cost of staying with a fast-find offer.",
      },
    ],
  },

  // F010 — Cookie banner obscuring CTA. Clear the path.
  F010: {
    frictionId: "F010",
    name: "Consent-banner clearance",
    steps: [
      {
        intent: "clarify",
        voice_script: "Banner in your way? I can tuck it down so you can browse.",
        sales_dialog:
          "That consent banner's covering the page — I can minimize it so you can see everything. Want me to clear it out of the way?",
        objective: "Resolve the visual obstruction blocking the CTA.",
      },
    ],
  },

  // F020 — Pogo-sticking (user can't find what they need).
  F020: {
    frictionId: "F020",
    name: "Lost-in-navigation recovery",
    steps: [
      {
        intent: "clarify",
        voice_script: "Looks like you're hunting for something — want a hand?",
        sales_dialog:
          "I notice you've been bouncing between pages. Want me to help narrow this down? Tell me what you're looking for in your own words — colour, size, occasion — and I'll pull a short list.",
        objective: "Acknowledge friction; offer guided search.",
      },
      {
        intent: "clarify",
        voice_script: "Tell me the use case — I'll pull a short list.",
        sales_dialog:
          "What's it for — yourself, a gift, a specific occasion? Knowing the use case lets me filter down to two or three strong matches.",
        objective: "Anchor recommendation on the use case.",
      },
    ],
  },

  // F028 — Zero search results.
  F028: {
    frictionId: "F028",
    name: "Zero-results recovery",
    steps: [
      {
        intent: "clarify",
        voice_script: "Nothing matched — want a few close picks?",
        sales_dialog:
          "Search came up empty. Want me to suggest a few close picks, or try again with different words? Sometimes the catalog uses a different name for what you're after.",
        objective: "Offer alternatives instead of leaving with empty results.",
      },
      {
        intent: "clarify",
        voice_script: "Tell me in your own words — I'll search for you.",
        sales_dialog:
          "Describe it however you'd describe it to a friend — material, look, what it's for. I'll translate that into our catalog and find the closest options.",
        objective: "Translate vague intent into structured search.",
      },
    ],
  },

  // F030 — Vague/generic search term.
  F030: {
    frictionId: "F030",
    name: "Vague-search disambiguation",
    steps: [
      {
        intent: "clarify",
        voice_script: "Big topic — what feature matters most to you?",
        sales_dialog:
          "That search returns a lot. Tell me what matters most — price, brand, size, a particular use case — and I'll narrow it for you.",
        objective: "Force a disambiguating choice without sending them to filters.",
      },
      {
        intent: "clarify",
        voice_script: "Want me to narrow it by price, brand, or use?",
        sales_dialog:
          "Three quickest ways to narrow: price range, a brand you trust, or what you'll actually use it for. Pick one and I'll filter.",
        objective: "Offer concrete disambiguation axes.",
      },
    ],
  },

  // F036 — Searched for return/refund/cancel — proactive support angle.
  F036: {
    frictionId: "F036",
    name: "Returns-policy support",
    steps: [
      {
        intent: "clarify",
        voice_script: "Quick on returns — 30 days, free label. Want the link?",
        sales_dialog:
          "Looking for return info? We offer free returns within 30 days of delivery — the label's prepaid. Want me to pull up the policy or help with a specific order?",
        objective: "Defuse return anxiety; offer policy / order help.",
      },
      {
        intent: "clarify",
        voice_script: "Free exchanges too — easy if size or fit's off.",
        sales_dialog:
          "Exchanges are just as easy as returns — free both ways. If it's a size or fit question on something you're about to buy, I can recommend a size or hold an alternative in reserve.",
        objective: "Reframe the policy as a pre-purchase confidence boost.",
      },
    ],
  },

  // F042 — Viewed PDP but left quickly (<10s). Re-engagement.
  F042: {
    frictionId: "F042",
    name: "PDP early-exit recovery",
    steps: [
      {
        intent: "highlight",
        voice_script: "Saw you peek at that one — want me to find similar styles?",
        sales_dialog:
          "Didn't quite click? I can find similar options at the same price point, or filter for a different colour. What didn't work about this one?",
        objective: "Re-engage on alternatives; uncover the real objection.",
      },
      {
        intent: "objection_handle",
        objection_type: "price",
        voice_script: "Same vibe, different price — want me to pull a few?",
        sales_dialog:
          "I can show you 3-4 similar styles across price ranges if budget is the question. Just say the word.",
        objective: "Frame as budget-aware comparison.",
      },
      {
        intent: "objection_handle",
        objection_type: "choice",
        voice_script: "Comparing two? I'll pull them side-by-side.",
        sales_dialog:
          "If you're deciding between this and something else you've viewed, I can pull both up side-by-side and call out what's different so you don't have to flip back and forth.",
        objective: "Reduce decision fatigue with a direct comparison.",
      },
    ],
  },

  // F058 — Hover on ATC, no click. Micro-close.
  F058: {
    frictionId: "F058",
    name: "ATC hover micro-close",
    steps: [
      {
        intent: "close",
        voice_script: "On the fence? Lock it in — easy returns if it's off.",
        sales_dialog:
          "You can always change your mind — free returns within 30 days. Easier to lock it in now and decide at home than to risk losing the stock or the price.",
        objective: "De-risk the add-to-cart click.",
      },
      {
        intent: "highlight",
        voice_script: "Free shipping + free returns — low-risk to try.",
        sales_dialog:
          "Free shipping over $50, free returns on everything. Nothing to lose by trying it on at home — and we'll cover the return label if it doesn't work.",
        objective: "Stack reassurance levers (shipping + returns).",
      },
    ],
  },

  // F060 — Price-copy detected (comparison shopping).
  F060: {
    frictionId: "F060",
    name: "Comparison-shopping defense",
    steps: [
      {
        intent: "objection_handle",
        objection_type: "price",
        voice_script: "Comparing prices? Here's what we include they don't.",
        sales_dialog:
          "If you're comparing prices elsewhere, worth knowing what's bundled here — free shipping, free returns, full warranty, and same-business-day customer support. Often the headline price is the only thing that's cheaper elsewhere.",
        objective: "Reframe price comparison around bundled value.",
      },
      {
        intent: "close",
        voice_script: "I'll match the deal — apply our best offer now.",
        sales_dialog:
          "If you found it cheaper elsewhere, tell me where — we'll match it. Or I can apply our best current offer to your cart so you don't have to keep hunting.",
        objective: "Beat or match the competitor; close the sale here.",
      },
    ],
  },

  // F068 — Added to cart, didn't proceed to checkout.
  F068: {
    frictionId: "F068",
    name: "Cart-abandon recovery",
    steps: [
      {
        intent: "recover",
        voice_script: "Saved your cart. Walk through checkout?",
        sales_dialog:
          "Your cart is saved for the next 7 days. Want me to walk you through checkout now — under a minute with autofill — or save it for later and email you a link?",
        objective: "Recover cart with low-friction completion path.",
      },
      {
        intent: "urgency",
        voice_script: "Two in your size left — want to finish up?",
        sales_dialog:
          "Heads up — stock is low on the item in your cart. I can hold it for the next 10 minutes while you finish up. After that, no guarantees.",
        objective: "Time-bound urgency to close the cart.",
      },
      {
        intent: "close",
        voice_script: "10% off if you wrap this up in the next 5 minutes?",
        sales_dialog:
          "Sweetener — finish checkout in the next 5 minutes and I'll apply 10% off. Code auto-applies. No spam, no signup.",
        objective: "High-value cart variant: incentivize completion.",
      },
    ],
  },

  // F069 — Cart idle for extended period.
  F069: {
    frictionId: "F069",
    name: "Idle-cart nudge",
    steps: [
      {
        intent: "urgency",
        voice_script: "Still thinking? Stock's moving on this one.",
        sales_dialog:
          "Just a heads up — the item in your cart is moving today. Want me to lock it in, or save it for later and send a reminder when you get back?",
        objective: "Reawaken the idle session with a soft scarcity cue.",
      },
      {
        intent: "close",
        voice_script: "I'll hold it 10 minutes — want to lock it in?",
        sales_dialog:
          "I can reserve the item in your cart for 10 minutes — long enough to grab a card or check sizes. Say the word and the hold starts now.",
        objective: "Concrete commitment offer to close the loop.",
      },
    ],
  },

  // F089 — Forced account creation at checkout.
  F089: {
    frictionId: "F089",
    name: "Guest-checkout offer",
    steps: [
      {
        intent: "clarify",
        voice_script: "Skip the account — check out as a guest.",
        sales_dialog:
          "You can check out as a guest — no account required. Just email + shipping + payment. We'll only save what you tell us to.",
        objective: "Remove the signup wall blocking checkout.",
      },
      {
        intent: "highlight",
        voice_script: "Make an account after — earn points on this order.",
        sales_dialog:
          "If you'd rather, finish as guest now and we'll offer you the account on the confirmation page — that way this order still earns points retroactively. No extra steps now.",
        objective: "Defer signup without losing the loyalty hook.",
      },
    ],
  },

  // F091 — Form validation errors at checkout.
  F091: {
    frictionId: "F091",
    name: "Form-error assist",
    steps: [
      {
        intent: "clarify",
        voice_script: "Something's not validating — want me to walk it through?",
        sales_dialog:
          "Looks like the form's flagging something. I can talk you through the highlighted field, or if it's a known issue I can autofill from your last session's data.",
        objective: "Resolve checkout friction before they bounce.",
      },
      {
        intent: "clarify",
        voice_script: "Try double-checking the highlighted field.",
        sales_dialog:
          "The highlighted field is the one to look at — usually a postal-code format or a card-number typo. Hit me up if you'd rather have me autofill.",
        objective: "Direct attention to the specific failing field.",
      },
    ],
  },

  // F094 — Pause at payment field. Security reassurance + alternatives.
  F094: {
    frictionId: "F094",
    name: "Payment-pause reassure",
    steps: [
      {
        intent: "clarify",
        voice_script: "Secured by Stripe. Try Apple Pay or PayPal instead?",
        sales_dialog:
          "Payment is processed by Stripe — same as Shopify, Lyft, and millions of stores. If you'd rather skip the card entry, Apple Pay and PayPal are one-tap options at the top of the form.",
        objective: "Reduce payment-step abandonment with trust + alternatives.",
      },
      {
        intent: "objection_handle",
        objection_type: "trust",
        voice_script: "Your card never touches our servers — bank-level encryption.",
        sales_dialog:
          "Card details go straight to Stripe over an encrypted connection — we never see them. PCI-compliant, bank-level. If you'd rather, Apple Pay / Google Pay / PayPal are all available too.",
        objective: "Address payment-trust objection head on.",
      },
    ],
  },

  // F099 — Empty promo-code hunt. Save the sale.
  F099: {
    frictionId: "F099",
    name: "Promo-code save",
    steps: [
      {
        intent: "close",
        voice_script: "No code? I can apply the best running offer right now.",
        sales_dialog:
          "No code on hand? I'll apply the best active promo to your cart automatically — just say yes and I'll let you know what came off.",
        objective: "Prevent code-hunt abandonment.",
      },
      {
        intent: "clarify",
        voice_script: "Don't lose your spot hunting codes — I've got it.",
        sales_dialog:
          "Stay on this page — if there's a code worth applying, I'll apply it. People who leave to hunt codes usually don't come back, and we'd rather you finish here.",
        objective: "Keep the visitor in-session by absorbing the code search.",
      },
    ],
  },

  // F100 — Shipping option overload. Simplify.
  F100: {
    frictionId: "F100",
    name: "Shipping option simplifier",
    steps: [
      {
        intent: "clarify",
        voice_script: "Standard ships free in 3–5 days. Want me to pick it?",
        sales_dialog:
          "Most shoppers go with standard — free, 3-5 business days. Want me to set that and move you to payment? Express is +$8 for 2-day if you're in a rush.",
        objective: "Collapse the choice; offer concrete recommendation.",
      },
      {
        intent: "urgency",
        voice_script: "Express is +$8 for 2-day if you need it sooner.",
        sales_dialog:
          "If you need it fast, express ships in 2 business days for $8. Worth it for gifts or last-minute. Otherwise standard's free and fine.",
        objective: "Make the upgrade path concrete; don't oversell.",
      },
    ],
  },

  // F117 — Sticker shock on PDP. Defend the price.
  F117: {
    frictionId: "F117",
    name: "Sticker-shock defense",
    steps: [
      {
        intent: "objection_handle",
        objection_type: "price",
        voice_script: "On the higher side — here's what's included others don't.",
        sales_dialog:
          "Yes, it's not the cheapest — what's in the box: full warranty, free returns, lifetime support. Customers who bought stayed (avg rating 4.7). Tell me what would change your mind.",
        objective: "Justify price with concrete value differentiators.",
      },
      {
        intent: "objection_handle",
        objection_type: "price",
        voice_script: "Split it over 4 payments? Klarna at checkout.",
        sales_dialog:
          "If the upfront price is the friction, you can split it into four interest-free payments via Klarna at checkout. Same total, easier on the cash flow.",
        objective: "Offer financing to break the price barrier.",
      },
      {
        intent: "highlight",
        voice_script: "Built to last — 5-year warranty included.",
        sales_dialog:
          "This one's built for the long haul: 5-year warranty included, parts and labour. The math actually favours the higher-priced option when you spread it over years of use.",
        objective: "Reframe price as cost-per-year.",
      },
    ],
  },

  // F128 — Subscription vs one-time pricing confusion.
  F128: {
    frictionId: "F128",
    name: "Subscription price clarifier",
    steps: [
      {
        intent: "clarify",
        voice_script: "Subscribe saves about 15% — cancel anytime. Worth a look?",
        sales_dialog:
          "Subscribe & Save is roughly 15% off and you can cancel after one delivery — no commitment. One-time is the regular price. Want me to apply the subscribe rate?",
        objective: "Make the savings concrete; reassure on cancel flexibility.",
      },
      {
        intent: "highlight",
        voice_script: "One-time is fine too — same product, no commitment.",
        sales_dialog:
          "If you don't want to commit, one-time is exactly the same product at the regular price. Subscribe is just there if you'd want to save on recurring deliveries.",
        objective: "Defuse worry about being locked in.",
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Step 5 (2026-05-19) — Thinking Layer additions. Each pairs with a
  // new F-code (F326-F335) and a new widget observer.
  // ---------------------------------------------------------------------

  // F326 — Variant indecision. Simplify the choice with a social-proof pick.
  F326: {
    frictionId: "F326",
    name: "Variant-indecision simplifier",
    steps: [
      {
        intent: "objection_handle",
        objection_type: "choice",
        voice_script: "Most people in your size pick the navy. Want that?",
        sales_dialog:
          "Looks like you're toggling between options — that's normal. Most customers in your size go with navy and 4.7-star fit reviews. Want me to lock that in, or talk through what to look for?",
        objective: "Break the variant loop with a social-proof default.",
      },
      {
        intent: "clarify",
        voice_script: "Tell me the use case — I'll pick the variant for you.",
        sales_dialog:
          "Tell me what it's for — everyday, special occasion, gift — and I'll pick the right colour and size. Faster than scrolling, and easy to swap if it's wrong.",
        objective: "Offload the choice to AVA to break the loop.",
      },
    ],
  },

  // F327 — Deep review reading. They're researching a specific concern.
  F327: {
    frictionId: "F327",
    name: "Review-research support",
    steps: [
      {
        intent: "objection_handle",
        objection_type: "trust",
        voice_script: "Reading carefully — what concern can I address?",
        sales_dialog:
          "Looks like you're digging through reviews — totally fair. Tell me the specific worry (fit? quality? wash care?) and I'll point you at the answers or honest reviews.",
        objective: "Surface the underlying objection driving review research.",
      },
      {
        intent: "highlight",
        voice_script: "Average 4.6 stars over 1,200 reviews — mostly fit wins.",
        sales_dialog:
          "Headline numbers: 4.6 stars across 1,200+ reviews; top compliment is fit, top complaint is colour-vs-photo accuracy. Want me to call out the 2-star reviews so you've seen the worst case?",
        objective: "Show both sides to build credibility.",
      },
    ],
  },

  // F328 — Size chart dwell. Fit anxiety.
  F328: {
    frictionId: "F328",
    name: "Fit-anxiety reassurance",
    steps: [
      {
        intent: "objection_handle",
        objection_type: "fit",
        voice_script: "Free exchanges if size's off — want me to suggest one?",
        sales_dialog:
          "Sizing tricky here? Free exchanges either way — and I can recommend a size if you tell me your usual brand. Most people in this category go up one size from their typical street wear.",
        objective: "De-risk the size decision with exchanges + recommender.",
      },
      {
        intent: "highlight",
        voice_script: "Most customers fit true-to-size — comfy with stretch.",
        sales_dialog:
          "Aggregate review data says this runs true-to-size for ~80% of buyers. There's 4-way stretch built in, so a half-size flex isn't a problem either way.",
        objective: "Quantify fit confidence from real review data.",
      },
    ],
  },

  // F329 — Shipping step abandon. Recover with offer.
  F329: {
    frictionId: "F329",
    name: "Shipping-step recovery",
    steps: [
      {
        intent: "recover",
        voice_script: "Free over $50 — want me to add a filler item?",
        sales_dialog:
          "Few bucks short of free shipping? I can suggest a small filler from our top-rated picks to cross the threshold — usually nets out cheaper than the shipping fee.",
        objective: "Recover the shipping-step exit with a positive-sum nudge.",
      },
      {
        intent: "clarify",
        voice_script: "Standard runs $X — anything I can clear up?",
        sales_dialog:
          "Standard ships in 3-5 days for the amount shown. If timing or cost is the question, I can offer pickup options or expedited rates — just say the word.",
        objective: "Address the cost or speed objection directly.",
      },
    ],
  },

  // F330 — Payment step abandon. Recover with alternative.
  F330: {
    frictionId: "F330",
    name: "Payment-step recovery",
    steps: [
      {
        intent: "recover",
        voice_script: "Try Apple Pay or PayPal — one tap, no card details.",
        sales_dialog:
          "If the card form is the friction, Apple Pay and PayPal are one-tap right at the top. Both use your stored details — no typing, no card reach.",
        objective: "Bypass the card-entry hurdle with one-tap payment.",
      },
      {
        intent: "objection_handle",
        objection_type: "trust",
        voice_script: "Secure — Stripe-encrypted. Card never touches our DB.",
        sales_dialog:
          "Payment is encrypted end-to-end via Stripe — same processor as Shopify, Lyft, and Substack. We never see card data. PCI-compliant, bank-level. Tell me what would put you at ease.",
        objective: "Address the trust gap at the payment step.",
      },
    ],
  },

  // F331 — Suspected competing-tab comparison. Differentiate.
  F331: {
    frictionId: "F331",
    name: "Competitor-compare differentiator",
    steps: [
      {
        intent: "objection_handle",
        objection_type: "price",
        voice_script: "Comparing elsewhere? Here's what we include they don't.",
        sales_dialog:
          "If you're comparing prices, what's typically not in the other listing: free shipping, free returns, full warranty, and same-day support. Often the headline price is the only thing that's lower elsewhere.",
        objective: "Reframe comparison around bundled value.",
      },
      {
        intent: "close",
        voice_script: "Found it cheaper? Tell me — we'll match it.",
        sales_dialog:
          "Price match is real — paste the link in chat and we'll match it within reason (same model, in-stock, authorized seller). Faster than tab-switching for an hour.",
        objective: "Convert price-shopping into commitment with a match.",
      },
    ],
  },

  // F332 — Returning visitor, no purchase yet. Welcome + decision aid.
  F332: {
    frictionId: "F332",
    name: "Returning-visitor welcome",
    steps: [
      {
        intent: "greet",
        voice_script: "Welcome back. Ready on the last one you viewed?",
        sales_dialog:
          "Glad you're back. Last time you spent time on a specific item — want me to take you straight there, or are you looking at something new this trip?",
        objective: "Reduce return-visitor cognitive load by resuming context.",
      },
      {
        intent: "close",
        voice_script: "Saved 10% on your first order — want me to apply it?",
        sales_dialog:
          "First-time customers get 10% off — I can stack that with the current promo to bring this in well under your last visit's price. Want me to apply it to your cart?",
        objective: "Convert the returning-visitor session with a first-order offer.",
      },
    ],
  },

  // F333 — Out-of-stock variant viewed. Notify + alt.
  F333: {
    frictionId: "F333",
    name: "OOS-variant notify",
    steps: [
      {
        intent: "clarify",
        voice_script: "That size is out — notify you, or show similar?",
        sales_dialog:
          "The variant you tapped is out of stock. Two options: drop your email and I'll ping you the moment it's back (typical restock 2 weeks), or I can show the 3 closest variants we have in stock right now.",
        objective: "Don't lose the visitor to OOS — convert to wait-list or alt.",
      },
      {
        intent: "recover",
        voice_script: "Similar fit, in stock — want me to pull it up?",
        sales_dialog:
          "Closest in-stock option matches on size, fit, and most of the colour palette — different print though. Want me to pull it up side-by-side with what you wanted?",
        objective: "Convert OOS demand to an in-stock alternative.",
      },
    ],
  },

  // F334 — Multi-item view, no choice. Bundle suggestion.
  F334: {
    frictionId: "F334",
    name: "Multi-view bundle close",
    steps: [
      {
        intent: "close",
        voice_script: "Looked at a few — want a bundle suggestion?",
        sales_dialog:
          "Spotted you bouncing between four-plus items. Often a curated bundle solves it — same vibe, complementary pieces, 10% off when bought together. Want me to assemble one based on what you've viewed?",
        objective: "Convert decision-paralysis into a curated-bundle close.",
      },
      {
        intent: "clarify",
        voice_script: "Narrow it for me — price, occasion, or look?",
        sales_dialog:
          "Tell me the deciding factor — price, occasion you're shopping for, or the look — and I'll point you at the right one. Otherwise comparing four can take an hour.",
        objective: "Force a decision axis to collapse the comparison set.",
      },
    ],
  },

  // F335 — Landing greet. Proactive open.
  F335: {
    frictionId: "F335",
    name: "Landing greet",
    steps: [
      {
        intent: "greet",
        voice_script: "Hi, I'm Ava. Need a hand finding something?",
        sales_dialog:
          "Welcome — I'm Ava, the in-store help here. Tell me what you're after (or even a vibe) and I'll get you to it in a couple of clicks. Or just keep browsing — I'll pop in if I can help.",
        objective: "Establish presence early; offer help without being pushy.",
      },
      {
        intent: "clarify",
        voice_script: "Browsing or looking for something specific?",
        sales_dialog:
          "Easier if I know which — browsing means I leave you alone; looking for something specific means I'll get you there fast. Pick one and I'll match my style.",
        objective: "Probe intent so subsequent moves are appropriately scoped.",
      },
    ],
  },

  // F301 — Read comparisons but didn't choose. Decision-fatigue close.
  F301: {
    frictionId: "F301",
    name: "Comparison-stall close",
    steps: [
      {
        intent: "close",
        voice_script: "Stuck between two? I'll tell you which most people pick.",
        sales_dialog:
          "When customers compare these two, 7 out of 10 go with the second one — better reviews on fit and longer warranty. Want me to lock that one in?",
        objective: "Use social proof to break the comparison tie.",
      },
      {
        intent: "clarify",
        voice_script: "What matters most — price, features, or delivery time?",
        sales_dialog:
          "Tell me what matters most — price, features, or how fast it ships — and I'll point you to the right pick. The two are close on most axes; usually one detail decides it.",
        objective: "Force a tiebreaker axis to collapse the choice.",
      },
      {
        intent: "urgency",
        voice_script: "Both are great — want me to lock the closer one in?",
        sales_dialog:
          "Honestly both are good — at some point you'll get more from owning one than from comparing them. Want me to lock in the closer one and let you swap free if it's wrong?",
        objective: "Trade analysis-paralysis for low-risk action.",
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Module-load invariant — voice_script + sales_dialog length budgets.
// ---------------------------------------------------------------------------

const VOICE_SCRIPT_MAX = 80;
const SALES_DIALOG_MAX = 500;

(function assertBudget() {
  for (const pb of Object.values(PLAYBOOKS)) {
    for (let i = 0; i < pb.steps.length; i++) {
      const s = pb.steps[i];
      if (s.voice_script.length > VOICE_SCRIPT_MAX) {
        throw new Error(
          `[sales-playbooks] ${pb.frictionId} step ${i} voice_script is ` +
          `${s.voice_script.length} chars (max ${VOICE_SCRIPT_MAX}): "${s.voice_script}"`,
        );
      }
      if (s.sales_dialog.length > SALES_DIALOG_MAX) {
        throw new Error(
          `[sales-playbooks] ${pb.frictionId} step ${i} sales_dialog is ` +
          `${s.sales_dialog.length} chars (max ${SALES_DIALOG_MAX})`,
        );
      }
      // Thinking-Layer step 3 invariant — every step must declare its intent
      // so think/ can populate SalespersonMove.intent without guessing.
      if (!s.intent) {
        throw new Error(
          `[sales-playbooks] ${pb.frictionId} step ${i} missing required 'intent' field`,
        );
      }
    }
  }
})();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getPlaybook(frictionId: string): Playbook | null {
  return PLAYBOOKS[frictionId] ?? null;
}

/**
 * Given a list of active F-codes (e.g. from Evaluation.frictionsFound), return
 * the first playbook we have. Order in the input list matters — the caller
 * should pass frictions sorted by severity.
 */
export function pickPlaybookForFrictions(frictionIds: readonly string[]): Playbook | null {
  for (const f of frictionIds) {
    const pb = PLAYBOOKS[f];
    if (pb) return pb;
  }
  return null;
}

/**
 * Choose which step of a playbook to emit. Uses turn count modulo step count
 * so a long session cycles through alternative angles rather than repeating
 * the opener. Phase 2.3 baseline; richer condition-based selection (objection
 * matching) lands in Thinking-Layer step 4.
 */
export function selectStep(playbook: Playbook, turnCount: number): PlaybookStep {
  const idx = playbook.steps.length === 0 ? 0 : turnCount % playbook.steps.length;
  return playbook.steps[idx];
}

/** Exposed for tests + dashboard. */
export const ALL_PLAYBOOKS: readonly Playbook[] = Object.values(PLAYBOOKS);
export const VOICE_SCRIPT_MAX_CHARS = VOICE_SCRIPT_MAX;
