import type { WidgetConfig } from "../../config.js";

interface PanelOptions {
  config: WidgetConfig;
  isMobile: boolean;
  onMinimize: () => void;
  /** True when the current intervention has voice enabled and voice is not yet muted */
  voiceEnabled?: boolean;
  /** Called when user taps the mute button in the panel header */
  onVoiceMute?: () => void;
}

/**
 * Panel — Decision-cockpit layout.
 *
 * Desktop: 380×560px absolute panel above toggle button (bottom-right corner).
 * Mobile:  Full-width bottom sheet that slides up from the bottom edge.
 *
 * Internal structure:
 *   header         — branding + minimize
 *   #ava-lead-area — lead card slot (primary intervention, full width)
 *   #ava-content   — supporting UI slot (product cards, comparison, extra messages)
 *   footer         — "Ask anything..." input (secondary, always visible but visually quiet)
 */
export function renderPanel(opts: PanelOptions): HTMLDivElement {
  const { config, isMobile, onMinimize, voiceEnabled, onVoiceMute } = opts;
  const isRight = config.position === "bottom-right";

  const panel = document.createElement("div");
  panel.id = "ava-panel";

  if (isMobile) {
    // Bottom sheet
    panel.setAttribute(
      "style",
      `position:fixed;bottom:0;left:0;right:0;
       max-height:88vh;
       background:rgba(255,255,255,0.98);
       backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
       border-radius:24px 24px 0 0;
       box-shadow:0 -4px 40px rgba(0,0,0,0.18);
       display:flex;flex-direction:column;overflow:hidden;
       animation:sa-sheetUp 0.38s cubic-bezier(0.22,1,0.36,1);
       z-index:${config.zIndex};`,
    );

    // Drag handle
    const handle = document.createElement("div");
    handle.setAttribute(
      "style",
      `width:40px;height:4px;background:#e5e7eb;border-radius:2px;
       margin:10px auto 0;flex-shrink:0;`,
    );
    panel.appendChild(handle);

  } else {
    // Corner panel (desktop)
    panel.setAttribute(
      "style",
      `position:absolute;bottom:68px;${isRight ? "right" : "left"}:0;
       width:380px;max-height:560px;
       background:rgba(255,255,255,0.98);
       backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
       border-radius:20px;
       box-shadow:0 12px 60px rgba(0,0,0,0.14),0 2px 8px rgba(0,0,0,0.05);
       display:flex;flex-direction:column;overflow:hidden;
       animation:sa-slideUp 0.32s cubic-bezier(0.22,1,0.36,1);`,
    );
  }

  // --- Header ---
  const header = document.createElement("div");
  header.setAttribute(
    "style",
    `background:linear-gradient(135deg,var(--ava-primary,${config.brandColor}) 0%,var(--ava-primary-light,${config.brandColorLight}) 100%);
     padding:14px 16px;display:flex;align-items:center;justify-content:space-between;
     flex-shrink:0;`,
  );

  const headerLeft = document.createElement("div");
  headerLeft.setAttribute("style", "display:flex;align-items:center;gap:10px;");

  const icon = document.createElement("div");
  icon.setAttribute(
    "style",
    `width:34px;height:34px;border-radius:10px;
     background:rgba(255,255,255,0.15);
     display:flex;align-items:center;justify-content:center;font-size:17px;`,
  );
  icon.textContent = "\uD83D\uDECD\uFE0F";

  const nameWrap = document.createElement("div");
  const nameEl = document.createElement("div");
  nameEl.setAttribute("style", "font-size:15px;font-weight:700;color:#fff;");
  nameEl.textContent = config.assistantName;

  const subEl = document.createElement("div");
  subEl.setAttribute(
    "style",
    `font-size:11px;color:rgba(255,255,255,0.65);display:flex;align-items:center;gap:4px;`,
  );
  // Live indicator dot
  const liveDot = document.createElement("span");
  liveDot.setAttribute(
    "style",
    "width:6px;height:6px;border-radius:50%;background:#4ade80;display:inline-block;",
  );
  subEl.appendChild(liveDot);
  subEl.appendChild(document.createTextNode("Shopping assistant"));

  nameWrap.appendChild(nameEl);
  nameWrap.appendChild(subEl);
  headerLeft.appendChild(icon);
  headerLeft.appendChild(nameWrap);

  // Right-side action cluster in header
  const headerRight = document.createElement("div");
  headerRight.setAttribute("style", "display:flex;align-items:center;gap:6px;");

  // 🔊 Voice mute button — only rendered when voice is active for this intervention
  if (voiceEnabled && onVoiceMute) {
    const muteBtnPanel = document.createElement("button");
    muteBtnPanel.setAttribute(
      "style",
      `background:rgba(255,255,255,0.15);border:none;color:#fff;
       width:30px;height:30px;border-radius:8px;cursor:pointer;
       font-size:14px;display:flex;align-items:center;justify-content:center;
       transition:background 0.15s ease;`,
    );
    muteBtnPanel.setAttribute("aria-label", "Mute voice");
    muteBtnPanel.setAttribute("title", "Mute voice for this session");
    muteBtnPanel.textContent = "\uD83D\uDD0A"; // 🔊
    muteBtnPanel.addEventListener("click", () => {
      muteBtnPanel.textContent = "\uD83D\uDD07"; // 🔇
      muteBtnPanel.style.opacity = "0.5";
      muteBtnPanel.style.cursor = "default";
      muteBtnPanel.removeEventListener("click", onVoiceMute);
      onVoiceMute();
    });
    muteBtnPanel.addEventListener("mouseenter", () => {
      muteBtnPanel.style.background = "rgba(255,255,255,0.28)";
    });
    muteBtnPanel.addEventListener("mouseleave", () => {
      muteBtnPanel.style.background = "rgba(255,255,255,0.15)";
    });
    headerRight.appendChild(muteBtnPanel);
  }

  const minimizeBtn = document.createElement("button");
  minimizeBtn.setAttribute(
    "style",
    `background:rgba(255,255,255,0.15);border:none;color:#fff;
     width:30px;height:30px;border-radius:8px;cursor:pointer;
     font-size:16px;display:flex;align-items:center;justify-content:center;
     transition:background 0.15s ease;`,
  );
  minimizeBtn.textContent = "\u2193";
  minimizeBtn.setAttribute("aria-label", "Minimize");
  minimizeBtn.addEventListener("click", onMinimize);
  minimizeBtn.addEventListener("mouseenter", () => {
    minimizeBtn.style.background = "rgba(255,255,255,0.28)";
  });
  minimizeBtn.addEventListener("mouseleave", () => {
    minimizeBtn.style.background = "rgba(255,255,255,0.15)";
  });
  headerRight.appendChild(minimizeBtn);

  header.appendChild(headerLeft);
  header.appendChild(headerRight);
  panel.appendChild(header);

  // --- Lead area (primary intervention slot — rendered by ava.ts) ---
  const leadArea = document.createElement("div");
  leadArea.id = "ava-lead-area";
  leadArea.setAttribute("style", "flex-shrink:0;");
  panel.appendChild(leadArea);

  // --- Scrollable supporting content area ---
  const content = document.createElement("div");
  content.id = "ava-panel-content";
  content.className = "ava-messages-area";
  content.setAttribute(
    "style",
    `flex:1;overflow-y:auto;padding:12px 14px;
     display:flex;flex-direction:column;gap:10px;
     background:#f8f9fa;`,
  );
  panel.appendChild(content);

  // --- Footer input ---
  const footer = document.createElement("div");
  footer.id = "ava-panel-footer";
  footer.setAttribute(
    "style",
    `border-top:1px solid rgba(0,0,0,0.06);background:#fff;padding:10px 14px;
     flex-shrink:0;`,
  );
  panel.appendChild(footer);

  return panel;
}

/**
 * Lead card skeleton — shown while the first intervention is loading.
 * Replaced by the real lead card once data arrives.
 */
export function renderLeadSkeleton(): HTMLDivElement {
  const skeleton = document.createElement("div");
  skeleton.id = "ava-lead-skeleton";
  skeleton.setAttribute(
    "style",
    "padding:16px 14px;border-bottom:1px solid rgba(0,0,0,0.05);",
  );

  const shimmerBase = `background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);
    background-size:400px 100%;animation:sa-shimmer 1.4s infinite;border-radius:8px;`;

  const line1 = document.createElement("div");
  line1.setAttribute("style", `${shimmerBase}height:14px;width:70%;margin-bottom:10px;`);
  const line2 = document.createElement("div");
  line2.setAttribute("style", `${shimmerBase}height:12px;width:90%;margin-bottom:8px;`);
  const line3 = document.createElement("div");
  line3.setAttribute("style", `${shimmerBase}height:12px;width:55%;margin-bottom:14px;`);
  const btn = document.createElement("div");
  btn.setAttribute("style", `${shimmerBase}height:36px;width:100%;border-radius:10px;`);

  skeleton.appendChild(line1);
  skeleton.appendChild(line2);
  skeleton.appendChild(line3);
  skeleton.appendChild(btn);

  return skeleton;
}

/**
 * Lead card — the primary intervention rendered at the top of the panel.
 * This is the most important thing AVA wants to surface this session.
 */
export function renderLeadCard(opts: {
  config: WidgetConfig;
  frictionId?: string;
  message: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  onFeedback?: (feedback: "helpful" | "not_helpful") => void;
}): HTMLDivElement {
  const { config, frictionId, message, ctaLabel, onCtaClick, onFeedback } = opts;

  const FRICTION_LABELS: Record<string, string> = {
    F015: "Browsing signal",
    F023: "Interaction issue",
    F058: "Decision friction",
    F060: "Price comparison",
    F068: "Exit intent",
    F069: "Idle session",
    F091: "Form friction",
    F094: "Payment hesitation",
    F400: "Rage click detected",
  };

  const card = document.createElement("div");
  card.id = "ava-lead-card";
  card.setAttribute(
    "style",
    `padding:14px 16px 12px;border-bottom:1px solid rgba(0,0,0,0.06);
     animation:sa-fadeIn 0.25s ease-out;`,
  );

  // Friction tag (if we know what triggered this)
  if (frictionId && FRICTION_LABELS[frictionId]) {
    const tag = document.createElement("div");
    tag.setAttribute(
      "style",
      `display:inline-flex;align-items:center;gap:5px;
       background:#f3f4f6;border-radius:6px;padding:3px 8px;
       font-size:10px;font-weight:600;color:#6b7280;letter-spacing:0.03em;
       text-transform:uppercase;margin-bottom:8px;`,
    );
    tag.textContent = FRICTION_LABELS[frictionId];
    card.appendChild(tag);
  }

  // Message
  const msgEl = document.createElement("div");
  msgEl.setAttribute(
    "style",
    `font-size:14px;line-height:1.6;color:#111827;font-weight:400;margin-bottom:${ctaLabel ? "12px" : "0"};`,
  );
  msgEl.textContent = message;
  card.appendChild(msgEl);

  // CTA
  if (ctaLabel && onCtaClick) {
    const ctaBtn = document.createElement("button");
    ctaBtn.setAttribute(
      "style",
      `display:block;width:100%;background:var(--ava-primary,${config.brandColor});color:#fff;
       border:none;border-radius:10px;padding:11px 16px;
       font-size:13px;font-weight:600;cursor:pointer;
       font-family:var(--ava-font,${config.fontFamily});
       transition:opacity 0.15s ease,transform 0.1s ease;`,
    );
    ctaBtn.textContent = ctaLabel;
    ctaBtn.addEventListener("click", onCtaClick);
    ctaBtn.addEventListener("mouseenter", () => { ctaBtn.style.opacity = "0.88"; });
    ctaBtn.addEventListener("mouseleave", () => { ctaBtn.style.opacity = "1"; });
    ctaBtn.addEventListener("mousedown", () => { ctaBtn.style.transform = "scale(0.99)"; });
    ctaBtn.addEventListener("mouseup", () => { ctaBtn.style.transform = "scale(1)"; });
    card.appendChild(ctaBtn);
  }

  // Feedback row (👍 / 👎)
  if (onFeedback) {
    const feedbackRow = document.createElement("div");
    feedbackRow.setAttribute("style", "margin-top:8px;display:flex;align-items:center;gap:2px;");

    const fbBtnStyle = `background:none;border:none;cursor:pointer;padding:4px 8px;
       font-size:14px;line-height:1;border-radius:6px;
       transition:background 0.15s ease,transform 0.1s ease;`;

    const thumbsUp = document.createElement("button");
    thumbsUp.setAttribute("style", fbBtnStyle);
    thumbsUp.setAttribute("aria-label", "Helpful");
    thumbsUp.textContent = "\uD83D\uDC4D"; // 👍

    const thumbsDown = document.createElement("button");
    thumbsDown.setAttribute("style", fbBtnStyle);
    thumbsDown.setAttribute("aria-label", "Not helpful");
    thumbsDown.textContent = "\uD83D\uDC4E"; // 👎

    function disableBtns(selected: "up" | "down") {
      thumbsUp.style.cursor = "default";
      thumbsDown.style.cursor = "default";
      thumbsUp.style.opacity = selected === "up" ? "1" : "0.3";
      thumbsDown.style.opacity = selected === "down" ? "1" : "0.3";
    }

    thumbsUp.addEventListener("click", () => { disableBtns("up"); onFeedback("helpful"); });
    thumbsDown.addEventListener("click", () => { disableBtns("down"); onFeedback("not_helpful"); });
    thumbsUp.addEventListener("mouseenter", () => { thumbsUp.style.background = "#f0fdf4"; });
    thumbsUp.addEventListener("mouseleave", () => { thumbsUp.style.background = "none"; });
    thumbsDown.addEventListener("mouseenter", () => { thumbsDown.style.background = "#fef2f2"; });
    thumbsDown.addEventListener("mouseleave", () => { thumbsDown.style.background = "none"; });

    feedbackRow.appendChild(thumbsUp);
    feedbackRow.appendChild(thumbsDown);
    card.appendChild(feedbackRow);
  }

  return card;
}

/**
 * Empty state shown in the supporting content area when there are no messages yet.
 */
export function renderEmptyState(config: WidgetConfig): HTMLDivElement {
  const empty = document.createElement("div");
  empty.setAttribute(
    "style",
    `text-align:center;padding:32px 20px;color:#9ca3af;
     font-size:13px;font-family:var(--ava-font,${config.fontFamily});`,
  );
  const wave = document.createElement("div");
  wave.setAttribute("style", "font-size:26px;margin-bottom:8px;");
  wave.textContent = "\uD83D\uDC4B";

  const text = document.createElement("div");
  text.setAttribute("style", "line-height:1.5;");
  text.textContent = "I'm here if you need anything";

  const sub = document.createElement("div");
  sub.setAttribute("style", "font-size:11px;color:#d1d5db;margin-top:4px;");
  sub.textContent = "Ask a question or wait for a tip";

  empty.appendChild(wave);
  empty.appendChild(text);
  empty.appendChild(sub);
  return empty;
}
