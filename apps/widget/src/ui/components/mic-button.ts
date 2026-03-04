/**
 * Mic Button — tap-to-record control for Phase 2 ASR.
 *
 * Three visual states:
 *  idle       → 🎙 icon, subtle styling — invite to speak
 *  recording  → 🔴 icon, red ring pulse animation — mic is live
 *  processing → ⏳ icon, muted styling — waiting for Deepgram transcript
 *
 * The returned object lets ava.ts update the visual state without
 * re-rendering the entire input bar.
 */

export type MicButtonState = "idle" | "recording" | "processing";

export interface MicButtonHandle {
  element: HTMLButtonElement;
  setState: (state: MicButtonState) => void;
}

export function renderMicButton(opts: {
  onClick: () => void;
}): MicButtonHandle {
  const btn = document.createElement("button");
  btn.setAttribute("aria-label", "Tap to speak");
  btn.setAttribute("title", "Tap to speak");
  btn.setAttribute("type", "button");

  // --- Shared base styles ---
  const baseStyle = `
    flex-shrink:0;
    width:38px;height:38px;
    border-radius:10px;
    border:none;
    cursor:pointer;
    display:flex;align-items:center;justify-content:center;
    font-size:17px;
    transition:background 0.15s ease,transform 0.1s ease;
  `.replace(/\s+/g, " ").trim();

  // Apply idle styling initially
  applyIdle(btn, baseStyle);

  btn.addEventListener("click", () => opts.onClick());
  btn.addEventListener("mouseenter", () => {
    if (btn.dataset.state !== "recording") {
      btn.style.transform = "scale(1.05)";
    }
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.transform = "scale(1)";
  });

  function setState(state: MicButtonState): void {
    btn.dataset.state = state;
    switch (state) {
      case "idle":
        applyIdle(btn, baseStyle);
        break;
      case "recording":
        applyRecording(btn, baseStyle);
        break;
      case "processing":
        applyProcessing(btn, baseStyle);
        break;
    }
  }

  return { element: btn, setState };
}

// ---- Style helpers ----

function applyIdle(btn: HTMLButtonElement, base: string): void {
  btn.textContent = "🎙";
  btn.setAttribute("aria-label", "Tap to speak");
  btn.setAttribute("title", "Tap to speak — ask AVA a question");
  btn.style.cssText = `${base}background:#f3f4f6;color:#6b7280;`;
  btn.style.animation = "";
}

function applyRecording(btn: HTMLButtonElement, base: string): void {
  btn.textContent = "🔴";
  btn.setAttribute("aria-label", "Recording — tap to stop");
  btn.setAttribute("title", "Recording… tap to stop");
  btn.style.cssText = `${base}background:#fef2f2;color:#dc2626;`;
  // Pulsing ring animation — injected inline via box-shadow keyframe trick
  btn.style.animation = "sa-mic-pulse 1s ease-in-out infinite";
  btn.style.boxShadow = "0 0 0 0 rgba(220,38,38,0.4)";
}

function applyProcessing(btn: HTMLButtonElement, base: string): void {
  btn.textContent = "⏳";
  btn.setAttribute("aria-label", "Processing speech…");
  btn.setAttribute("title", "Processing…");
  btn.style.cssText = `${base}background:#f9fafb;color:#9ca3af;cursor:default;`;
  btn.style.animation = "";
}
