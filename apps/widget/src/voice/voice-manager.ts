/**
 * VoiceManager — Phase 1 voice synthesis for AVA widget.
 *
 * Calls Deepgram TTS REST API via plain fetch (zero SDK dependency).
 * Plays audio via HTMLAudioElement.
 * Tracks per-session budget and mute state.
 *
 * Zero external dependencies — required by widget architecture.
 */
export class VoiceManager {
  private _muted = false;
  private _fired = 0;
  private maxPerSession: number;
  private serverUrl: string;
  private model: string;
  private currentAudio: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;

  /**
   * Browser autoplay policy: audio.play() is blocked until the user has
   * interacted with the page (click, keydown, touchstart).
   * _userActivated becomes true on the first such gesture, at which point any
   * pending script is drained.
   */
  private _userActivated = false;
  private _pendingScript: string | null = null;

  /**
   * Called when the user taps mute — receives the intervention_id of the
   * intervention that was playing when mute was triggered.
   * index.ts uses this to send a "voice_muted" outcome to the server.
   */
  private _onMuted?: (interventionId: string) => void;

  constructor(opts: {
    maxPerSession: number;
    /** Base URL of the AVA server (e.g. "http://localhost:8080"). TTS is proxied through it. */
    serverUrl: string;
    deepgramModel?: string;
    onMuted?: (interventionId: string) => void;
  }) {
    this.maxPerSession = opts.maxPerSession;
    this.serverUrl = opts.serverUrl.replace(/\/$/, ""); // strip trailing slash
    this.model = opts.deepgramModel ?? "aura-asteria-en";
    this._onMuted = opts.onMuted;
    this._listenForUserGesture();
  }

  /**
   * Register a one-time listener for the first user gesture.
   * Once activated, drain any pending script immediately.
   */
  private _listenForUserGesture(): void {
    const activate = () => {
      if (this._userActivated) return;
      this._userActivated = true;
      // Drain pending script from the first proactive intervention
      if (this._pendingScript && this.canSpeak) {
        const script = this._pendingScript;
        this._pendingScript = null;
        this._playSpeech(script).catch(() => {});
      }
    };
    // Use capture phase so we hear it even inside shadow DOM
    document.addEventListener("click", activate, { once: true, capture: true });
    document.addEventListener("keydown", activate, { once: true, capture: true });
    document.addEventListener("touchstart", activate, { once: true, capture: true });
  }

  // ── Public getters ──────────────────────────────────────────────────────────

  get isMuted(): boolean {
    return this._muted;
  }

  get isPlaying(): boolean {
    return this.currentAudio !== null;
  }

  /** True only when voice can actually produce audio right now. */
  get canSpeak(): boolean {
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
  async speak(script: string): Promise<void> {
    if (!this.canSpeak) return;

    if (!this._userActivated) {
      // Park the script — it will drain on the next user gesture
      this._pendingScript = script;
      return;
    }

    await this._playSpeech(script);
  }

  /** Internal: fetch TTS audio and play it. Assumes user has already gestured. */
  private async _playSpeech(script: string): Promise<void> {
    try {
      this.stopCurrent();

      const resp = await fetch(`${this.serverUrl}/api/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, model: this.model }),
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
        { once: true },
      );

      audio.addEventListener(
        "error",
        () => {
          URL.revokeObjectURL(url);
          this.currentAudio = null;
          this.currentObjectUrl = null;
        },
        { once: true },
      );

      await audio.play();
    } catch (err) {
      // Non-critical — voice failure must never break the widget
      console.warn("[AVA Voice] TTS error:", err);
      this.currentAudio = null;
      this.currentObjectUrl = null;
    }
  }

  /**
   * Stop audio that is currently playing without muting future voice.
   * Used when an intervention is dismissed.
   */
  stopCurrent(): void {
    this._pendingScript = null; // cancel any queued-but-not-yet-played script
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
  mute(interventionId: string): void {
    this._muted = true;
    this.stopCurrent();
    this._onMuted?.(interventionId);
  }
}
