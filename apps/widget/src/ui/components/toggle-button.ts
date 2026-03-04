import type { WidgetConfig, WidgetState } from "../../config.js";

interface ToggleButtonOptions {
  config: WidgetConfig;
  onClick: () => void;
}

/**
 * Toggle Button — The floating action button.
 *
 * Three visual states:
 *  minimized : small icon, nearly invisible unless breathing
 *  signal    : icon + contextual label strip slides out (auto-collapses after 4s)
 *  expanded  : × close icon
 */
export function renderToggleButton(opts: ToggleButtonOptions): HTMLButtonElement {
  const { config, onClick } = opts;

  const btn = document.createElement("button");
  btn.id = "ava-toggle-btn";
  btn.setAttribute("aria-label", "Open shopping assistant");
  btn.setAttribute(
    "style",
    `display:flex;align-items:center;gap:0;border:none;cursor:pointer;
     background:linear-gradient(135deg,var(--ava-primary,${config.brandColor}),var(--ava-primary-light,${config.brandColorLight}));
     color:#fff;border-radius:var(--ava-radius,16px);height:52px;padding:0 14px;
     box-shadow:0 4px 20px rgba(0,0,0,0.15);
     transition:transform 0.2s ease,box-shadow 0.2s ease,padding 0.2s ease,opacity 0.3s ease;
     position:relative;overflow:hidden;font-family:var(--ava-font,${config.fontFamily});`,
  );

  // Icon span
  const iconSpan = document.createElement("span");
  iconSpan.id = "ava-btn-icon";
  iconSpan.setAttribute("style", "font-size:22px;line-height:1;flex-shrink:0;");
  iconSpan.textContent = "\uD83D\uDECD\uFE0F";
  btn.appendChild(iconSpan);

  // Label strip (hidden by default, slides in during signal mode)
  const labelSpan = document.createElement("span");
  labelSpan.id = "ava-btn-label";
  labelSpan.setAttribute(
    "style",
    `font-size:13px;font-weight:600;color:#fff;white-space:nowrap;
     max-width:0;overflow:hidden;opacity:0;margin-left:0;
     transition:max-width 0.3s ease,opacity 0.3s ease,margin-left 0.3s ease;`,
  );
  btn.appendChild(labelSpan);

  btn.addEventListener("click", onClick);

  btn.addEventListener("mouseenter", () => {
    btn.style.transform = "scale(1.05)";
    btn.style.boxShadow = "0 6px 28px rgba(0,0,0,0.2)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.transform = "scale(1)";
    btn.style.boxShadow = "0 4px 20px rgba(0,0,0,0.15)";
  });

  return btn;
}

/**
 * Update the toggle button appearance based on widget state.
 * @param labelText  Short contextual label shown in signal mode (e.g. "Quick tip →")
 */
export function updateToggleButton(
  btn: HTMLButtonElement,
  state: WidgetState,
  hasUnread: boolean,
  config: WidgetConfig,
  labelText?: string,
): void {
  const iconSpan = btn.querySelector("#ava-btn-icon") as HTMLSpanElement | null;
  const labelSpan = btn.querySelector("#ava-btn-label") as HTMLSpanElement | null;

  if (state === "expanded") {
    // × close icon, no label
    if (iconSpan) {
      iconSpan.textContent = "\u00D7";
      iconSpan.style.fontSize = "22px";
    }
    if (labelSpan) {
      labelSpan.style.maxWidth = "0";
      labelSpan.style.opacity = "0";
      labelSpan.style.marginLeft = "0";
    }
    btn.setAttribute("aria-label", "Close assistant");
    btn.style.animation = "none";
    btn.style.opacity = "1";

  } else if (state === "signal" && labelText) {
    // Signal mode: show label strip
    if (iconSpan) iconSpan.textContent = "\uD83D\uDECD\uFE0F";
    if (labelSpan) {
      labelSpan.textContent = labelText;
      labelSpan.style.maxWidth = "180px";
      labelSpan.style.opacity = "1";
      labelSpan.style.marginLeft = "8px";
    }
    btn.setAttribute("aria-label", labelText);
    btn.style.animation = "sa-breathe 2s ease-in-out infinite";
    btn.style.opacity = "1";

  } else {
    // minimized: nearly invisible when idle, visible when there's something to see
    if (iconSpan) iconSpan.textContent = "\uD83D\uDECD\uFE0F";
    if (labelSpan) {
      labelSpan.style.maxWidth = "0";
      labelSpan.style.opacity = "0";
      labelSpan.style.marginLeft = "0";
    }
    btn.setAttribute("aria-label", "Open assistant");
    btn.style.animation = hasUnread ? "sa-breathe 2s ease-in-out infinite" : "none";
    // Fade to near-invisible when idle (no unread)
    btn.style.opacity = hasUnread ? "1" : "0.18";
    btn.style.pointerEvents = hasUnread ? "auto" : "auto"; // still clickable even faded
  }

  // Unread dot
  let dot = btn.querySelector(".ava-unread-dot") as HTMLDivElement | null;
  if (hasUnread && state === "minimized") {
    if (!dot) {
      dot = document.createElement("div");
      dot.className = "ava-unread-dot";
      dot.setAttribute(
        "style",
        `position:absolute;top:-2px;right:-2px;width:12px;height:12px;border-radius:50%;
         background:${config.accentColor};border:2px solid #fff;
         animation:sa-scaleIn 0.3s ease-out;`,
      );
      btn.appendChild(dot);
    }
  } else if (dot) {
    dot.remove();
  }
}
