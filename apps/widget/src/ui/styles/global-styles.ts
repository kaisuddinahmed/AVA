/**
 * Inject CSS animations, keyframes, and base styles into Shadow DOM.
 * CSS custom properties (--ava-*) allow host-site theming overrides.
 */
export function injectGlobalStyles(
  target: ShadowRoot | HTMLElement = document.head,
): void {
  const existing =
    target instanceof ShadowRoot
      ? target.querySelector("#sa-global-styles")
      : document.getElementById("sa-global-styles");
  if (existing) return;

  const style = document.createElement("style");
  style.id = "sa-global-styles";
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');

    /* --- Entry & exit animations --- */
    @keyframes sa-slideUp {
      from { opacity: 0; transform: translateY(16px) scale(0.96); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes sa-slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes sa-fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes sa-scaleIn {
      from { opacity: 0; transform: scale(0.8); }
      to   { opacity: 1; transform: scale(1); }
    }
    @keyframes sa-pulse {
      0%, 100% { transform: scale(1); }
      50%       { transform: scale(1.05); }
    }

    /* Label strip expand on toggle button (signal mode) */
    @keyframes sa-labelExpand {
      from { max-width: 0; opacity: 0; }
      to   { max-width: 180px; opacity: 1; }
    }

    /* Bottom sheet slide-up for mobile */
    @keyframes sa-sheetUp {
      from { transform: translateY(100%); opacity: 0.6; }
      to   { transform: translateY(0);    opacity: 1;   }
    }

    /* Skeleton shimmer for lead card loading state */
    @keyframes sa-shimmer {
      0%   { background-position: -400px 0; }
      100% { background-position:  400px 0; }
    }

    /* Unread / signal pulse on toggle button */
    @keyframes sa-breathe {
      0%,  100% { box-shadow: 0 0 0 0   rgba(233, 69, 96, 0.4); }
      50%        { box-shadow: 0 0 0 10px rgba(233, 69, 96, 0);  }
    }

    /* Typing dots */
    @keyframes sa-typing {
      0%, 60%, 100% { opacity: 0.3; }
      30%            { opacity: 1;   }
    }

    /* Micro-feedback button ripple */
    @keyframes sa-ripple {
      from { transform: scale(0); opacity: 0.4; }
      to   { transform: scale(2.4); opacity: 0; }
    }

    /* Soft dismiss swipe */
    @keyframes sa-swipeOut {
      to { transform: translateX(110%); opacity: 0; }
    }

    /* Mic button recording pulse */
    @keyframes sa-mic-pulse {
      0%   { box-shadow: 0 0 0 0   rgba(220, 38, 38, 0.45); }
      70%  { box-shadow: 0 0 0 8px rgba(220, 38, 38, 0);    }
      100% { box-shadow: 0 0 0 0   rgba(220, 38, 38, 0);    }
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    /* Scrollbar styling inside panel */
    .ava-messages-area::-webkit-scrollbar {
      width: 4px;
    }
    .ava-messages-area::-webkit-scrollbar-track {
      background: transparent;
    }
    .ava-messages-area::-webkit-scrollbar-thumb {
      background: #e5e7eb;
      border-radius: 4px;
    }
  `;

  target.appendChild(style);
}
