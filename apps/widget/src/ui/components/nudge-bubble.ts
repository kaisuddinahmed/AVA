import type { WidgetConfig } from "../../config.js";

/**
 * Friction-id to human-readable insight framing.
 * The card surfaces *why* AVA is intervening, not just what it wants to say.
 */
const FRICTION_CONTEXT: Record<string, { icon: string; hook: string }> = {
  F015: { icon: "👀", hook: "Browsing a while without clicking?" },
  F023: { icon: "🖱️", hook: "Something not responding?" },
  F058: { icon: "🤔", hook: "Weighing up whether to add this?" },
  F060: { icon: "💰", hook: "Checking the price elsewhere?" },
  F068: { icon: "⏳", hook: "About to leave?" },
  F069: { icon: "💤", hook: "Still deciding?" },
  F091: { icon: "⚠️", hook: "Having trouble with the form?" },
  F094: { icon: "💳", hook: "Hesitating at payment?" },
  F400: { icon: "😤", hook: "Something frustrating?" },
};

const DEFAULT_HOOK = { icon: "💡", hook: "Quick tip for you" };

interface NudgeBubbleOptions {
  config: WidgetConfig;
  message: string;
  frictionId?: string;
  ctaLabel?: string;
  onCtaClick: () => void;
  /** Soft dismiss: "not now" — swipe gesture or clicking outside */
  onSoftDismiss: () => void;
  /** Hard dismiss: explicit × — "stop showing these" */
  onHardDismiss: () => void;
  /** Micro-signal: user found this not helpful */
  onNotHelpful: () => void;
}

/**
 * Smart Contextual Card — replaces the plain text nudge bubble.
 *
 * Visual structure:
 *  ┌─────────────────────────────┐
 *  │ [icon] hook text        [×] │  ← insight framing row
 *  │─────────────────────────────│
 *  │  message body               │
 *  │                             │
 *  │  [CTA button]               │
 *  │─────────────────────────────│
 *  │  Not helpful · Dismiss      │  ← micro-signal footer
 *  └─────────────────────────────┘
 *
 * Swipe-right triggers soft dismiss (onSoftDismiss).
 * × button triggers hard dismiss (onHardDismiss).
 */
export function renderNudgeBubble(opts: NudgeBubbleOptions): HTMLDivElement {
  const {
    config,
    message,
    frictionId,
    ctaLabel,
    onCtaClick,
    onSoftDismiss,
    onHardDismiss,
    onNotHelpful,
  } = opts;

  const ctx = frictionId
    ? (FRICTION_CONTEXT[frictionId] ?? DEFAULT_HOOK)
    : DEFAULT_HOOK;

  // --- Root card ---
  const card = document.createElement("div");
  card.setAttribute(
    "style",
    `position:absolute;bottom:68px;right:0;width:300px;
     background:rgba(255,255,255,0.97);
     backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
     border-radius:18px;
     box-shadow:0 8px 40px rgba(0,0,0,0.12),0 1px 4px rgba(0,0,0,0.06);
     overflow:hidden;
     animation:sa-slideUp 0.32s cubic-bezier(0.22,1,0.36,1);
     font-family:${config.fontFamily};
     border:1px solid rgba(0,0,0,0.06);
     touch-action:pan-y;`,
  );

  // --- Swipe-to-dismiss (soft dismiss) ---
  let startX = 0;
  let currentX = 0;
  let dragging = false;

  card.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    dragging = true;
  }, { passive: true });

  card.addEventListener("touchmove", (e) => {
    if (!dragging) return;
    currentX = e.touches[0].clientX - startX;
    if (currentX > 0) {
      card.style.transform = `translateX(${currentX}px)`;
      card.style.opacity = String(Math.max(0, 1 - currentX / 200));
    }
  }, { passive: true });

  card.addEventListener("touchend", () => {
    dragging = false;
    if (currentX > 80) {
      card.style.animation = "sa-swipeOut 0.25s ease-out forwards";
      setTimeout(onSoftDismiss, 240);
    } else {
      card.style.transform = "";
      card.style.opacity = "";
    }
    currentX = 0;
  });

  // --- Insight framing row ---
  const hookRow = document.createElement("div");
  hookRow.setAttribute(
    "style",
    `display:flex;align-items:center;justify-content:space-between;
     padding:12px 14px 10px;
     border-bottom:1px solid rgba(0,0,0,0.05);`,
  );

  const hookLeft = document.createElement("div");
  hookLeft.setAttribute("style", "display:flex;align-items:center;gap:7px;");

  const hookIcon = document.createElement("span");
  hookIcon.setAttribute(
    "style",
    `font-size:16px;width:28px;height:28px;border-radius:8px;
     background:rgba(0,0,0,0.04);display:flex;align-items:center;justify-content:center;`,
  );
  hookIcon.textContent = ctx.icon;

  const hookText = document.createElement("span");
  hookText.setAttribute(
    "style",
    `font-size:12px;font-weight:600;color:#6b7280;letter-spacing:0.01em;`,
  );
  hookText.textContent = ctx.hook;

  hookLeft.appendChild(hookIcon);
  hookLeft.appendChild(hookText);

  // Hard dismiss ×
  const closeBtn = document.createElement("button");
  closeBtn.setAttribute(
    "style",
    `background:none;border:none;cursor:pointer;padding:4px;
     color:#9ca3af;font-size:15px;line-height:1;border-radius:6px;
     transition:background 0.15s ease,color 0.15s ease;`,
  );
  closeBtn.setAttribute("aria-label", "Stop showing tips");
  closeBtn.setAttribute("title", "Don't show tips like this");
  closeBtn.textContent = "\u00d7";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onHardDismiss();
  });
  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.background = "#f3f4f6";
    closeBtn.style.color = "#374151";
  });
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.background = "none";
    closeBtn.style.color = "#9ca3af";
  });

  hookRow.appendChild(hookLeft);
  hookRow.appendChild(closeBtn);
  card.appendChild(hookRow);

  // --- Message body ---
  const body = document.createElement("div");
  body.setAttribute("style", "padding:12px 14px 10px;");

  const messageEl = document.createElement("div");
  messageEl.setAttribute(
    "style",
    `font-size:14px;line-height:1.55;color:#111827;font-weight:400;`,
  );
  messageEl.textContent = message;
  body.appendChild(messageEl);

  // CTA button
  if (ctaLabel) {
    const ctaBtn = document.createElement("button");
    ctaBtn.setAttribute(
      "style",
      `display:block;width:100%;margin-top:10px;
       background:${config.brandColor};color:#fff;
       border:none;border-radius:10px;padding:10px 16px;
       font-size:13px;font-weight:600;cursor:pointer;
       font-family:${config.fontFamily};
       transition:opacity 0.15s ease,transform 0.1s ease;`,
    );
    ctaBtn.textContent = ctaLabel;
    ctaBtn.addEventListener("click", onCtaClick);
    ctaBtn.addEventListener("mouseenter", () => {
      ctaBtn.style.opacity = "0.88";
    });
    ctaBtn.addEventListener("mouseleave", () => {
      ctaBtn.style.opacity = "1";
    });
    ctaBtn.addEventListener("mousedown", () => {
      ctaBtn.style.transform = "scale(0.98)";
    });
    ctaBtn.addEventListener("mouseup", () => {
      ctaBtn.style.transform = "scale(1)";
    });
    body.appendChild(ctaBtn);
  }

  card.appendChild(body);

  // --- Micro-signal footer ---
  const footer = document.createElement("div");
  footer.setAttribute(
    "style",
    `display:flex;align-items:center;justify-content:space-between;
     padding:7px 14px 9px;
     border-top:1px solid rgba(0,0,0,0.05);`,
  );

  const notHelpfulBtn = document.createElement("button");
  notHelpfulBtn.setAttribute(
    "style",
    `background:none;border:none;cursor:pointer;padding:3px 6px;
     font-size:11px;color:#9ca3af;font-family:${config.fontFamily};
     border-radius:6px;transition:background 0.15s ease,color 0.15s ease;`,
  );
  notHelpfulBtn.textContent = "Not helpful";
  notHelpfulBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Visual feedback before callback
    notHelpfulBtn.textContent = "Got it ✓";
    notHelpfulBtn.style.color = "#22c55e";
    setTimeout(onNotHelpful, 600);
  });
  notHelpfulBtn.addEventListener("mouseenter", () => {
    notHelpfulBtn.style.background = "#f3f4f6";
    notHelpfulBtn.style.color = "#374151";
  });
  notHelpfulBtn.addEventListener("mouseleave", () => {
    notHelpfulBtn.style.background = "none";
    notHelpfulBtn.style.color = "#9ca3af";
  });

  const softDismissBtn = document.createElement("button");
  softDismissBtn.setAttribute(
    "style",
    `background:none;border:none;cursor:pointer;padding:3px 6px;
     font-size:11px;color:#9ca3af;font-family:${config.fontFamily};
     border-radius:6px;transition:background 0.15s ease,color 0.15s ease;`,
  );
  softDismissBtn.textContent = "Not now";
  softDismissBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onSoftDismiss();
  });
  softDismissBtn.addEventListener("mouseenter", () => {
    softDismissBtn.style.background = "#f3f4f6";
    softDismissBtn.style.color = "#374151";
  });
  softDismissBtn.addEventListener("mouseleave", () => {
    softDismissBtn.style.background = "none";
    softDismissBtn.style.color = "#9ca3af";
  });

  footer.appendChild(notHelpfulBtn);
  footer.appendChild(softDismissBtn);
  card.appendChild(footer);

  return card;
}
