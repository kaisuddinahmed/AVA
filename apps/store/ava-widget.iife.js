"use strict";
var AVA = (() => {
  // src/ui/styles/global-styles.ts
  function injectGlobalStyles(target = document.head) {
    const existing = target instanceof ShadowRoot ? target.querySelector("#sa-global-styles") : document.getElementById("sa-global-styles");
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

  // src/tracker/passive-executor.ts
  var PassiveExecutor = class {
    static execute(adjustment) {
      switch (adjustment.adjustment_type) {
        case "inject_shipping_progress_bar":
          this.injectShippingBar(adjustment);
          break;
        case "enhance_trust_signals":
          this.enhanceTrustSignals(adjustment);
          break;
        case "sticky_price_bar":
          this.stickyPriceBar(adjustment);
          break;
        case "inject_bnpl_callout":
          this.injectBNPL(adjustment);
          break;
        case "highlight_element":
          this.highlightElement(adjustment);
          break;
        case "reorder_content":
          this.reorderContent(adjustment);
          break;
        default:
          console.log("[AVA:Passive] Unhandled adjustment:", adjustment.adjustment_type);
      }
    }
    static injectShippingBar(adj) {
      const target = document.querySelector(adj.target_selector || ".cart-summary");
      if (!target || document.getElementById("sa-shipping-bar")) return;
      const { current_total, free_shipping_threshold } = adj.params;
      const remaining = Math.max(0, free_shipping_threshold - current_total);
      const pct = Math.min(current_total / free_shipping_threshold * 100, 100);
      const bar = document.createElement("div");
      bar.id = "sa-shipping-bar";
      bar.innerHTML = `
      <div style="
        background: linear-gradient(135deg, #f0fdf4, #dcfce7);
        border: 1px solid #bbf7d0;
        border-radius: 10px;
        padding: 12px 16px;
        margin: 12px 0;
        font-family: 'DM Sans', system-ui, sans-serif;
        font-size: 13px;
        color: #166534;
        animation: sa-slideDown 0.3s ease-out;
      ">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span>${remaining > 0 ? `Add $${remaining.toFixed(0)} more for <b>FREE shipping</b>` : "\u{1F389} You've got <b>FREE shipping!</b>"}</span>
          <span style="font-weight:600;">${pct.toFixed(0)}%</span>
        </div>
        <div style="background:#d1fae5; border-radius:999px; height:6px; overflow:hidden;">
          <div style="background:#22c55e; height:100%; width:${pct}%; border-radius:999px; transition:width 0.5s ease;"></div>
        </div>
      </div>
    `;
      target.insertBefore(bar, target.firstChild);
    }
    static enhanceTrustSignals(adj) {
      const target = document.querySelector(adj.target_selector || ".checkout-payment");
      if (!target || document.getElementById("sa-trust-badges")) return;
      const badges = adj.params.badges || ["ssl", "money_back", "secure_checkout"];
      const badgeIcons = {
        ssl: "\u{1F512} SSL Encrypted",
        money_back: "\u{1F4B0} Money-Back Guarantee",
        secure_checkout: "\u{1F6E1}\uFE0F Secure Checkout",
        free_returns: "\u21A9\uFE0F Free Returns"
      };
      const container = document.createElement("div");
      container.id = "sa-trust-badges";
      container.innerHTML = `
      <div style="
        display:flex; gap:12px; flex-wrap:wrap;
        padding:12px 0; margin:8px 0;
        border-top:1px solid #e5e7eb;
        font-family:'DM Sans', system-ui, sans-serif;
        font-size:12px; color:#6b7280;
        animation: sa-fadeIn 0.4s ease-out;
      ">
        ${badges.map((b) => `<span style="display:flex;align-items:center;gap:4px;">${badgeIcons[b] || b}</span>`).join("")}
      </div>
    `;
      target.appendChild(container);
    }
    static stickyPriceBar(adj) {
      const priceEl = document.querySelector(adj.target_selector || ".product-price");
      if (!priceEl || document.getElementById("sa-sticky-price")) return;
      const price = priceEl.textContent;
      const observer = new IntersectionObserver(
        ([entry]) => {
          let stickyBar = document.getElementById("sa-sticky-price");
          if (!entry.isIntersecting) {
            if (!stickyBar) {
              stickyBar = document.createElement("div");
              stickyBar.id = "sa-sticky-price";
              stickyBar.innerHTML = `
              <div style="
                position:fixed; top:0; left:0; right:0;
                background:rgba(255,255,255,0.95); backdrop-filter:blur(10px);
                border-bottom:1px solid #e5e7eb;
                padding:10px 20px;
                display:flex; justify-content:space-between; align-items:center;
                z-index:99998;
                font-family:'DM Sans', system-ui, sans-serif;
                animation: sa-slideDown 0.2s ease-out;
              ">
                <span style="font-size:18px;font-weight:700;color:#111;">${price}</span>
                <button onclick="document.querySelector('.add-to-cart')?.click()"
                  style="background:#111;color:white;border:none;padding:8px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
                  Add to Cart
                </button>
              </div>
            `;
              document.body.appendChild(stickyBar);
            }
          } else {
            stickyBar?.remove();
          }
        },
        { threshold: 0 }
      );
      observer.observe(priceEl);
    }
    static injectBNPL(adj) {
      const target = document.querySelector(adj.target_selector || ".product-price");
      if (!target || document.getElementById("sa-bnpl-callout")) return;
      const { price, installments } = adj.params;
      const perMonth = (price / installments).toFixed(2);
      const callout = document.createElement("div");
      callout.id = "sa-bnpl-callout";
      callout.innerHTML = `
      <div style="
        font-family:'DM Sans', system-ui, sans-serif;
        font-size:13px; color:#7c3aed;
        margin-top:6px;
        animation: sa-fadeIn 0.3s ease-out;
      ">
        or <b>${installments} payments of $${perMonth}</b> with <span style="font-weight:700;">Klarna</span>
      </div>
    `;
      target.parentNode?.insertBefore(callout, target.nextSibling);
    }
    static highlightElement(adj) {
      const target = document.querySelector(adj.target_selector || "");
      if (!target) return;
      target.style.transition = "box-shadow 0.3s ease";
      target.style.boxShadow = "0 0 0 3px rgba(233, 69, 96, 0.4)";
      setTimeout(() => {
        target.style.boxShadow = "none";
      }, 3e3);
    }
    static reorderContent(adj) {
      const { source_selector, target_selector, position } = adj.params;
      const source = document.querySelector(source_selector);
      const target = document.querySelector(target_selector);
      if (!source || !target) return;
      if (position === "before") {
        target.parentNode?.insertBefore(source, target);
      } else {
        target.parentNode?.insertBefore(source, target.nextSibling);
      }
    }
  };

  // src/voice/voice-manager.ts
  var VoiceManager = class {
    _muted = false;
    _fired = 0;
    maxPerSession;
    serverUrl;
    model;
    currentAudio = null;
    currentObjectUrl = null;
    /**
     * Browser autoplay policy: audio.play() is blocked until the user has
     * interacted with the page (click, keydown, touchstart).
     * _userActivated becomes true on the first such gesture, at which point any
     * pending script is drained.
     */
    _userActivated = false;
    _pendingScript = null;
    /**
     * Called when the user taps mute — receives the intervention_id of the
     * intervention that was playing when mute was triggered.
     * index.ts uses this to send a "voice_muted" outcome to the server.
     */
    _onMuted;
    constructor(opts) {
      this.maxPerSession = opts.maxPerSession;
      this.serverUrl = opts.serverUrl.replace(/\/$/, "");
      this.model = opts.deepgramModel ?? "aura-asteria-en";
      this._onMuted = opts.onMuted;
      this._listenForUserGesture();
    }
    /**
     * Register a one-time listener for the first user gesture.
     * Once activated, drain any pending script immediately.
     */
    _listenForUserGesture() {
      const activate = () => {
        if (this._userActivated) return;
        this._userActivated = true;
        if (this._pendingScript && this.canSpeak) {
          const script = this._pendingScript;
          this._pendingScript = null;
          this._playSpeech(script).catch(() => {
          });
        }
      };
      document.addEventListener("click", activate, { once: true, capture: true });
      document.addEventListener("keydown", activate, { once: true, capture: true });
      document.addEventListener("touchstart", activate, { once: true, capture: true });
    }
    // ── Public getters ──────────────────────────────────────────────────────────
    get isMuted() {
      return this._muted;
    }
    get isPlaying() {
      return this.currentAudio !== null;
    }
    /** True only when voice can actually produce audio right now. */
    get canSpeak() {
      return !this._muted && this._fired < this.maxPerSession && !!this.serverUrl;
    }
    // ── Public methods ──────────────────────────────────────────────────────────
    /**
     * Synthesise and play `script` using Deepgram TTS via the AVA server proxy.
     *
     * If the browser has not yet received a user gesture (autoplay policy),
     * the script is queued and plays automatically on the next click/key/touch.
     * Only one pending script is kept — a newer proactive intervention replaces
     * an older unplayed one.
     *
     * Errors are silently swallowed — voice is enhancement, never critical.
     */
    async speak(script) {
      if (!this.canSpeak) return;
      if (!this._userActivated) {
        this._pendingScript = script;
        return;
      }
      await this._playSpeech(script);
    }
    /** Internal: fetch TTS audio and play it. Assumes user has already gestured. */
    async _playSpeech(script) {
      try {
        this.stopCurrent();
        const resp = await fetch(`${this.serverUrl}/api/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: script, model: this.model })
        });
        if (!resp.ok) {
          console.warn(`[AVA Voice] TTS proxy error ${resp.status}: ${resp.statusText}`);
          return;
        }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        this.currentAudio = audio;
        this.currentObjectUrl = url;
        audio.addEventListener(
          "ended",
          () => {
            URL.revokeObjectURL(url);
            this.currentAudio = null;
            this.currentObjectUrl = null;
            this._fired++;
          },
          { once: true }
        );
        audio.addEventListener(
          "error",
          () => {
            URL.revokeObjectURL(url);
            this.currentAudio = null;
            this.currentObjectUrl = null;
          },
          { once: true }
        );
        await audio.play();
      } catch (err) {
        console.warn("[AVA Voice] TTS error:", err);
        this.currentAudio = null;
        this.currentObjectUrl = null;
      }
    }
    /**
     * Stop audio that is currently playing without muting future voice.
     * Used when an intervention is dismissed.
     */
    stopCurrent() {
      this._pendingScript = null;
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio.src = "";
        this.currentAudio = null;
      }
      if (this.currentObjectUrl) {
        URL.revokeObjectURL(this.currentObjectUrl);
        this.currentObjectUrl = null;
      }
    }
    /**
     * Permanently mute voice for this session.
     * Stops current playback immediately and fires the onMuted callback so the
     * outcome can be reported to the server.
     *
     * @param interventionId  The ID of the intervention that triggered the mute action.
     */
    mute(interventionId) {
      this._muted = true;
      this.stopCurrent();
      this._onMuted?.(interventionId);
    }
  };

  // src/voice/speech-recognizer.ts
  var PREFERRED_MIME_TYPES = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4"
  ];
  function getSupportedMimeType() {
    for (const mime of PREFERRED_MIME_TYPES) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }
    return "";
  }
  var SpeechRecognizer = class {
    serverUrl;
    callbacks;
    stream = null;
    recorder = null;
    chunks = [];
    _recording = false;
    _processing = false;
    /** True while the mic is actively capturing audio. */
    get isRecording() {
      return this._recording;
    }
    /** True while waiting for Deepgram to return the transcript. */
    get isProcessing() {
      return this._processing;
    }
    /** True when the user's browser supports the required APIs. */
    static isSupported() {
      return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined";
    }
    /**
     * @param serverUrl  Base URL of the AVA server (e.g. "http://localhost:8080").
     *                   STT audio is proxied through `serverUrl/api/voice/sst`.
     */
    constructor(serverUrl, callbacks) {
      this.serverUrl = serverUrl.replace(/\/$/, "");
      this.callbacks = callbacks;
    }
    /**
     * Request mic permission and start recording.
     * Throws if permission is denied.
     */
    async start() {
      if (this._recording || this._processing) return;
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 16e3
          }
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Mic permission denied");
        this.callbacks.onError?.(error);
        return;
      }
      const mimeType = getSupportedMimeType();
      this.chunks = [];
      try {
        this.recorder = new MediaRecorder(
          this.stream,
          mimeType ? { mimeType } : void 0
        );
      } catch {
        this.recorder = new MediaRecorder(this.stream);
      }
      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      this.recorder.onstop = () => {
        const mime = this.recorder?.mimeType ?? "audio/webm";
        const blob = new Blob(this.chunks, { type: mime });
        this.chunks = [];
        this.releaseStream();
        this._recording = false;
        this._processing = true;
        this.transcribe(blob, mime).catch((err) => {
          this._processing = false;
          const error = err instanceof Error ? err : new Error("Transcription failed");
          this.callbacks.onError?.(error);
        });
      };
      this.recorder.start(250);
      this._recording = true;
      this.callbacks.onRecordingStart?.();
    }
    /**
     * Stop capturing audio. Transcription runs asynchronously after this.
     */
    stop() {
      if (!this._recording || !this.recorder) return;
      this.recorder.stop();
      this.callbacks.onRecordingStop?.();
    }
    // ---- Private ----
    releaseStream() {
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    async transcribe(blob, mimeType) {
      const contentType = mimeType.split(";")[0] || "audio/webm";
      const resp = await fetch(`${this.serverUrl}/api/voice/sst`, {
        method: "POST",
        headers: {
          // Tell the proxy which audio format we're sending — it forwards this to Deepgram
          "Content-Type": "application/octet-stream",
          "X-Audio-Content-Type": contentType
        },
        body: blob
      });
      if (!resp.ok) {
        this._processing = false;
        throw new Error(`STT proxy ${resp.status}: ${await resp.text()}`);
      }
      const data = await resp.json();
      this._processing = false;
      const transcript = data?.transcript?.trim() ?? "";
      if (transcript) {
        this.callbacks.onTranscript(transcript);
      }
    }
  };

  // src/ui/components/mic-button.ts
  function renderMicButton(opts) {
    const btn = document.createElement("button");
    btn.setAttribute("aria-label", "Tap to speak");
    btn.setAttribute("title", "Tap to speak");
    btn.setAttribute("type", "button");
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
    function setState(state) {
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
  function applyIdle(btn, base) {
    btn.textContent = "\u{1F399}";
    btn.setAttribute("aria-label", "Tap to speak");
    btn.setAttribute("title", "Tap to speak \u2014 ask AVA a question");
    btn.style.cssText = `${base}background:#f3f4f6;color:#6b7280;`;
    btn.style.animation = "";
  }
  function applyRecording(btn, base) {
    btn.textContent = "\u{1F534}";
    btn.setAttribute("aria-label", "Recording \u2014 tap to stop");
    btn.setAttribute("title", "Recording\u2026 tap to stop");
    btn.style.cssText = `${base}background:#fef2f2;color:#dc2626;`;
    btn.style.animation = "sa-mic-pulse 1s ease-in-out infinite";
    btn.style.boxShadow = "0 0 0 0 rgba(220,38,38,0.4)";
  }
  function applyProcessing(btn, base) {
    btn.textContent = "\u23F3";
    btn.setAttribute("aria-label", "Processing speech\u2026");
    btn.setAttribute("title", "Processing\u2026");
    btn.style.cssText = `${base}background:#f9fafb;color:#9ca3af;cursor:default;`;
    btn.style.animation = "";
  }

  // src/ui/components/nudge-bubble.ts
  var FRICTION_CONTEXT = {
    F015: { icon: "\u{1F440}", hook: "Browsing a while without clicking?" },
    F023: { icon: "\u{1F5B1}\uFE0F", hook: "Something not responding?" },
    F058: { icon: "\u{1F914}", hook: "Weighing up whether to add this?" },
    F060: { icon: "\u{1F4B0}", hook: "Checking the price elsewhere?" },
    F068: { icon: "\u23F3", hook: "About to leave?" },
    F069: { icon: "\u{1F4A4}", hook: "Still deciding?" },
    F091: { icon: "\u26A0\uFE0F", hook: "Having trouble with the form?" },
    F094: { icon: "\u{1F4B3}", hook: "Hesitating at payment?" },
    F400: { icon: "\u{1F624}", hook: "Something frustrating?" }
  };
  var DEFAULT_HOOK = { icon: "\u{1F4A1}", hook: "Quick tip for you" };
  function renderNudgeBubble(opts) {
    const {
      config,
      message,
      frictionId,
      ctaLabel,
      onCtaClick,
      onSoftDismiss,
      onHardDismiss,
      onFeedback,
      voiceEnabled,
      onVoiceMute
    } = opts;
    const ctx = frictionId ? FRICTION_CONTEXT[frictionId] ?? DEFAULT_HOOK : DEFAULT_HOOK;
    const card = document.createElement("div");
    card.setAttribute(
      "style",
      `position:absolute;bottom:68px;right:0;width:300px;
     background:rgba(255,255,255,0.97);
     backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
     border-radius:var(--ava-radius,18px);
     box-shadow:0 8px 40px rgba(0,0,0,0.12),0 1px 4px rgba(0,0,0,0.06);
     overflow:hidden;
     animation:sa-slideUp 0.32s cubic-bezier(0.22,1,0.36,1);
     font-family:var(--ava-font,${config.fontFamily});
     border:1px solid rgba(0,0,0,0.06);
     touch-action:pan-y;`
    );
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
    const hookRow = document.createElement("div");
    hookRow.setAttribute(
      "style",
      `display:flex;align-items:center;justify-content:space-between;
     padding:12px 14px 10px;
     border-bottom:1px solid rgba(0,0,0,0.05);`
    );
    const hookLeft = document.createElement("div");
    hookLeft.setAttribute("style", "display:flex;align-items:center;gap:7px;");
    const hookIcon = document.createElement("span");
    hookIcon.setAttribute(
      "style",
      `font-size:16px;width:28px;height:28px;border-radius:8px;
     background:rgba(0,0,0,0.04);display:flex;align-items:center;justify-content:center;`
    );
    hookIcon.textContent = ctx.icon;
    const hookText = document.createElement("span");
    hookText.setAttribute(
      "style",
      `font-size:12px;font-weight:600;color:#6b7280;letter-spacing:0.01em;`
    );
    hookText.textContent = ctx.hook;
    hookLeft.appendChild(hookIcon);
    hookLeft.appendChild(hookText);
    const hookRight = document.createElement("div");
    hookRight.setAttribute("style", "display:flex;align-items:center;gap:4px;");
    if (voiceEnabled && onVoiceMute) {
      const muteBtn = document.createElement("button");
      muteBtn.setAttribute(
        "style",
        `background:none;border:none;cursor:pointer;padding:4px;
       color:#9ca3af;font-size:13px;line-height:1;border-radius:6px;
       transition:background 0.15s ease,color 0.15s ease;`
      );
      muteBtn.setAttribute("aria-label", "Mute voice tips");
      muteBtn.setAttribute("title", "Mute voice for this session");
      muteBtn.textContent = "\u{1F50A}";
      muteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        muteBtn.textContent = "\u{1F507}";
        muteBtn.style.color = "#6b7280";
        setTimeout(onVoiceMute, 200);
      });
      muteBtn.addEventListener("mouseenter", () => {
        muteBtn.style.background = "#f3f4f6";
        muteBtn.style.color = "#374151";
      });
      muteBtn.addEventListener("mouseleave", () => {
        muteBtn.style.background = "none";
        muteBtn.style.color = "#9ca3af";
      });
      hookRight.appendChild(muteBtn);
    }
    const closeBtn = document.createElement("button");
    closeBtn.setAttribute(
      "style",
      `background:none;border:none;cursor:pointer;padding:4px;
     color:#9ca3af;font-size:15px;line-height:1;border-radius:6px;
     transition:background 0.15s ease,color 0.15s ease;`
    );
    closeBtn.setAttribute("aria-label", "Stop showing tips");
    closeBtn.setAttribute("title", "Don't show tips like this");
    closeBtn.textContent = "\xD7";
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
    hookRight.appendChild(closeBtn);
    hookRow.appendChild(hookLeft);
    hookRow.appendChild(hookRight);
    card.appendChild(hookRow);
    const body = document.createElement("div");
    body.setAttribute(
      "style",
      `padding:12px 14px 10px;cursor:pointer;`
    );
    body.addEventListener("click", (e) => {
      e.stopPropagation();
      onCtaClick();
    });
    const messageEl = document.createElement("div");
    messageEl.setAttribute(
      "style",
      `font-size:14px;line-height:1.55;color:#111827;font-weight:400;`
    );
    messageEl.textContent = message;
    body.appendChild(messageEl);
    if (ctaLabel) {
      const ctaBtn = document.createElement("button");
      ctaBtn.setAttribute(
        "style",
        `display:block;width:100%;margin-top:10px;
       background:var(--ava-primary,${config.brandColor});color:#fff;
       border:none;border-radius:calc(var(--ava-radius,18px) - 8px);padding:10px 16px;
       font-size:13px;font-weight:600;cursor:pointer;
       font-family:var(--ava-font,${config.fontFamily});
       transition:opacity 0.15s ease,transform 0.1s ease;`
      );
      ctaBtn.textContent = ctaLabel;
      ctaBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        onCtaClick();
      });
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
    const footer = document.createElement("div");
    footer.setAttribute(
      "style",
      `display:flex;align-items:center;justify-content:space-between;
     padding:7px 14px 9px;
     border-top:1px solid rgba(0,0,0,0.05);`
    );
    const feedbackWrap = document.createElement("div");
    feedbackWrap.setAttribute("style", "display:flex;align-items:center;gap:2px;");
    const feedbackBtnStyle = `background:none;border:none;cursor:pointer;padding:4px 8px;
     font-size:14px;line-height:1;border-radius:6px;
     transition:background 0.15s ease,transform 0.1s ease;`;
    const thumbsUpBtn = document.createElement("button");
    thumbsUpBtn.setAttribute("style", feedbackBtnStyle);
    thumbsUpBtn.setAttribute("aria-label", "Helpful");
    thumbsUpBtn.setAttribute("title", "Helpful");
    thumbsUpBtn.textContent = "\u{1F44D}";
    const thumbsDownBtn = document.createElement("button");
    thumbsDownBtn.setAttribute("style", feedbackBtnStyle);
    thumbsDownBtn.setAttribute("aria-label", "Not helpful");
    thumbsDownBtn.setAttribute("title", "Not helpful");
    thumbsDownBtn.textContent = "\u{1F44E}";
    function disableFeedbackBtns(selected) {
      thumbsUpBtn.style.cursor = "default";
      thumbsDownBtn.style.cursor = "default";
      thumbsUpBtn.style.opacity = selected === "up" ? "1" : "0.3";
      thumbsDownBtn.style.opacity = selected === "down" ? "1" : "0.3";
    }
    thumbsUpBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      disableFeedbackBtns("up");
      onFeedback("helpful");
    });
    thumbsDownBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      disableFeedbackBtns("down");
      onFeedback("not_helpful");
    });
    thumbsUpBtn.addEventListener("mouseenter", () => {
      thumbsUpBtn.style.background = "#f0fdf4";
    });
    thumbsUpBtn.addEventListener("mouseleave", () => {
      thumbsUpBtn.style.background = "none";
    });
    thumbsDownBtn.addEventListener("mouseenter", () => {
      thumbsDownBtn.style.background = "#fef2f2";
    });
    thumbsDownBtn.addEventListener("mouseleave", () => {
      thumbsDownBtn.style.background = "none";
    });
    feedbackWrap.appendChild(thumbsUpBtn);
    feedbackWrap.appendChild(thumbsDownBtn);
    const softDismissBtn = document.createElement("button");
    softDismissBtn.setAttribute(
      "style",
      `background:none;border:none;cursor:pointer;padding:3px 6px;
     font-size:11px;color:#9ca3af;font-family:var(--ava-font,${config.fontFamily});
     border-radius:6px;transition:background 0.15s ease,color 0.15s ease;`
    );
    softDismissBtn.textContent = "Not now";
    softDismissBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      softDismissBtn.textContent = "Ok \u2193";
      softDismissBtn.style.color = "#6b7280";
      setTimeout(onSoftDismiss, 400);
    });
    softDismissBtn.addEventListener("mouseenter", () => {
      softDismissBtn.style.background = "#f3f4f6";
      softDismissBtn.style.color = "#374151";
    });
    softDismissBtn.addEventListener("mouseleave", () => {
      softDismissBtn.style.background = "none";
      softDismissBtn.style.color = "#9ca3af";
    });
    footer.appendChild(feedbackWrap);
    footer.appendChild(softDismissBtn);
    card.appendChild(footer);
    return card;
  }

  // src/ui/components/product-card.ts
  function renderProductCard(opts) {
    const { config, card, index, onAddToCart, onMoreLikeThis } = opts;
    const hasDiscount = card.original_price && card.original_price > card.price;
    const discountPct = hasDiscount ? Math.round(
      (card.original_price - card.price) / card.original_price * 100
    ) : 0;
    const container = document.createElement("div");
    container.setAttribute(
      "style",
      `background:#fff;border-radius:14px;border:1px solid #f0f0f0;overflow:hidden;
     animation:sa-slideUp 0.3s ease-out ${index * 0.08}s both;
     cursor:pointer;transition:box-shadow 0.2s ease,transform 0.2s ease;`
    );
    container.addEventListener("mouseenter", () => {
      container.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)";
      container.style.transform = "translateY(-2px)";
    });
    container.addEventListener("mouseleave", () => {
      container.style.boxShadow = "none";
      container.style.transform = "translateY(0)";
    });
    const imgWrap = document.createElement("div");
    imgWrap.setAttribute(
      "style",
      "position:relative;padding-top:72%;background:#f9fafb;overflow:hidden;"
    );
    const img = document.createElement("img");
    img.src = card.image_url;
    img.alt = card.title;
    img.loading = "lazy";
    img.setAttribute(
      "style",
      "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;transition:transform 0.3s ease;"
    );
    container.addEventListener("mouseenter", () => {
      img.style.transform = "scale(1.03)";
    });
    container.addEventListener("mouseleave", () => {
      img.style.transform = "scale(1)";
    });
    imgWrap.appendChild(img);
    if (hasDiscount) {
      const badge = document.createElement("span");
      badge.setAttribute(
        "style",
        `position:absolute;top:8px;left:8px;background:var(--ava-accent,${config.accentColor});
       color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;`
      );
      badge.textContent = `-${discountPct}%`;
      imgWrap.appendChild(badge);
    }
    if (card.differentiator) {
      const diff = document.createElement("span");
      diff.setAttribute(
        "style",
        `position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,0.65);
       color:#fff;font-size:10px;font-weight:500;padding:3px 8px;border-radius:6px;
       backdrop-filter:blur(4px);`
      );
      diff.textContent = card.differentiator;
      imgWrap.appendChild(diff);
    }
    if (onMoreLikeThis) {
      const moreBtn = document.createElement("button");
      moreBtn.setAttribute(
        "style",
        `position:absolute;top:8px;right:8px;
       background:rgba(255,255,255,0.85);backdrop-filter:blur(6px);
       border:none;border-radius:8px;padding:4px 8px;
       font-size:10px;font-weight:600;color:#374151;cursor:pointer;
       opacity:0;transition:opacity 0.2s ease;font-family:var(--ava-font,${config.fontFamily});`
      );
      moreBtn.textContent = "More like this";
      moreBtn.setAttribute("aria-label", "Show more recommendations like this");
      container.addEventListener("mouseenter", () => {
        moreBtn.style.opacity = "1";
      });
      container.addEventListener("mouseleave", () => {
        moreBtn.style.opacity = "0";
      });
      moreBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        moreBtn.textContent = "\u2713 Noted";
        moreBtn.style.color = "#22c55e";
        moreBtn.style.opacity = "1";
        setTimeout(() => {
          if (onMoreLikeThis) onMoreLikeThis(card.product_id);
        }, 500);
      });
      imgWrap.appendChild(moreBtn);
    }
    container.appendChild(imgWrap);
    const info = document.createElement("div");
    info.setAttribute("style", "padding:10px 12px 12px;");
    const title = document.createElement("div");
    title.setAttribute(
      "style",
      `font-size:13px;font-weight:500;color:#111827;line-height:1.35;
     overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:5px;`
    );
    title.textContent = card.title;
    info.appendChild(title);
    const ratingWrap = document.createElement("div");
    ratingWrap.setAttribute(
      "style",
      "display:flex;align-items:center;gap:4px;margin-bottom:8px;"
    );
    const stars = document.createElement("span");
    stars.setAttribute("style", "font-size:11px;color:#f59e0b;");
    stars.textContent = "\u2605".repeat(Math.round(card.rating)) + "\u2606".repeat(5 - Math.round(card.rating));
    const reviewCount = document.createElement("span");
    reviewCount.setAttribute("style", "font-size:11px;color:#9ca3af;");
    reviewCount.textContent = `(${card.review_count})`;
    ratingWrap.appendChild(stars);
    ratingWrap.appendChild(reviewCount);
    info.appendChild(ratingWrap);
    const priceRow = document.createElement("div");
    priceRow.setAttribute(
      "style",
      "display:flex;justify-content:space-between;align-items:center;"
    );
    const priceWrap = document.createElement("div");
    priceWrap.setAttribute("style", "display:flex;align-items:baseline;gap:5px;");
    const price = document.createElement("span");
    price.setAttribute("style", "font-size:16px;font-weight:700;color:#111827;");
    price.textContent = `$${card.price.toFixed(2)}`;
    priceWrap.appendChild(price);
    if (hasDiscount) {
      const origPrice = document.createElement("span");
      origPrice.setAttribute(
        "style",
        "font-size:12px;color:#9ca3af;text-decoration:line-through;"
      );
      origPrice.textContent = `$${card.original_price.toFixed(2)}`;
      priceWrap.appendChild(origPrice);
    }
    const addBtn = document.createElement("button");
    addBtn.setAttribute(
      "style",
      `background:var(--ava-primary,${config.brandColor});color:#fff;border:none;border-radius:9px;
     padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;
     font-family:var(--ava-font,${config.fontFamily});
     transition:background 0.15s ease,transform 0.1s ease,opacity 0.15s ease;`
    );
    addBtn.textContent = "+ Add";
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      addBtn.textContent = "\u2713 Added";
      addBtn.style.background = "#22c55e";
      addBtn.style.transform = "scale(1)";
      setTimeout(() => {
        addBtn.textContent = "+ Add";
        addBtn.style.background = `var(--ava-primary,${config.brandColor})`;
      }, 1800);
      onAddToCart(card.product_id);
    });
    addBtn.addEventListener("mouseenter", () => {
      addBtn.style.opacity = "0.88";
    });
    addBtn.addEventListener("mouseleave", () => {
      addBtn.style.opacity = "1";
    });
    addBtn.addEventListener("mousedown", () => {
      addBtn.style.transform = "scale(0.95)";
    });
    addBtn.addEventListener("mouseup", () => {
      addBtn.style.transform = "scale(1)";
    });
    priceRow.appendChild(priceWrap);
    priceRow.appendChild(addBtn);
    info.appendChild(priceRow);
    container.appendChild(info);
    return container;
  }

  // src/ui/components/comparison-card.ts
  function renderComparisonCard(opts) {
    const { config, comparison, onSelect } = opts;
    const [a, b] = comparison.products;
    const container = document.createElement("div");
    container.setAttribute(
      "style",
      "background:#fff;border-radius:12px;border:1px solid #f0f0f0;overflow:hidden;animation:sa-slideUp 0.3s ease-out;"
    );
    const grid = document.createElement("div");
    grid.setAttribute("style", "display:grid;grid-template-columns:1fr 1fr;gap:0;");
    [a, b].forEach((product, idx) => {
      const cell = document.createElement("div");
      cell.setAttribute(
        "style",
        `padding:12px;${idx === 0 ? "border-right:1px solid #f0f0f0;" : ""}text-align:center;`
      );
      const imgWrap = document.createElement("div");
      imgWrap.setAttribute(
        "style",
        "width:100%;padding-top:80%;position:relative;background:#f9fafb;border-radius:8px;overflow:hidden;margin-bottom:8px;"
      );
      const img = document.createElement("img");
      img.src = product.image_url;
      img.alt = product.title;
      img.setAttribute(
        "style",
        "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;"
      );
      imgWrap.appendChild(img);
      if (comparison.recommendation?.product_id === product.product_id) {
        const badge = document.createElement("span");
        badge.setAttribute(
          "style",
          "position:absolute;top:6px;right:6px;background:#22c55e;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;"
        );
        badge.textContent = "Recommended";
        imgWrap.appendChild(badge);
      }
      cell.appendChild(imgWrap);
      const titleEl = document.createElement("div");
      titleEl.setAttribute(
        "style",
        "font-size:12px;font-weight:600;color:#111;line-height:1.3;"
      );
      titleEl.textContent = product.title;
      cell.appendChild(titleEl);
      const priceEl = document.createElement("div");
      priceEl.setAttribute(
        "style",
        `font-size:16px;font-weight:700;color:var(--ava-accent,${config.accentColor});margin-top:4px;`
      );
      priceEl.textContent = `$${product.price.toFixed(2)}`;
      cell.appendChild(priceEl);
      grid.appendChild(cell);
    });
    container.appendChild(grid);
    if (comparison.differing_attributes.length > 0) {
      const attrsWrap = document.createElement("div");
      attrsWrap.setAttribute("style", "border-top:1px solid #f0f0f0;");
      comparison.differing_attributes.forEach((attr, idx) => {
        const row = document.createElement("div");
        row.setAttribute(
          "style",
          `display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:8px 12px;${idx < comparison.differing_attributes.length - 1 ? "border-bottom:1px solid #f8f8f8;" : ""}font-size:12px;`
        );
        const val1 = document.createElement("span");
        val1.setAttribute("style", "text-align:center;color:#374151;");
        val1.textContent = attr.values[0];
        const label = document.createElement("span");
        label.setAttribute(
          "style",
          "color:#9ca3af;font-size:10px;font-weight:600;background:#f3f4f6;padding:2px 8px;border-radius:4px;"
        );
        label.textContent = attr.label;
        const val2 = document.createElement("span");
        val2.setAttribute("style", "text-align:center;color:#374151;");
        val2.textContent = attr.values[1];
        row.appendChild(val1);
        row.appendChild(label);
        row.appendChild(val2);
        attrsWrap.appendChild(row);
      });
      container.appendChild(attrsWrap);
    }
    const actionsWrap = document.createElement("div");
    actionsWrap.setAttribute(
      "style",
      "display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px;border-top:1px solid #f0f0f0;"
    );
    [a, b].forEach((product) => {
      const btn = document.createElement("button");
      const isRecommended = comparison.recommendation?.product_id === product.product_id;
      btn.setAttribute(
        "style",
        `background:${isRecommended ? `var(--ava-primary,${config.brandColor})` : "#f3f4f6"};color:${isRecommended ? "#fff" : "#374151"};border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--ava-font,${config.fontFamily});transition:all 0.2s ease;`
      );
      btn.textContent = "Choose This";
      btn.addEventListener("click", () => onSelect(product.product_id));
      actionsWrap.appendChild(btn);
    });
    container.appendChild(actionsWrap);
    if (comparison.recommendation?.reason) {
      const reason = document.createElement("div");
      reason.setAttribute(
        "style",
        "padding:8px 12px;background:#f0fdf4;font-size:11px;color:#166534;text-align:center;border-top:1px solid #bbf7d0;"
      );
      reason.textContent = `\u{1F4A1} ${comparison.recommendation.reason}`;
      container.appendChild(reason);
    }
    return container;
  }

  // src/ui/components/panel.ts
  function renderPanel(opts) {
    const { config, isMobile, onMinimize, voiceEnabled, onVoiceMute } = opts;
    const isRight = config.position === "bottom-right";
    const panel = document.createElement("div");
    panel.id = "ava-panel";
    if (isMobile) {
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
       z-index:${config.zIndex};`
      );
      const handle = document.createElement("div");
      handle.setAttribute(
        "style",
        `width:40px;height:4px;background:#e5e7eb;border-radius:2px;
       margin:10px auto 0;flex-shrink:0;`
      );
      panel.appendChild(handle);
    } else {
      panel.setAttribute(
        "style",
        `position:absolute;bottom:68px;${isRight ? "right" : "left"}:0;
       width:380px;max-height:560px;
       background:rgba(255,255,255,0.98);
       backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
       border-radius:20px;
       box-shadow:0 12px 60px rgba(0,0,0,0.14),0 2px 8px rgba(0,0,0,0.05);
       display:flex;flex-direction:column;overflow:hidden;
       animation:sa-slideUp 0.32s cubic-bezier(0.22,1,0.36,1);`
      );
    }
    const header = document.createElement("div");
    header.setAttribute(
      "style",
      `background:linear-gradient(135deg,var(--ava-primary,${config.brandColor}) 0%,var(--ava-primary-light,${config.brandColorLight}) 100%);
     padding:14px 16px;display:flex;align-items:center;justify-content:space-between;
     flex-shrink:0;`
    );
    const headerLeft = document.createElement("div");
    headerLeft.setAttribute("style", "display:flex;align-items:center;gap:10px;");
    const icon = document.createElement("div");
    icon.setAttribute(
      "style",
      `width:34px;height:34px;border-radius:10px;
     background:rgba(255,255,255,0.15);
     display:flex;align-items:center;justify-content:center;font-size:17px;`
    );
    icon.textContent = "\u{1F6CD}\uFE0F";
    const nameWrap = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.setAttribute("style", "font-size:15px;font-weight:700;color:#fff;");
    nameEl.textContent = config.assistantName;
    const subEl = document.createElement("div");
    subEl.setAttribute(
      "style",
      `font-size:11px;color:rgba(255,255,255,0.65);display:flex;align-items:center;gap:4px;`
    );
    const liveDot = document.createElement("span");
    liveDot.setAttribute(
      "style",
      "width:6px;height:6px;border-radius:50%;background:#4ade80;display:inline-block;"
    );
    subEl.appendChild(liveDot);
    subEl.appendChild(document.createTextNode("Shopping assistant"));
    nameWrap.appendChild(nameEl);
    nameWrap.appendChild(subEl);
    headerLeft.appendChild(icon);
    headerLeft.appendChild(nameWrap);
    const headerRight = document.createElement("div");
    headerRight.setAttribute("style", "display:flex;align-items:center;gap:6px;");
    if (voiceEnabled && onVoiceMute) {
      const muteBtnPanel = document.createElement("button");
      muteBtnPanel.setAttribute(
        "style",
        `background:rgba(255,255,255,0.15);border:none;color:#fff;
       width:30px;height:30px;border-radius:8px;cursor:pointer;
       font-size:14px;display:flex;align-items:center;justify-content:center;
       transition:background 0.15s ease;`
      );
      muteBtnPanel.setAttribute("aria-label", "Mute voice");
      muteBtnPanel.setAttribute("title", "Mute voice for this session");
      muteBtnPanel.textContent = "\u{1F50A}";
      muteBtnPanel.addEventListener("click", () => {
        muteBtnPanel.textContent = "\u{1F507}";
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
     transition:background 0.15s ease;`
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
    const leadArea = document.createElement("div");
    leadArea.id = "ava-lead-area";
    leadArea.setAttribute("style", "flex-shrink:0;");
    panel.appendChild(leadArea);
    const content = document.createElement("div");
    content.id = "ava-panel-content";
    content.className = "ava-messages-area";
    content.setAttribute(
      "style",
      `flex:1;overflow-y:auto;padding:12px 14px;
     display:flex;flex-direction:column;gap:10px;
     background:#f8f9fa;`
    );
    panel.appendChild(content);
    const footer = document.createElement("div");
    footer.id = "ava-panel-footer";
    footer.setAttribute(
      "style",
      `border-top:1px solid rgba(0,0,0,0.06);background:#fff;padding:10px 14px;
     flex-shrink:0;`
    );
    panel.appendChild(footer);
    return panel;
  }
  function renderLeadSkeleton() {
    const skeleton = document.createElement("div");
    skeleton.id = "ava-lead-skeleton";
    skeleton.setAttribute(
      "style",
      "padding:16px 14px;border-bottom:1px solid rgba(0,0,0,0.05);"
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
  function renderLeadCard(opts) {
    const { config, frictionId, message, ctaLabel, onCtaClick, onFeedback } = opts;
    const FRICTION_LABELS = {
      F015: "Browsing signal",
      F023: "Interaction issue",
      F058: "Decision friction",
      F060: "Price comparison",
      F068: "Exit intent",
      F069: "Idle session",
      F091: "Form friction",
      F094: "Payment hesitation",
      F400: "Rage click detected"
    };
    const card = document.createElement("div");
    card.id = "ava-lead-card";
    card.setAttribute(
      "style",
      `padding:14px 16px 12px;border-bottom:1px solid rgba(0,0,0,0.06);
     animation:sa-fadeIn 0.25s ease-out;`
    );
    if (frictionId && FRICTION_LABELS[frictionId]) {
      const tag = document.createElement("div");
      tag.setAttribute(
        "style",
        `display:inline-flex;align-items:center;gap:5px;
       background:#f3f4f6;border-radius:6px;padding:3px 8px;
       font-size:10px;font-weight:600;color:#6b7280;letter-spacing:0.03em;
       text-transform:uppercase;margin-bottom:8px;`
      );
      tag.textContent = FRICTION_LABELS[frictionId];
      card.appendChild(tag);
    }
    const msgEl = document.createElement("div");
    msgEl.setAttribute(
      "style",
      `font-size:14px;line-height:1.6;color:#111827;font-weight:400;margin-bottom:${ctaLabel ? "12px" : "0"};`
    );
    msgEl.textContent = message;
    card.appendChild(msgEl);
    if (ctaLabel && onCtaClick) {
      const ctaBtn = document.createElement("button");
      ctaBtn.setAttribute(
        "style",
        `display:block;width:100%;background:var(--ava-primary,${config.brandColor});color:#fff;
       border:none;border-radius:10px;padding:11px 16px;
       font-size:13px;font-weight:600;cursor:pointer;
       font-family:var(--ava-font,${config.fontFamily});
       transition:opacity 0.15s ease,transform 0.1s ease;`
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
        ctaBtn.style.transform = "scale(0.99)";
      });
      ctaBtn.addEventListener("mouseup", () => {
        ctaBtn.style.transform = "scale(1)";
      });
      card.appendChild(ctaBtn);
    }
    if (onFeedback) {
      let disableBtns2 = function(selected) {
        thumbsUp.style.cursor = "default";
        thumbsDown.style.cursor = "default";
        thumbsUp.style.opacity = selected === "up" ? "1" : "0.3";
        thumbsDown.style.opacity = selected === "down" ? "1" : "0.3";
      };
      var disableBtns = disableBtns2;
      const feedbackRow = document.createElement("div");
      feedbackRow.setAttribute("style", "margin-top:8px;display:flex;align-items:center;gap:2px;");
      const fbBtnStyle = `background:none;border:none;cursor:pointer;padding:4px 8px;
       font-size:14px;line-height:1;border-radius:6px;
       transition:background 0.15s ease,transform 0.1s ease;`;
      const thumbsUp = document.createElement("button");
      thumbsUp.setAttribute("style", fbBtnStyle);
      thumbsUp.setAttribute("aria-label", "Helpful");
      thumbsUp.textContent = "\u{1F44D}";
      const thumbsDown = document.createElement("button");
      thumbsDown.setAttribute("style", fbBtnStyle);
      thumbsDown.setAttribute("aria-label", "Not helpful");
      thumbsDown.textContent = "\u{1F44E}";
      thumbsUp.addEventListener("click", () => {
        disableBtns2("up");
        onFeedback("helpful");
      });
      thumbsDown.addEventListener("click", () => {
        disableBtns2("down");
        onFeedback("not_helpful");
      });
      thumbsUp.addEventListener("mouseenter", () => {
        thumbsUp.style.background = "#f0fdf4";
      });
      thumbsUp.addEventListener("mouseleave", () => {
        thumbsUp.style.background = "none";
      });
      thumbsDown.addEventListener("mouseenter", () => {
        thumbsDown.style.background = "#fef2f2";
      });
      thumbsDown.addEventListener("mouseleave", () => {
        thumbsDown.style.background = "none";
      });
      feedbackRow.appendChild(thumbsUp);
      feedbackRow.appendChild(thumbsDown);
      card.appendChild(feedbackRow);
    }
    return card;
  }
  function renderEmptyState(config) {
    const empty = document.createElement("div");
    empty.setAttribute(
      "style",
      `text-align:center;padding:32px 20px;color:#9ca3af;
     font-size:13px;font-family:var(--ava-font,${config.fontFamily});`
    );
    const wave = document.createElement("div");
    wave.setAttribute("style", "font-size:26px;margin-bottom:8px;");
    wave.textContent = "\u{1F44B}";
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

  // src/ui/components/toggle-button.ts
  function renderToggleButton(opts) {
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
     position:relative;overflow:hidden;font-family:var(--ava-font,${config.fontFamily});`
    );
    const iconSpan = document.createElement("span");
    iconSpan.id = "ava-btn-icon";
    iconSpan.setAttribute("style", "font-size:22px;line-height:1;flex-shrink:0;");
    iconSpan.textContent = "\u{1F6CD}\uFE0F";
    btn.appendChild(iconSpan);
    const labelSpan = document.createElement("span");
    labelSpan.id = "ava-btn-label";
    labelSpan.setAttribute(
      "style",
      `font-size:13px;font-weight:600;color:#fff;white-space:nowrap;
     max-width:0;overflow:hidden;opacity:0;margin-left:0;
     transition:max-width 0.3s ease,opacity 0.3s ease,margin-left 0.3s ease;`
    );
    btn.appendChild(labelSpan);
    btn.addEventListener("click", onClick);
    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "scale(1.05)";
      btn.style.boxShadow = "0 6px 28px rgba(0,0,0,0.2)";
      btn.style.opacity = "1";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "scale(1)";
      btn.style.boxShadow = "0 4px 20px rgba(0,0,0,0.15)";
      btn.style.opacity = btn.dataset.idleOpacity ?? "0.65";
    });
    return btn;
  }
  function updateToggleButton(btn, state, hasUnread, config, labelText) {
    const iconSpan = btn.querySelector("#ava-btn-icon");
    const labelSpan = btn.querySelector("#ava-btn-label");
    if (state === "expanded") {
      if (iconSpan) {
        iconSpan.textContent = "\xD7";
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
      btn.dataset.idleOpacity = "1";
    } else if (state === "signal" && labelText) {
      if (iconSpan) iconSpan.textContent = "\u{1F6CD}\uFE0F";
      if (labelSpan) {
        labelSpan.textContent = labelText;
        labelSpan.style.maxWidth = "180px";
        labelSpan.style.opacity = "1";
        labelSpan.style.marginLeft = "8px";
      }
      btn.setAttribute("aria-label", labelText);
      btn.style.animation = "sa-breathe 2s ease-in-out infinite";
      btn.style.opacity = "1";
      btn.dataset.idleOpacity = "1";
    } else {
      if (iconSpan) iconSpan.textContent = "\u{1F6CD}\uFE0F";
      if (labelSpan) {
        labelSpan.style.maxWidth = "0";
        labelSpan.style.opacity = "0";
        labelSpan.style.marginLeft = "0";
      }
      btn.setAttribute("aria-label", "Open assistant");
      btn.style.animation = hasUnread ? "sa-breathe 2s ease-in-out infinite" : "none";
      const idleOpacity = hasUnread ? "1" : "0.65";
      btn.style.opacity = idleOpacity;
      btn.dataset.idleOpacity = idleOpacity;
    }
    let dot = btn.querySelector(".ava-unread-dot");
    if (hasUnread && state === "minimized") {
      if (!dot) {
        dot = document.createElement("div");
        dot.className = "ava-unread-dot";
        dot.setAttribute(
          "style",
          `position:absolute;top:-2px;right:-2px;width:12px;height:12px;border-radius:50%;
         background:${config.accentColor};border:2px solid #fff;
         animation:sa-scaleIn 0.3s ease-out;`
        );
        btn.appendChild(dot);
      }
    } else if (dot) {
      dot.remove();
    }
  }

  // src/ava.ts
  function deriveLabelText(payload) {
    const FRICTION_LABELS = {
      F015: "Tip while you browse \u2192",
      F023: "Something not working? \u2192",
      F058: "Help deciding? \u2192",
      F060: "Found a better price? \u2192",
      F068: "Before you go \u2192",
      F069: "Still there? \u2192",
      F091: "Form help \u2192",
      F094: "Payment question? \u2192",
      F400: "Let me help \u2192"
    };
    if (payload.friction_id && FRICTION_LABELS[payload.friction_id]) {
      return FRICTION_LABELS[payload.friction_id];
    }
    if (payload.type === "escalate") return "Support available \u2192";
    return "Quick tip \u2192";
  }
  var AVAWidget = class {
    shadow;
    config;
    state = "minimized";
    messages = [];
    currentNudge = null;
    isTyping = false;
    hasUnread = false;
    inputValue = "";
    isMobile = false;
    // Root containers
    root;
    nudgeContainer;
    panelContainer;
    messagesContainer;
    inputEl;
    toggleBtn;
    // External callbacks (wired by index.ts)
    onDismiss = () => {
    };
    onConvert = () => {
    };
    onIgnored = () => {
    };
    onUserMessage = () => {
    };
    onUserAction = () => {
    };
    /** Micro-outcome callback — fine-grained training signal */
    onMicroOutcome = () => {
    };
    /** Feedback callback — thumbs up/down on interventions */
    onFeedback = () => {
    };
    /** Called when user taps mute — index.ts forwards this as "voice_muted" outcome */
    onVoiceMuted = () => {
    };
    /** Called when a voice query transcript is ready — index.ts sends it as voice_query WS message */
    onVoiceQuery = () => {
    };
    // Voice (TTS + ASR)
    voiceManager = null;
    speechRecognizer = null;
    micHandle = null;
    nudgeTimeout = null;
    signalCollapseTimeout = null;
    // Track intervention IDs that have already reported a terminal outcome
    reportedOutcomes = /* @__PURE__ */ new Set();
    constructor(shadow, config) {
      this.shadow = shadow;
      this.config = config;
      this.isMobile = window.matchMedia("(max-width: 640px)").matches;
      window.matchMedia("(max-width: 640px)").addEventListener("change", (e) => {
        this.isMobile = e.matches;
      });
      if (config.voiceEnabled && config.serverUrl) {
        this.voiceManager = new VoiceManager({
          maxPerSession: config.voiceMaxPerSession ?? 3,
          serverUrl: config.serverUrl,
          deepgramModel: config.deepgramModel ?? "aura-asteria-en",
          onMuted: (interventionId) => {
            this.onVoiceMuted(interventionId);
            this.render();
          }
        });
        if (SpeechRecognizer.isSupported()) {
          this.speechRecognizer = new SpeechRecognizer(config.serverUrl, {
            onRecordingStart: () => {
              this.micHandle?.setState("recording");
            },
            onRecordingStop: () => {
              this.micHandle?.setState("processing");
            },
            onTranscript: (transcript) => {
              this.micHandle?.setState("idle");
              this.handleVoiceTranscript(transcript);
            },
            onError: (err) => {
              this.micHandle?.setState("idle");
              console.warn("[AVA] Speech recognition error:", err.message);
            }
          });
        }
      }
    }
    mount() {
      this.applyCSSVars();
      injectGlobalStyles(this.shadow);
      this.root = this.el("div", {
        id: "shopassist-widget",
        style: this.isMobile ? `position:relative;font-family:${this.config.fontFamily};` : `position:fixed;bottom:20px;${this.config.position === "bottom-right" ? "right" : "left"}:20px;z-index:${this.config.zIndex};font-family:${this.config.fontFamily};`
      });
      this.nudgeContainer = this.el("div", { id: "ava-nudge" });
      this.root.appendChild(this.nudgeContainer);
      this.panelContainer = this.el("div", { id: "ava-panel-wrap" });
      this.panelContainer.style.display = "none";
      this.root.appendChild(this.panelContainer);
      if (!this.isMobile) {
        this.toggleBtn = renderToggleButton({
          config: this.config,
          onClick: () => this.handleToggleClick()
        });
        this.root.appendChild(this.toggleBtn);
      } else {
        this.toggleBtn = document.createElement("button");
        this.toggleBtn.setAttribute(
          "style",
          `position:fixed;bottom:20px;right:20px;width:52px;height:52px;
         border-radius:50%;background:linear-gradient(135deg,${this.config.brandColor},${this.config.brandColorLight});
         color:#fff;border:none;cursor:pointer;
         display:flex;align-items:center;justify-content:center;font-size:22px;
         box-shadow:0 4px 20px rgba(0,0,0,0.2);z-index:${this.config.zIndex};
         transition:opacity 0.3s ease;`
        );
        this.toggleBtn.textContent = "\u{1F6CD}\uFE0F";
        this.toggleBtn.addEventListener("click", () => this.handleToggleClick());
        this.toggleBtn.addEventListener("mouseenter", () => {
          this.toggleBtn.style.opacity = "1";
        });
        this.toggleBtn.addEventListener("mouseleave", () => {
          if (this.state === "minimized" && !this.hasUnread) this.toggleBtn.style.opacity = "0.18";
        });
        document.body.appendChild(this.toggleBtn);
      }
      this.shadow.appendChild(this.root);
      this.render();
      setTimeout(() => {
        if (this.state !== "minimized") return;
        this.handleIntervention({
          type: "nudge",
          intervention_id: "ava_welcome",
          action_code: "WELCOME",
          message: "Hi, I am AVA. I am here to assist you with your shopping today. Just tap on me and let me know how can I help you.",
          voice_enabled: true,
          voice_script: "Hi, I am AVA. I am here to assist you with your shopping today. Just tap on me and let me know how I can help you.",
          cta_label: "Let's chat",
          cta_action: "open_assistant"
        });
      }, 1500);
    }
    // ---- PUBLIC: called by bridge ----
    handleIntervention(payload) {
      switch (payload.type) {
        case "passive":
          if (payload.ui_adjustment) {
            try {
              PassiveExecutor.execute(payload.ui_adjustment);
            } catch {
            }
          }
          this.currentNudge = payload;
          this.render();
          if (this.nudgeTimeout) clearTimeout(this.nudgeTimeout);
          this.nudgeTimeout = setTimeout(() => {
            if (this.currentNudge?.intervention_id === payload.intervention_id) {
              this.onIgnored(payload.intervention_id);
              this.currentNudge = null;
              this.render();
            }
          }, 8e3);
          break;
        case "nudge":
          this.currentNudge = payload;
          this.hasUnread = true;
          if (this.state === "minimized") {
            this.state = "signal";
            if (this.signalCollapseTimeout) clearTimeout(this.signalCollapseTimeout);
            this.signalCollapseTimeout = setTimeout(() => {
              if (this.state === "signal") {
                this.state = "minimized";
                this.renderToggle();
              }
            }, 4e3);
          }
          this.render();
          if (this.nudgeTimeout) clearTimeout(this.nudgeTimeout);
          this.nudgeTimeout = setTimeout(() => {
            if (this.currentNudge?.intervention_id === payload.intervention_id) {
              this.voiceManager?.stopCurrent();
              this.onIgnored(payload.intervention_id);
              this.currentNudge = null;
              if (this.state === "signal") this.state = "minimized";
              this.render();
            }
          }, 12e3);
          if (payload.voice_enabled && payload.voice_script && this.config.voiceAutoPlay !== false) {
            this.voiceManager?.speak(payload.voice_script).catch(() => {
            });
          }
          break;
        case "active":
          this.currentNudge = null;
          if (this.signalCollapseTimeout) clearTimeout(this.signalCollapseTimeout);
          this.state = "expanded";
          this.isTyping = true;
          this.render();
          setTimeout(() => {
            this.isTyping = false;
            this.messages.push({
              id: payload.intervention_id,
              type: "assistant",
              content: payload.message || "",
              payload,
              timestamp: Date.now()
            });
            this.render();
            this.scrollMessages();
            if (payload.voice_enabled && payload.voice_script && this.config.voiceAutoPlay !== false) {
              this.voiceManager?.speak(payload.voice_script).catch(() => {
              });
            }
          }, 500);
          break;
        case "escalate":
          this.currentNudge = null;
          if (this.signalCollapseTimeout) clearTimeout(this.signalCollapseTimeout);
          this.state = "expanded";
          this.messages.push({
            id: payload.intervention_id,
            type: "system",
            content: payload.message || "Connecting you with support...",
            payload,
            timestamp: Date.now()
          });
          this.render();
          this.scrollMessages();
          if (payload.voice_enabled && payload.voice_script && this.config.voiceAutoPlay !== false) {
            this.voiceManager?.speak(payload.voice_script).catch(() => {
            });
          }
          break;
      }
    }
    /**
     * Called by bridge when the server acks a voice_query.
     * Clears the typing indicator if the query was rejected (disabled / error).
     * On "ok" the server will follow up with a real "intervention" message.
     */
    handleVoiceQueryAck(data) {
      if (data.status !== "ok") {
        this.isTyping = false;
        const errMsg = data.status === "disabled" ? "Voice assistance is not enabled on this site." : "Sorry, I couldn't process that. Please try again.";
        this.messages.push({
          id: `sys_${Date.now()}`,
          type: "system",
          content: errMsg,
          timestamp: Date.now()
        });
        this.micHandle?.setState("idle");
        this.render();
        this.scrollMessages();
      }
    }
    // ---- RENDER ORCHESTRATOR ----
    render() {
      this.renderNudge();
      this.renderPanelView();
      this.renderToggle();
    }
    renderToggle() {
      updateToggleButton(
        this.toggleBtn,
        this.state,
        this.hasUnread,
        this.config,
        this.currentNudge ? deriveLabelText(this.currentNudge) : void 0
      );
    }
    renderNudge() {
      this.nudgeContainer.innerHTML = "";
      if ((this.state === "minimized" || this.state === "signal") && this.currentNudge) {
        const payload = this.currentNudge;
        const showVoiceMute = payload.voice_enabled === true && !this.voiceManager?.isMuted;
        const nudge = renderNudgeBubble({
          config: this.config,
          message: payload.message || "",
          frictionId: payload.friction_id,
          ctaLabel: payload.cta_label,
          voiceEnabled: showVoiceMute,
          onVoiceMute: showVoiceMute ? () => {
            this.voiceManager?.mute(payload.intervention_id);
          } : void 0,
          onCtaClick: () => this.handleNudgeCtaClick(),
          onSoftDismiss: () => {
            this.voiceManager?.stopCurrent();
            this.onMicroOutcome(payload.intervention_id, "soft_dismiss");
            this.onDismiss(payload.intervention_id);
            this.currentNudge = null;
            this.state = "minimized";
            this.hasUnread = false;
            this.render();
          },
          onHardDismiss: () => {
            this.voiceManager?.stopCurrent();
            this.onMicroOutcome(payload.intervention_id, "hard_dismiss");
            this.onDismiss(payload.intervention_id);
            this.currentNudge = null;
            this.state = "minimized";
            this.hasUnread = false;
            this.render();
          },
          onFeedback: (feedback) => {
            this.voiceManager?.stopCurrent();
            this.onFeedback(payload.intervention_id, feedback);
            this.onMicroOutcome(payload.intervention_id, feedback === "helpful" ? "cta_click" : "not_helpful");
            if (feedback === "not_helpful") this.onIgnored(payload.intervention_id);
            this.currentNudge = null;
            this.state = "minimized";
            this.hasUnread = false;
            this.render();
          }
        });
        this.nudgeContainer.appendChild(nudge);
      }
    }
    renderPanelView() {
      if (this.state !== "expanded") {
        this.panelContainer.style.display = "none";
        return;
      }
      this.panelContainer.style.display = "block";
      this.panelContainer.innerHTML = "";
      const voiceMsg = [...this.messages].reverse().find((m) => m.payload?.voice_enabled === true);
      const panelVoiceEnabled = voiceMsg !== void 0 && !this.voiceManager?.isMuted;
      const panel = renderPanel({
        config: this.config,
        isMobile: this.isMobile,
        voiceEnabled: panelVoiceEnabled,
        onVoiceMute: panelVoiceEnabled && voiceMsg?.payload ? () => {
          this.voiceManager?.mute(voiceMsg.payload.intervention_id);
        } : void 0,
        onMinimize: () => {
          this.voiceManager?.stopCurrent();
          this.dismissActiveInterventions();
          this.state = "minimized";
          this.hasUnread = false;
          this.render();
        }
      });
      const leadArea = panel.querySelector("#ava-lead-area");
      if (this.isTyping) {
        leadArea.appendChild(renderLeadSkeleton());
      } else {
        const lead = [...this.messages].reverse().find((m) => m.type === "assistant" || m.type === "system");
        if (lead && lead.content) {
          const leadCard = renderLeadCard({
            config: this.config,
            frictionId: lead.payload?.friction_id,
            message: lead.content,
            ctaLabel: lead.payload?.cta_label && !lead.payload?.products?.length && !lead.payload?.comparison ? lead.payload.cta_label : void 0,
            onCtaClick: lead.payload?.cta_label ? () => {
              if (!lead.payload) return;
              this.reportedOutcomes.add(lead.id);
              this.onConvert(lead.id, lead.payload.cta_action || "cta_click");
              this.onUserAction(lead.payload.cta_action || "cta_click", lead.payload.meta);
            } : void 0,
            onFeedback: lead.payload ? (feedback) => {
              if (!lead.payload) return;
              this.onFeedback(lead.payload.intervention_id, feedback);
              this.onMicroOutcome(lead.payload.intervention_id, feedback === "helpful" ? "cta_click" : "not_helpful");
              if (feedback === "not_helpful") this.onIgnored(lead.payload.intervention_id);
              this.reportedOutcomes.add(lead.id);
            } : void 0
          });
          leadArea.appendChild(leadCard);
        }
      }
      const contentEl = panel.querySelector("#ava-panel-content");
      this.messagesContainer = contentEl;
      const hasSupporting = this.messages.some(
        (m) => m.type === "user" || m.type === "system" && m.id.startsWith("msg_") || m.payload?.products && m.payload.products.length > 0 || m.payload?.comparison
      );
      if (!hasSupporting && !this.isTyping) {
        contentEl.appendChild(renderEmptyState(this.config));
      } else {
        for (const msg of this.messages) {
          const wrapper = this.el("div");
          if (msg.content && (msg.type === "user" || msg.type === "system" && msg.id.startsWith("msg_"))) {
            const isUser = msg.type === "user";
            const bubble = this.el("div", {
              style: `max-width:85%;
              margin-left:${isUser ? "auto" : "0"};
              margin-right:${isUser ? "0" : "auto"};
              background:${isUser ? `var(--ava-primary,${this.config.brandColor})` : "#f0fdf4"};
              color:${isUser ? "#fff" : "#166534"};
              padding:${isUser ? "9px 13px" : "6px 12px"};
              border-radius:${isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px"};
              font-size:13px;line-height:1.5;
              border:${isUser ? "none" : "1px solid #bbf7d0"};
              animation:sa-fadeIn 0.2s ease-out;word-wrap:break-word;`
            });
            bubble.textContent = msg.content;
            wrapper.appendChild(bubble);
          }
          if (msg.payload?.products && msg.payload.products.length > 0) {
            const cardsWrap = this.el("div", {
              style: "display:flex;flex-direction:column;gap:8px;"
            });
            msg.payload.products.slice(0, this.config.maxCardsToShow).forEach((card, idx) => {
              const cardEl = renderProductCard({
                config: this.config,
                card,
                index: idx,
                onAddToCart: (productId) => this.handleAddToCart(
                  productId,
                  msg.payload?.action_code === "AGENT_ADD_TO_CART" ? msg.payload.meta : void 0
                ),
                onMoreLikeThis: (productId) => {
                  if (msg.payload) {
                    this.onMicroOutcome(msg.payload.intervention_id, "more_like_this");
                    this.onUserAction("more_like_this", { product_id: productId });
                  }
                }
              });
              cardsWrap.appendChild(cardEl);
            });
            wrapper.appendChild(cardsWrap);
          }
          if (msg.payload?.comparison) {
            const compEl = renderComparisonCard({
              config: this.config,
              comparison: msg.payload.comparison,
              onSelect: (productId) => {
                this.handleAddToCart(productId);
                this.reportedOutcomes.add(msg.id);
                if (msg.payload) {
                  this.onConvert(msg.payload.intervention_id, "select_comparison");
                }
              }
            });
            wrapper.appendChild(compEl);
          }
          if (wrapper.hasChildNodes()) contentEl.appendChild(wrapper);
        }
      }
      const footerEl = panel.querySelector("#ava-panel-footer");
      this.buildInputBar(footerEl);
      this.panelContainer.appendChild(panel);
    }
    // ---- HELPERS ----
    buildInputBar(container) {
      const wrap = this.el("div", {
        style: "display:flex;gap:8px;align-items:center;"
      });
      if (this.speechRecognizer) {
        this.micHandle = renderMicButton({
          onClick: () => this.handleMicClick()
        });
        wrap.appendChild(this.micHandle.element);
      }
      this.inputEl = this.el("input", {
        style: `flex:1;border:1px solid #e5e7eb;border-radius:10px;
              padding:9px 13px;font-size:13px;
              font-family:${this.config.fontFamily};
              outline:none;transition:border-color 0.2s ease;
              background:#fafafa;color:#111827;`
      });
      this.inputEl.type = "text";
      this.inputEl.placeholder = this.speechRecognizer ? "Ask or speak\u2026" : "Ask anything...";
      this.inputEl.value = this.inputValue;
      this.inputEl.addEventListener("input", (e) => {
        this.inputValue = e.target.value;
        this.updateSendButton();
      });
      this.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.handleSendMessage();
      });
      this.inputEl.addEventListener("focus", () => {
        this.inputEl.style.borderColor = `var(--ava-primary,${this.config.brandColor})`;
        this.inputEl.style.background = "#fff";
      });
      this.inputEl.addEventListener("blur", () => {
        this.inputEl.style.borderColor = "#e5e7eb";
        this.inputEl.style.background = "#fafafa";
      });
      const sendBtn = this.el("button", {
        id: "ava-send-btn",
        style: `background:${this.inputValue.trim() ? `var(--ava-primary,${this.config.brandColor})` : "#e5e7eb"};
              color:${this.inputValue.trim() ? "#fff" : "#9ca3af"};
              border:none;border-radius:10px;width:38px;height:38px;
              cursor:${this.inputValue.trim() ? "pointer" : "default"};
              display:flex;align-items:center;justify-content:center;
              font-size:16px;transition:all 0.2s ease;flex-shrink:0;`
      });
      sendBtn.textContent = "\u2191";
      sendBtn.addEventListener("click", () => this.handleSendMessage());
      wrap.appendChild(this.inputEl);
      wrap.appendChild(sendBtn);
      container.appendChild(wrap);
    }
    handleMicClick() {
      if (!this.speechRecognizer) return;
      if (this.speechRecognizer.isRecording) {
        this.speechRecognizer.stop();
      } else if (!this.speechRecognizer.isProcessing) {
        this.speechRecognizer.start().catch((err) => {
          this.micHandle?.setState("idle");
          console.warn("[AVA] Mic start failed:", err);
        });
      }
    }
    /**
     * Called when Deepgram STT returns a transcript from user speech.
     * Shows it as a user message, stops TTS playback, and sends it to the server.
     */
    handleVoiceTranscript(transcript) {
      this.voiceManager?.stopCurrent();
      this.messages.push({
        id: `msg_${Date.now()}`,
        type: "user",
        content: transcript,
        timestamp: Date.now()
      });
      this.isTyping = true;
      this.render();
      this.scrollMessages();
      this.onVoiceQuery(transcript);
    }
    handleToggleClick() {
      if (this.state === "expanded") {
        this.voiceManager?.stopCurrent();
        this.dismissActiveInterventions();
        this.state = "minimized";
        this.hasUnread = false;
      } else {
        if (this.currentNudge && !this.messages.some((m) => m.id === this.currentNudge?.intervention_id)) {
          const n = this.currentNudge;
          this.messages.push({
            id: n.intervention_id,
            type: "assistant",
            content: n.message || "",
            payload: n,
            timestamp: Date.now()
          });
        }
        this.state = "expanded";
        this.currentNudge = null;
        this.hasUnread = false;
        if (this.signalCollapseTimeout) clearTimeout(this.signalCollapseTimeout);
        if (this.messages.length === 0) {
          this.messages.push({
            id: "ava_welcome",
            type: "assistant",
            content: "Hi, I am AVA. I am here to assist you with your shopping today. Just tap on me and let me know how can I help you.",
            timestamp: Date.now()
          });
        }
      }
      this.render();
    }
    handleNudgeCtaClick() {
      if (!this.currentNudge) return;
      const payload = this.currentNudge;
      this.onConvert(payload.intervention_id, payload.cta_action || "open");
      this.onUserAction(payload.cta_action || "open", payload.meta);
      if (payload.cta_action === "open_assistant" || payload.cta_action === "open_guided_search" || !payload.cta_action) {
        this.state = "expanded";
        if (!this.messages.some((m) => m.id === payload.intervention_id)) {
          this.messages.push({
            id: payload.intervention_id,
            type: "assistant",
            content: payload.message || "",
            payload,
            timestamp: Date.now()
          });
        }
      }
      this.currentNudge = null;
      if (this.signalCollapseTimeout) clearTimeout(this.signalCollapseTimeout);
      this.render();
    }
    handleAddToCart(productId, meta) {
      if (meta) {
        this.tryClickStoreAddToCart(productId, meta.addToCartSelector);
      }
      this.onUserAction("add_to_cart", { product_id: productId });
      this.messages.push({
        id: `msg_${Date.now()}`,
        type: "system",
        content: "\u2713 Added to cart",
        timestamp: Date.now()
      });
      this.render();
      this.scrollMessages();
    }
    /**
     * Locate and click the host store's add-to-cart button after shopper confirmation.
     * Tries the verified selector from onboarding first, then common heuristics.
     * Silent on failure — cart action is best-effort; shopper can always click manually.
     */
    tryClickStoreAddToCart(productId, verifiedSelector) {
      if (verifiedSelector) {
        const el = document.querySelector(verifiedSelector);
        if (el) {
          el.click();
          return;
        }
      }
      const productContainers = [
        `[data-product-id="${productId}"]`,
        `[data-product="${productId}"]`,
        `[data-id="${productId}"]`
      ];
      for (const containerSel of productContainers) {
        const container = document.querySelector(containerSel);
        if (container) {
          const btn = container.querySelector("button[type='submit'], [data-action='add-to-cart'], .add-to-cart");
          if (btn) {
            btn.click();
            return;
          }
        }
      }
      const heuristics = [
        "[data-action='add-to-cart']",
        "button[name='add']",
        "form[action*='/cart'] button[type='submit']",
        ".add-to-cart",
        "#AddToCart",
        ".btn-add-to-cart",
        "[data-add-to-cart]"
      ];
      for (const sel of heuristics) {
        const el = document.querySelector(sel);
        if (el) {
          el.click();
          return;
        }
      }
    }
    handleSendMessage() {
      if (!this.inputValue.trim()) return;
      this.messages.push({
        id: `msg_${Date.now()}`,
        type: "user",
        content: this.inputValue.trim(),
        timestamp: Date.now()
      });
      this.onUserMessage(this.inputValue.trim());
      this.inputValue = "";
      this.isTyping = true;
      this.render();
      this.scrollMessages();
    }
    dismissActiveInterventions() {
      for (const msg of this.messages) {
        if (msg.payload && (msg.type === "assistant" || msg.type === "system") && !this.reportedOutcomes.has(msg.payload.intervention_id)) {
          this.reportedOutcomes.add(msg.payload.intervention_id);
          this.onDismiss(msg.payload.intervention_id);
        }
      }
    }
    updateSendButton() {
      const sendBtn = this.shadow.getElementById(
        "ava-send-btn"
      );
      if (sendBtn) {
        sendBtn.style.background = this.inputValue.trim() ? `var(--ava-primary,${this.config.brandColor})` : "#e5e7eb";
        sendBtn.style.color = this.inputValue.trim() ? "#fff" : "#9ca3af";
        sendBtn.style.cursor = this.inputValue.trim() ? "pointer" : "default";
      }
    }
    scrollMessages() {
      if (this.messagesContainer) {
        requestAnimationFrame(() => {
          this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        });
      }
    }
    /**
     * Apply CSS custom property overrides to the shadow host.
     * Host sites can pass cssVars in config to theme AVA without touching brand colors.
     */
    applyCSSVars() {
      const host = this.shadow.host;
      host.style.setProperty("--ava-primary", this.config.brandColor);
      host.style.setProperty("--ava-primary-light", this.config.brandColorLight ?? this.config.brandColor);
      host.style.setProperty("--ava-accent", this.config.accentColor ?? this.config.brandColor);
      host.style.setProperty("--ava-font", this.config.fontFamily);
      host.style.setProperty("--ava-radius", "18px");
      const vars = this.config.cssVars;
      if (!vars) return;
      if (vars.primaryColor) {
        host.style.setProperty("--ava-primary", vars.primaryColor);
        host.style.setProperty("--ava-primary-light", vars.primaryColor);
        host.style.setProperty("--ava-accent", vars.primaryColor);
      }
      if (vars.fontFamily) host.style.setProperty("--ava-font", vars.fontFamily);
      if (vars.borderRadius) host.style.setProperty("--ava-radius", vars.borderRadius);
    }
    // ---- DOM HELPER ----
    el(tag, attrs) {
      const element = document.createElement(tag);
      if (attrs) {
        for (const [key, value] of Object.entries(attrs)) {
          element.setAttribute(key, value);
        }
      }
      return element;
    }
  };

  // src/config.ts
  var DEFAULT_CONFIG = {
    position: "bottom-right",
    brandColor: "#1A1A2E",
    brandColorLight: "#16213E",
    accentColor: "#E94560",
    fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
    websocketUrl: "wss://ava-server.localhost/ws/assistant",
    sessionId: "",
    userId: null,
    zIndex: 99999,
    assistantName: "AVA",
    maxCardsToShow: 3,
    animationDuration: 300,
    voiceEnabled: false,
    voiceMaxPerSession: 3,
    deepgramModel: "aura-asteria-en",
    voiceAutoPlay: true
  };

  // src/tracker/ws-transport.ts
  var FISMBridge = class {
    ws = null;
    url;
    sessionId;
    listeners = /* @__PURE__ */ new Map();
    reconnectAttempts = 0;
    maxReconnectAttempts = 5;
    reconnectDelay = 1e3;
    messageQueue = [];
    constructor(url, sessionId) {
      this.url = url;
      this.sessionId = sessionId;
    }
    connect() {
      try {
        this.ws = new WebSocket(`${this.url}?channel=widget&sessionId=${this.sessionId}`);
        this.ws.onopen = () => {
          console.log("[AVA] Connected to server");
          this.reconnectAttempts = 0;
          this.messageQueue.forEach((msg) => this.ws?.send(JSON.stringify(msg)));
          this.messageQueue = [];
          this.emit("connected", {});
        };
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.emit(data.type, data.payload ?? data);
          } catch (e) {
            console.error("[AVA] Failed to parse message:", e);
          }
        };
        this.ws.onclose = () => {
          console.log("[AVA] Disconnected");
          this.emit("disconnected", {});
          this.attemptReconnect();
        };
        this.ws.onerror = (error) => {
          console.error("[AVA] WebSocket error:", error);
        };
      } catch (e) {
        console.error("[AVA] Connection failed:", e);
        this.attemptReconnect();
      }
    }
    attemptReconnect() {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
      this.reconnectAttempts++;
      console.log(`[AVA] Reconnecting in ${this.reconnectDelay * this.reconnectAttempts}ms...`);
      setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
    }
    send(type, payload) {
      const msg = { type, payload, session_id: this.sessionId, timestamp: Date.now() };
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      } else {
        this.messageQueue.push(msg);
      }
    }
    /**
     * Send a behavioral event formatted for the server's "track" Zod schema.
     * Server expects: { type: "track", event: {...}, visitorKey, siteUrl, ... }
     */
    sendTrackEvent(event) {
      const w = typeof window !== "undefined" ? window : void 0;
      const msg = {
        type: "track",
        visitorKey: this.sessionId,
        sessionKey: this.sessionId,
        siteUrl: w?.location?.origin ?? "",
        deviceType: !w ? "desktop" : w.innerWidth < 768 ? "mobile" : w.innerWidth < 1024 ? "tablet" : "desktop",
        referrerType: "direct",
        isLoggedIn: false,
        isRepeatVisitor: false,
        event
      };
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      } else {
        this.messageQueue.push(msg);
      }
    }
    on(event, callback) {
      if (!this.listeners.has(event)) this.listeners.set(event, /* @__PURE__ */ new Set());
      this.listeners.get(event).add(callback);
      return () => this.listeners.get(event)?.delete(callback);
    }
    emit(event, data) {
      this.listeners.get(event)?.forEach((cb) => cb(data));
    }
    /**
     * Send an intervention outcome in the flat format the server expects.
     * Server schema: { type: "intervention_outcome", intervention_id, session_id, status, timestamp, conversion_action? }
     */
    sendOutcome(interventionId, status, conversionAction) {
      const msg = {
        type: "intervention_outcome",
        intervention_id: interventionId,
        session_id: this.sessionId,
        status,
        timestamp: Date.now()
      };
      if (conversionAction) msg.conversion_action = conversionAction;
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      } else {
        this.messageQueue.push(msg);
      }
    }
    /**
     * Send intervention feedback (thumbs up/down) to the server.
     * Server schema: { type: "intervention_feedback", intervention_id, session_id, feedback, timestamp }
     */
    sendFeedback(interventionId, feedback) {
      const msg = {
        type: "intervention_feedback",
        intervention_id: interventionId,
        session_id: this.sessionId,
        feedback,
        timestamp: Date.now()
      };
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      } else {
        this.messageQueue.push(msg);
      }
    }
    /**
     * Send a voice query (transcript from ASR or text input) to the server.
     * Includes optional page context so the server can give more relevant replies.
     * Server schema: { type: "voice_query", session_id, transcript, timestamp, page_context? }
     */
    sendVoiceQuery(transcript, pageContext) {
      const w = typeof window !== "undefined" ? window : void 0;
      const msg = {
        type: "voice_query",
        session_id: this.sessionId,
        transcript,
        timestamp: Date.now(),
        page_context: {
          page_url: pageContext?.page_url ?? w?.location?.href,
          ...pageContext?.page_type ? { page_type: pageContext.page_type } : {}
        }
      };
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      } else {
        this.messageQueue.push(msg);
      }
    }
    disconnect() {
      this.ws?.close();
      this.listeners.clear();
    }
  };

  // src/tracker/collector.ts
  var BehaviorCollector = class {
    bridge;
    observers = [];
    timers = [];
    scrollDepth = 0;
    pageEnterTime = Date.now();
    rageClickTracker = { count: 0, lastTime: 0, lastX: 0, lastY: 0 };
    scrollMilestones = /* @__PURE__ */ new Set();
    scrollBackFired = false;
    lastCartActionAt = 0;
    lastProductModalId = null;
    productModalOpenedAt = 0;
    sizeGuideOpenedAt = 0;
    _sizeGuideCloseFired = false;
    sequenceNumber = 0;
    constructor(bridge, _sessionId, _userId) {
      this.bridge = bridge;
    }
    /**
     * Extract the current (discounted) price from a price element.
     * When a product is on sale the store renders both prices inside one element:
     *   <span id="modal-price">
     *     <span class="text-red-600">$94.00</span>
     *     <span class="line-through">$110.00</span>
     *   </span>
     * Using `textContent` naïvely produces "$94.00$110.00".
     * This helper clones the element, strips any line-through children, then
     * returns the remaining trimmed text — which is always the current price.
     */
    extractCurrentPrice(el) {
      const clone = el.cloneNode(true);
      clone.querySelectorAll("[class*='line-through']").forEach((s) => s.remove());
      return clone.textContent?.trim() ?? "";
    }
    startCollecting() {
      this.emitPageView();
      this.trackProductViews();
      this.trackClicks();
      this.trackSort();
      this.trackScrollDepth();
      this.trackRageClicks();
      this.trackHoverIntent();
      this.trackFormFriction();
      this.trackCopyEvents();
      this.trackExitIntent();
      this.trackIdleTime();
      this.trackPageVisibility();
      this.trackSearch();
    }
    // ── Helpers ──────────────────────────────────────────────────
    /** Build a standard track event payload and send it. */
    send(category, eventType, signals, frictionId = null) {
      this.sequenceNumber++;
      this.bridge.sendTrackEvent({
        event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        friction_id: frictionId,
        category,
        event_type: eventType,
        raw_signals: { ...signals, session_sequence_number: this.sequenceNumber },
        page_context: {
          page_type: this.detectPageType(),
          page_url: window.location.href,
          time_on_page_ms: Date.now() - this.pageEnterTime,
          scroll_depth_pct: this.scrollDepth,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          device: this.detectDevice()
        },
        timestamp: Date.now()
      });
    }
    /** Extract product context from the nearest product card or modal. */
    extractProductContext(el) {
      const card = el.closest(".product-card, [data-id]");
      if (card) {
        const name = card.querySelector("h3")?.textContent?.trim() || card.querySelector("[class*='product-name']")?.textContent?.trim();
        const price = card.querySelector("[data-analyze='price'], .price-tag")?.textContent?.trim();
        const category = card.querySelector("[class*='text-amber']")?.textContent?.trim() || card.querySelector(".category")?.textContent?.trim();
        return {
          product_id: card.dataset.id || null,
          product_name: name || null,
          product_price: price || null,
          product_category: category || null,
          source: "product_card"
        };
      }
      const modal = el.closest("#product-modal") || document.getElementById("product-modal");
      if (modal && !modal.classList.contains("hidden")) {
        const name = modal.querySelector("#modal-title")?.textContent?.trim() || modal.querySelector("h2")?.textContent?.trim();
        const modalPriceEl = modal.querySelector("#modal-price");
        const price = modalPriceEl ? this.extractCurrentPrice(modalPriceEl) : modal.querySelector("[data-analyze='price'], .price-tag")?.textContent?.trim();
        const category = modal.querySelector("#modal-category")?.textContent?.trim();
        return {
          product_name: name || null,
          product_price: price || null,
          product_category: category || null,
          source: "product_modal"
        };
      }
      return null;
    }
    /** Extract meaningful text from an element */
    getElementLabel(el) {
      return el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent?.trim().slice(0, 80) || el.tagName;
    }
    // ── Page View ────────────────────────────────────────────────
    emitPageView() {
      this.send("navigation", "page_view", {
        referrer: document.referrer || "direct",
        previous_page_url: document.referrer || void 0,
        page_title: document.title
      });
    }
    // ── Product Detail View (modal open detection) ───────────────
    trackProductViews() {
      const modal = document.getElementById("product-modal");
      if (!modal) return;
      const observer = new MutationObserver(() => {
        if (!modal.classList.contains("hidden")) {
          setTimeout(() => {
            const name = modal.querySelector("h2")?.textContent?.trim();
            const modalPriceEl = modal.querySelector("#modal-price");
            const price = modalPriceEl ? this.extractCurrentPrice(modalPriceEl) : modal.querySelector("[data-analyze='price'], .price-tag")?.textContent?.trim() || modal.querySelector(".font-bold.text-2xl, .font-bold.text-xl")?.textContent?.trim();
            const category = modal.querySelector("[class*='text-amber']")?.textContent?.trim();
            const productKey = name || "";
            if (productKey && productKey !== this.lastProductModalId) {
              this.lastProductModalId = productKey;
              this.productModalOpenedAt = Date.now();
              this.send("product", "product_detail_view", {
                product_name: name || "Unknown",
                product_price: price || "N/A",
                product_category: category || "unknown"
              });
            }
          }, 100);
        } else {
          if (this.lastProductModalId) {
            const viewDurationMs = Date.now() - this.productModalOpenedAt;
            this.send("product", "product_detail_close", {
              product_name: this.lastProductModalId,
              view_duration_ms: viewDurationMs
            });
          }
          this.lastProductModalId = null;
          this.productModalOpenedAt = 0;
        }
      });
      observer.observe(modal, { attributes: true, attributeFilter: ["class"] });
      this.observers.push(observer);
    }
    // ── Click Tracking (rich context) ────────────────────────────
    trackClicks() {
      document.addEventListener("click", (e) => {
        const target = e.target;
        const sizeGuidePopup = document.getElementById("size-guide-popup");
        if (sizeGuidePopup && target.closest("#size-guide-popup button")) {
          const viewDuration = this.sizeGuideOpenedAt ? Date.now() - this.sizeGuideOpenedAt : 0;
          this.send("product", "size_guide_close", {
            view_duration_ms: viewDuration,
            view_duration_s: Math.round(viewDuration / 1e3)
          });
          this.sizeGuideOpenedAt = 0;
          this._sizeGuideCloseFired = true;
        }
        if (target.closest("#wishlist-btn")) {
          const dropdown = document.getElementById("wishlist-dropdown");
          const isOpening = dropdown?.classList.contains("hidden") ?? true;
          if (isOpening) {
            let count = 0;
            try {
              const wState = window.wishlistState;
              if (wState) {
                count = Array.from(wState.values()).filter(Boolean).length;
              } else {
                const saved = localStorage.getItem("wishlist");
                if (saved) {
                  const entries = JSON.parse(saved);
                  count = entries.filter(([, active]) => active).length;
                }
              }
            } catch {
            }
            this.send("engagement", "wishlist_view", { item_count: count });
          }
        }
        const wishlistRemoveBtn = target.closest(
          "#wishlist-items button[title='Remove from wishlist']"
        );
        if (wishlistRemoveBtn) {
          const row = wishlistRemoveBtn.closest("div.flex");
          const name = row?.querySelector(".font-bold")?.textContent?.trim() || null;
          const price = row?.querySelector(".text-gray-400")?.textContent?.trim() || null;
          this.send("product", "wishlist_remove", {
            product_name: name,
            product_price: price,
            source: "wishlist_dropdown"
          });
        }
        const filterBtn = target.closest(".filter-btn");
        if (filterBtn) {
          const filterType = filterBtn.dataset.filterType || (filterBtn.dataset.filter === "sale" ? "sale" : "price");
          const filterVal = filterBtn.dataset.filter;
          const filterLabel = filterBtn.textContent?.trim();
          if (filterVal) {
            this.send("navigation", "filter_applied", {
              filter_type: filterType,
              filter_value: filterVal,
              filter_label: filterLabel
            });
          }
        }
      }, { capture: true });
      document.addEventListener("click", (e) => {
        const target = e.target;
        if (this._sizeGuideCloseFired) {
          this._sizeGuideCloseFired = false;
          return;
        }
        if (target.closest("#color-filter-btn") || target.closest("#size-filter-btn")) {
          return;
        }
        const atcButton = target.closest("[data-action='add-to-cart'], .add-to-cart") || target.closest("#modal-add-cart");
        const isAtcByText = !atcButton && target.closest("button")?.textContent?.toLowerCase().includes("add to cart");
        if (atcButton || isAtcByText) {
          const product = this.extractProductContext(target);
          const qtyEl = document.getElementById("modal-qty");
          const qty = parseInt(qtyEl?.textContent?.trim() || "1");
          this.lastCartActionAt = Date.now();
          this.send("cart", "add_to_cart", {
            ...product,
            quantity: qty,
            button_text: "Add to Cart"
          });
          return;
        }
        const quickAdd = target.closest(".btn-add[data-id]");
        if (quickAdd) {
          const product = this.extractProductContext(target);
          this.lastCartActionAt = Date.now();
          this.send("cart", "quick_add", {
            product_id: quickAdd.dataset.id,
            ...product
          });
          return;
        }
        const productTrigger = target.closest(".product-trigger");
        if (productTrigger) {
          return;
        }
        const cartCountEl = document.getElementById("cart-count");
        if (cartCountEl) {
          const cartBtn = cartCountEl.closest("button, a");
          if (cartBtn && (cartBtn === target || cartBtn.contains(target))) {
            const count = cartCountEl.textContent?.trim() || "0";
            const totalEl = document.getElementById("cart-total");
            const total = totalEl?.textContent?.trim() || "$0.00";
            this.send("cart", "cart_view", {
              cart_count: count,
              cart_total: total
            });
            return;
          }
        }
        const topNavBtn = target.closest(".nav-link");
        if (topNavBtn) {
          const label = topNavBtn.textContent?.trim();
          if (label) {
            this.send("navigation", "category_browse", {
              category: label,
              gender: label.toLowerCase(),
              level: "top"
            });
            return;
          }
        }
        const navCategory = target.closest(".nav-category, .nav-menu-action, [data-cat]");
        if (navCategory) {
          const gender = navCategory.getAttribute("data-gender");
          const label = navCategory.getAttribute("data-label") || navCategory.textContent?.trim();
          const catType = navCategory.getAttribute("data-cat");
          const genderPart = gender ? gender.charAt(0).toUpperCase() + gender.slice(1) : "";
          const category = [genderPart, label].filter(Boolean).join(": ");
          this.send("navigation", "category_browse", {
            category,
            gender: gender || null,
            sub_category: label || null,
            cat_type: catType || null,
            level: "sub"
          });
          return;
        }
        const navLink = target.closest("[data-nav], nav a");
        if (navLink) {
          this.send("navigation", "nav_click", {
            link_text: navLink.textContent?.trim(),
            href: navLink.href || null
          });
          return;
        }
        const colorOption = target.closest(".color-option, [data-color]");
        if (colorOption) {
          const product = this.extractProductContext(target);
          this.send("product", "color_select", {
            color: colorOption.getAttribute("data-color") || colorOption.getAttribute("title") || "unknown",
            ...product
          });
          return;
        }
        const sizeOption = target.closest(".size-option, [data-size]");
        if (sizeOption) {
          const product = this.extractProductContext(target);
          this.send("product", "size_select", {
            size: sizeOption.textContent?.trim() || sizeOption.getAttribute("data-size"),
            ...product
          });
          return;
        }
        if (target.id === "modal-read-more" || target.closest("#modal-read-more")) {
          const desc = document.getElementById("modal-desc");
          const justExpanded = !desc?.classList.contains("line-clamp-4");
          const product = this.extractProductContext(target);
          this.send("product", "description_toggle", {
            action: justExpanded ? "expanded" : "collapsed",
            ...product
          });
          return;
        }
        if (target.closest("#modal-wishlist-btn")) {
          const product = this.extractProductContext(target);
          const wishlistBtn = document.getElementById("modal-wishlist-btn");
          const justAdded = wishlistBtn?.classList.contains("bg-amber-500/10") ?? false;
          this.send("product", justAdded ? "wishlist_add" : "wishlist_remove", {
            ...product
          });
          return;
        }
        if (target.closest("#btn-size-guide")) {
          this.sizeGuideOpenedAt = Date.now();
          const product = this.extractProductContext(target);
          this.send("product", "size_guide_open", { ...product });
          return;
        }
        const btnText = target.textContent?.trim();
        if (target.tagName === "BUTTON" && (btnText === "+" || btnText === "-")) {
          const product = this.extractProductContext(target);
          const qtyEl = document.getElementById("modal-qty");
          const newQty = parseInt(qtyEl?.textContent?.trim() || "1");
          this.send("cart", "quantity_change", {
            direction: btnText === "+" ? "increase" : "decrease",
            current_qty: newQty,
            ...product
          });
          return;
        }
        const modal = document.getElementById("product-modal");
        if (modal && !modal.classList.contains("hidden") && target.closest("button, [role='tab']")) {
          const text = target.textContent?.trim();
          if (text && ["Details", "Returns", "Reviews"].includes(text)) {
            const product = this.extractProductContext(target);
            this.send("product", "tab_view", {
              tab_name: text,
              ...product
            });
            return;
          }
        }
        if (target.closest("#cart-count, .cart-icon, [data-cart]")) {
          this.send("cart", "cart_icon_click", {
            cart_count: document.getElementById("cart-count")?.textContent?.trim() || "0"
          });
          return;
        }
        const interactive = target.closest("a, button");
        if (interactive) {
          const product = this.extractProductContext(target);
          const label = this.getElementLabel(interactive);
          if (label.length <= 1 && !product) return;
          const vw = window.innerWidth || 1;
          const vh = window.innerHeight || 1;
          this.send("engagement", "click", {
            element: interactive.tagName,
            text: label,
            x_pct: Math.round(e.clientX / vw * 1e3) / 1e3,
            y_pct: Math.round(e.clientY / vh * 1e3) / 1e3,
            client_x: e.clientX,
            client_y: e.clientY,
            viewport_width: vw,
            viewport_height: vh,
            ...product
          });
        }
      });
    }
    // ── Search ───────────────────────────────────────────────────
    trackSearch() {
      const searchInput = document.getElementById("store-search");
      if (!searchInput) return;
      let debounce = null;
      searchInput.addEventListener("input", () => {
        if (debounce) clearTimeout(debounce);
        debounce = window.setTimeout(() => {
          const query = searchInput.value.trim();
          if (query.length >= 2) {
            this.send("search", "search_query", {
              query,
              query_length: query.length
            });
          }
        }, 800);
      });
    }
    // ── Sort ─────────────────────────────────────────────────────
    trackSort() {
      const sortSelect = document.getElementById("sort-select");
      if (!sortSelect) return;
      sortSelect.addEventListener("change", () => {
        const selectedOption = sortSelect.options[sortSelect.selectedIndex];
        this.send("navigation", "sort_change", {
          sort_value: sortSelect.value,
          sort_name: selectedOption?.text || sortSelect.value
        });
      });
    }
    // ── Scroll Depth ─────────────────────────────────────────────
    trackScrollDepth() {
      if (this.detectPageType() === "checkout") return;
      const handler = () => {
        const docHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        );
        const scrolled = window.scrollY + window.innerHeight;
        const depth = Math.round(scrolled / docHeight * 100);
        this.scrollDepth = Math.max(this.scrollDepth, depth);
        for (const m of [25, 50, 75, 100]) {
          if (depth >= m && !this.scrollMilestones.has(m)) {
            this.scrollMilestones.add(m);
            this.send("navigation", "scroll_depth", { depth_pct: m });
          }
        }
        if (depth >= 95 && !this.scrollMilestones.has(95)) {
          const clicks = parseInt(sessionStorage.getItem("sa_click_count") || "0");
          if (clicks === 0) {
            this.scrollMilestones.add(95);
            this.send("navigation", "scroll_without_click", { scroll_depth: depth, click_count: 0 }, "F015");
          }
        }
        if (!this.scrollBackFired && this.scrollDepth >= 50 && depth <= 15) {
          this.scrollBackFired = true;
          this.send("navigation", "scroll_back_to_top", {
            peak_depth_pct: this.scrollDepth,
            current_depth_pct: depth
          });
        }
        if (depth >= 50) this.scrollBackFired = false;
        if (this.lastCartActionAt > 0 && Date.now() - this.lastCartActionAt < 6e4 && this.scrollDepth - depth >= 30) {
          this.lastCartActionAt = 0;
          this.send("navigation", "scroll_back_after_cart", {
            peak_depth_pct: this.scrollDepth,
            current_depth_pct: depth
          });
        }
      };
      window.addEventListener("scroll", handler, { passive: true });
    }
    // ── Rage Clicks ──────────────────────────────────────────────
    trackRageClicks() {
      document.addEventListener("click", (e) => {
        const now = Date.now();
        const dx = Math.abs(e.clientX - this.rageClickTracker.lastX);
        const dy = Math.abs(e.clientY - this.rageClickTracker.lastY);
        if (now - this.rageClickTracker.lastTime < 500 && dx < 30 && dy < 30) {
          this.rageClickTracker.count++;
          if (this.rageClickTracker.count >= 3) {
            const target = e.target;
            const product = this.extractProductContext(target);
            this.send("technical", "rage_click", {
              target_element: target.tagName,
              target_text: target.textContent?.trim().slice(0, 50),
              click_count: this.rageClickTracker.count,
              ...product
            }, "F400");
            this.rageClickTracker.count = 0;
          }
        } else {
          this.rageClickTracker.count = 1;
        }
        this.rageClickTracker.lastTime = now;
        this.rageClickTracker.lastX = e.clientX;
        this.rageClickTracker.lastY = e.clientY;
        const count = parseInt(sessionStorage.getItem("sa_click_count") || "0");
        sessionStorage.setItem("sa_click_count", String(count + 1));
      });
    }
    // ── Hover Intent ─────────────────────────────────────────────
    trackHoverIntent() {
      let hoverTimer = null;
      document.addEventListener("mouseover", (e) => {
        const target = e.target;
        const isATC = target.closest("[data-action='add-to-cart']") || target.closest(".add-to-cart") || target.tagName === "BUTTON" && target.textContent?.trim().toLowerCase() === "add to cart";
        if (isATC) {
          hoverTimer = window.setTimeout(() => {
            const product = this.extractProductContext(target);
            this.send("product", "hover_add_to_cart", {
              hover_duration_ms: 3e3,
              ...product
            }, "F058");
          }, 3e3);
        }
      });
      document.addEventListener("mouseout", () => {
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }
      });
    }
    // ── Form Friction ────────────────────────────────────────────
    trackFormFriction() {
      let fieldErrorCount = 0;
      document.addEventListener("invalid", (e) => {
        fieldErrorCount++;
        if (fieldErrorCount >= 2) {
          this.send("checkout", "form_validation_error", {
            error_count: fieldErrorCount,
            field_name: e.target?.name
          }, "F091");
        }
      }, true);
      document.addEventListener("focusin", (e) => {
        const target = e.target;
        if (target.tagName === "INPUT" && target.type !== "hidden") {
          target.dataset.saFocusTime = String(Date.now());
        }
      });
      document.addEventListener("focusout", (e) => {
        const target = e.target;
        if (target.dataset.saFocusTime) {
          const duration = Date.now() - parseInt(target.dataset.saFocusTime);
          if (duration > 3e4 && (target.name?.includes("card") || target.name?.includes("payment"))) {
            this.send("checkout", "payment_hesitation", {
              field_name: target.name,
              hesitation_ms: duration
            }, "F094");
          }
        }
      });
    }
    // ── Copy Events ──────────────────────────────────────────────
    trackCopyEvents() {
      document.addEventListener("copy", () => {
        const selection = window.getSelection()?.toString() || "";
        if (/\$[\d,.]+/.test(selection)) {
          this.send("product", "copy_price", { copied_text: selection.slice(0, 50) }, "F060");
        } else if (selection.length > 3) {
          this.send("engagement", "copy_text", { copied_text: selection.slice(0, 80) });
        }
      });
    }
    // ── Exit Intent ──────────────────────────────────────────────
    trackExitIntent() {
      document.addEventListener("mouseout", (e) => {
        if (e.clientY <= 0 && e.relatedTarget === null) {
          const cartValue = parseFloat(sessionStorage.getItem("sa_cart_value") || "0");
          if (cartValue > 0) {
            this.send("cart", "exit_intent_with_cart", { cart_value: cartValue }, "F068");
          }
        }
      });
    }
    // ── Idle Time ────────────────────────────────────────────────
    trackIdleTime() {
      let idleTimer;
      const resetIdle = () => {
        clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => {
          const cartItems = parseInt(sessionStorage.getItem("sa_cart_items") || "0");
          if (cartItems > 0) {
            this.send("cart", "idle_with_cart", { idle_ms: 3e5, cart_items: cartItems }, "F069");
          }
        }, 3e5);
      };
      ["mousemove", "keydown", "scroll", "touchstart"].forEach((evt) => {
        document.addEventListener(evt, resetIdle, { passive: true });
      });
      resetIdle();
    }
    // ── Page Visibility ──────────────────────────────────────────
    trackPageVisibility() {
      let hiddenAt = null;
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          hiddenAt = Date.now();
        } else if (hiddenAt) {
          const away = Date.now() - hiddenAt;
          if (away > 6e4) {
            this.send("engagement", "tab_return", { away_duration_ms: away });
          }
          hiddenAt = null;
        }
      });
    }
    // ── Utility ──────────────────────────────────────────────────
    detectPageType() {
      const path = window.location.pathname.toLowerCase();
      if (path === "/" || path === "/home") return "landing";
      if (path.includes("/category") || path.includes("/collection")) return "category";
      if (path.includes("/search")) return "search_results";
      if (path.includes("/product") || path.includes("/item") || path.includes("/p/")) return "pdp";
      if (path.includes("/cart") || path.includes("/bag")) return "cart";
      if (path.includes("/checkout")) return "checkout";
      if (path.includes("/account") || path.includes("/profile")) return "account";
      return "other";
    }
    detectDevice() {
      const w = window.innerWidth;
      if (w < 768) return "mobile";
      if (w < 1024) return "tablet";
      return "desktop";
    }
    stopCollecting() {
      this.observers.forEach((o) => o.disconnect());
      this.timers.forEach((t) => clearTimeout(t));
    }
  };

  // src/tracker/address-autofill.ts
  var SERVER_BASE = window.__AVA_CONFIG__?.serverUrl ?? "";
  var FIELD_SELECTORS = {
    addressLine1: [
      'input[name="checkout[shipping_address][address1]"]',
      'input[name="billing_address_1"]',
      'input[name="billing[address_line1]"]',
      'input[autocomplete="address-line1"]',
      'input[name*="address1"]',
      'input[name*="address_line_1"]',
      'input[id*="address1"]',
      'input[placeholder*="Address"]'
    ],
    addressLine2: [
      'input[name="checkout[shipping_address][address2]"]',
      'input[name="billing_address_2"]',
      'input[autocomplete="address-line2"]',
      'input[name*="address2"]',
      'input[name*="address_line_2"]',
      'input[id*="address2"]',
      'input[placeholder*="Apartment"]'
    ],
    city: [
      'input[name="checkout[shipping_address][city]"]',
      'input[name="billing_city"]',
      'input[autocomplete="address-level2"]',
      'input[name*="city"]',
      'input[id*="city"]',
      'input[placeholder*="City"]'
    ],
    state: [
      'select[name="checkout[shipping_address][province]"]',
      'select[name="billing_state"]',
      'select[autocomplete="address-level1"]',
      'input[autocomplete="address-level1"]',
      'select[name*="state"]',
      'select[name*="province"]',
      'input[name*="state"]',
      'input[id*="state"]'
    ],
    postalCode: [
      'input[name="checkout[shipping_address][zip]"]',
      'input[name="billing_postcode"]',
      'input[autocomplete="postal-code"]',
      'input[name*="zip"]',
      'input[name*="postal"]',
      'input[id*="zip"]',
      'input[id*="postal"]',
      'input[placeholder*="ZIP"]',
      'input[placeholder*="Postal"]'
    ],
    country: [
      'select[name="checkout[shipping_address][country]"]',
      'select[name="billing_country"]',
      'select[autocomplete="country"]',
      'select[name*="country"]',
      'input[autocomplete="country"]'
    ]
  };
  function findField(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && !el.disabled && el.closest("form")) return el;
    }
    return null;
  }
  function setFieldValue(el, value) {
    const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    const nativeSelectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
    if (el instanceof HTMLSelectElement) {
      nativeSelectSetter?.call(el, value);
    } else {
      nativeInputSetter?.call(el, value);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function findCheckoutForm() {
    const candidates = Array.from(document.querySelectorAll("form"));
    for (const form of candidates) {
      const attr = `${form.id} ${form.name} ${form.action}`.toLowerCase();
      if (attr.includes("checkout") || attr.includes("billing") || attr.includes("shipping")) return form;
    }
    return candidates.map((f) => ({
      form: f,
      score: [
        'input[autocomplete="address-line1"]',
        'input[name*="address"]',
        'input[autocomplete="postal-code"]',
        'input[name*="zip"]',
        'input[name*="city"]'
      ].filter((s) => f.querySelector(s)).length
    })).sort((a, b) => b.score - a.score).find(({ score }) => score >= 2)?.form ?? null;
  }
  async function fetchSavedAddress(visitorKey, siteUrl) {
    try {
      const resp = await fetch(
        `${SERVER_BASE}/api/address?visitorKey=${encodeURIComponent(visitorKey)}&siteUrl=${encodeURIComponent(siteUrl)}`
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.address;
    } catch {
      return null;
    }
  }
  async function persistAddress(visitorKey, siteUrl, addr) {
    try {
      await fetch(`${SERVER_BASE}/api/address`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorKey, siteUrl, ...addr })
      });
    } catch {
    }
  }
  function autofillCheckout(saved) {
    let filled = 0;
    for (const [field, selectors] of Object.entries(FIELD_SELECTORS)) {
      const value = saved[field];
      if (!value) continue;
      const el = findField(selectors);
      if (!el) continue;
      if (el.value && el.value.trim()) continue;
      setFieldValue(el, value);
      filled++;
    }
    return filled > 0;
  }
  function captureFromForm() {
    const addr = {};
    for (const [field, selectors] of Object.entries(FIELD_SELECTORS)) {
      const el = findField(selectors);
      if (el?.value?.trim()) {
        addr[field] = el.value.trim();
      }
    }
    if (!addr.addressLine1 || !addr.city || !addr.postalCode) return null;
    return addr;
  }
  var _offerEl = null;
  function showOfferBanner(onAccept, onDecline) {
    if (_offerEl) return;
    const banner = document.createElement("div");
    banner.setAttribute("data-ava-autofill-offer", "1");
    banner.style.cssText = [
      "position:fixed",
      "bottom:80px",
      "right:20px",
      "z-index:2147483647",
      "background:#0d1f27",
      "border:1px solid rgba(232,155,59,0.5)",
      "border-radius:8px",
      "padding:12px 16px",
      "max-width:280px",
      "font-family:system-ui,sans-serif",
      "box-shadow:0 4px 16px rgba(0,0,0,0.4)"
    ].join(";");
    banner.innerHTML = `
    <div style="font-size:12px;color:#e89b3b;font-weight:700;margin-bottom:6px;">AVA</div>
    <div style="font-size:11px;color:#ccc;line-height:1.4;margin-bottom:10px;">
      Want me to fill in your shipping address from last time?
    </div>
    <div style="display:flex;gap:8px;">
      <button data-ava-accept style="flex:1;background:#e89b3b;color:#000;border:none;
        border-radius:4px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;">
        Yes, fill it in
      </button>
      <button data-ava-decline style="flex:1;background:transparent;color:#888;
        border:1px solid #333;border-radius:4px;padding:6px 10px;font-size:11px;cursor:pointer;">
        No thanks
      </button>
    </div>`;
    banner.querySelector("[data-ava-accept]")?.addEventListener("click", () => {
      onAccept();
      banner.remove();
      _offerEl = null;
    });
    banner.querySelector("[data-ava-decline]")?.addEventListener("click", () => {
      onDecline();
      banner.remove();
      _offerEl = null;
    });
    document.body.appendChild(banner);
    _offerEl = banner;
  }
  var _pendingAccept = null;
  var _attached = false;
  async function initAddressAutofill(visitorKey, siteUrl, isRepeatVisitor) {
    if (_attached) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const isCheckout = window.location.pathname.includes("checkout") || window.location.pathname.includes("billing") || document.title.toLowerCase().includes("checkout") || !!document.querySelector('[data-page-type="checkout"]');
    if (!isCheckout) {
      const observer = new MutationObserver(() => {
        if (window.location.pathname.includes("checkout") || window.location.pathname.includes("billing")) {
          observer.disconnect();
          _attached = false;
          initAddressAutofill(visitorKey, siteUrl, isRepeatVisitor);
        }
      });
      observer.observe(document.body, { childList: true, subtree: false });
      return;
    }
    _attached = true;
    const tryInit = async () => {
      if (isRepeatVisitor) {
        const saved = await fetchSavedAddress(visitorKey, siteUrl);
        if (saved) {
          const doFill = () => {
            autofillCheckout(saved);
          };
          _pendingAccept = () => {
            doFill();
            _pendingAccept = null;
          };
          showOfferBanner(
            () => {
              doFill();
              _pendingAccept = null;
            },
            () => {
              _pendingAccept = null;
            }
          );
        }
      }
      const form = findCheckoutForm();
      if (form && !form.dataset.avaAutofillAttached) {
        form.dataset.avaAutofillAttached = "1";
        form.addEventListener("submit", () => {
          const captured = captureFromForm();
          if (captured) {
            persistAddress(visitorKey, siteUrl, captured);
          }
        }, { once: false });
      }
    };
    await tryInit();
    setTimeout(tryInit, 500);
  }

  // src/tracker/initializer.ts
  function initShopAssist(config) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    const bridge = new FISMBridge(fullConfig.websocketUrl, fullConfig.sessionId);
    bridge.connect();
    const collector = new BehaviorCollector(bridge, fullConfig.sessionId, fullConfig.userId);
    collector.startCollecting();
    const visitorKey = fullConfig.userId ?? fullConfig.sessionId;
    const siteUrl = fullConfig.siteUrl ?? (typeof window !== "undefined" ? window.location.origin : "");
    const isRepeatVisitor = !!fullConfig.userId;
    initAddressAutofill(visitorKey, siteUrl, isRepeatVisitor).catch(() => {
    });
    return { bridge, collector };
  }

  // src/index.ts
  async function checkActivationGate(serverUrl, siteUrl, siteKey) {
    try {
      const params = new URLSearchParams({ siteUrl });
      if (siteKey) params.set("siteKey", siteKey);
      const url = `${serverUrl}/api/site/status?${params.toString()}`;
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      if (!res.ok) return false;
      const data = await res.json();
      return data.activated === true;
    } catch {
      return false;
    }
  }
  function getOrCreateVisitorId() {
    const KEY = "ava_visitor_id";
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) return stored;
      const id = "vis_" + Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(KEY, id);
      return id;
    } catch {
      return "vis_" + Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  }
  async function init(config) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    if (!fullConfig.sessionId) {
      fullConfig.sessionId = getOrCreateVisitorId();
    }
    if (fullConfig.serverUrl) {
      const effectiveSiteUrl = fullConfig.siteUrl || window.location.origin;
      const activated = await checkActivationGate(
        fullConfig.serverUrl,
        effectiveSiteUrl,
        fullConfig.siteKey
      );
      if (!activated) {
        return { widget: null };
      }
    }
    let hostEl = document.getElementById("ava-widget-root");
    if (!hostEl) {
      hostEl = document.createElement("div");
      hostEl.id = "ava-widget-root";
      document.body.appendChild(hostEl);
    }
    const shadow = hostEl.attachShadow({ mode: "open" });
    const widget = new AVAWidget(shadow, fullConfig);
    widget.mount();
    const { bridge, collector } = initShopAssist(fullConfig);
    bridge.on("intervention", (payload) => {
      widget.handleIntervention(payload);
    });
    widget.onDismiss = (id) => {
      bridge.sendOutcome(id, "dismissed");
    };
    widget.onConvert = (id, action) => {
      bridge.sendOutcome(id, "converted", action);
    };
    widget.onIgnored = (id) => {
      bridge.sendOutcome(id, "ignored");
    };
    widget.onVoiceMuted = (id) => {
      bridge.sendOutcome(id, "voice_muted");
    };
    widget.onFeedback = (id, feedback) => {
      bridge.sendFeedback(id, feedback);
    };
    widget.onMicroOutcome = (id, outcome) => {
      bridge.sendTrackEvent({
        event_type: "micro_outcome",
        friction_id: null,
        raw_signals: { outcome, intervention_id: id }
      });
    };
    widget.onUserMessage = (text) => {
      bridge.sendVoiceQuery(text);
    };
    widget.onUserAction = (action, data) => {
      bridge.sendTrackEvent({
        event_type: "user_action",
        raw_signals: { action, ...data }
      });
    };
    widget.onVoiceQuery = (transcript) => {
      bridge.sendVoiceQuery(transcript);
    };
    bridge.on("voice_query_ack", (data) => {
      widget.handleVoiceQueryAck(data);
    });
    bridge.on("voice_query_error", () => {
      widget.handleVoiceQueryAck({ status: "error" });
    });
    window.__AVA_WIDGET__ = widget;
    window.__AVA_BRIDGE__ = bridge;
    window.__AVA_COLLECTOR__ = collector;
    return { widget };
  }
  window.ShopAssist = { init };
  if (window.__AVA_CONFIG__ || window.ShopAssistConfig) {
    const config = window.__AVA_CONFIG__ || window.ShopAssistConfig;
    init(config).catch(() => {
    });
  }
})();
