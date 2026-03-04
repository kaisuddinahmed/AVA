/**
 * SpeechRecognizer — captures mic audio via MediaRecorder and sends it to
 * the Deepgram STT REST API (plain fetch, zero SDK dependency).
 *
 * Usage:
 *   const sr = new SpeechRecognizer(apiKey, { onTranscript: (t) => ... });
 *   await sr.start();   // requests mic permission, starts recording
 *   sr.stop();          // stops recording → auto-transcribes → fires onTranscript
 */

interface SpeechRecognizerCallbacks {
  /** Called with the recognised text once transcription completes. */
  onTranscript: (transcript: string) => void;
  /** Called immediately when recording begins. */
  onRecordingStart?: () => void;
  /** Called when the mic is released (before transcription finishes). */
  onRecordingStop?: () => void;
  /** Called on mic-permission error, network failure, etc. */
  onError?: (error: Error) => void;
}

// Ordered list of MIME types to try — pick the first one the browser supports.
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

function getSupportedMimeType(): string {
  for (const mime of PREFERRED_MIME_TYPES) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return ""; // let the browser decide
}

export class SpeechRecognizer {
  private readonly serverUrl: string;
  private readonly callbacks: SpeechRecognizerCallbacks;

  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private _recording = false;
  private _processing = false;

  /** True while the mic is actively capturing audio. */
  get isRecording(): boolean {
    return this._recording;
  }

  /** True while waiting for Deepgram to return the transcript. */
  get isProcessing(): boolean {
    return this._processing;
  }

  /** True when the user's browser supports the required APIs. */
  static isSupported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      typeof MediaRecorder !== "undefined"
    );
  }

  /**
   * @param serverUrl  Base URL of the AVA server (e.g. "http://localhost:8080").
   *                   STT audio is proxied through `serverUrl/api/voice/sst`.
   */
  constructor(serverUrl: string, callbacks: SpeechRecognizerCallbacks) {
    this.serverUrl = serverUrl.replace(/\/$/, ""); // strip trailing slash
    this.callbacks = callbacks;
  }

  /**
   * Request mic permission and start recording.
   * Throws if permission is denied.
   */
  async start(): Promise<void> {
    if (this._recording || this._processing) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
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
        mimeType ? { mimeType } : undefined,
      );
    } catch {
      // Fallback: let browser use its default mimeType
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

    this.recorder.start(250); // collect chunks every 250 ms
    this._recording = true;
    this.callbacks.onRecordingStart?.();
  }

  /**
   * Stop capturing audio. Transcription runs asynchronously after this.
   */
  stop(): void {
    if (!this._recording || !this.recorder) return;
    this.recorder.stop();
    // _recording is set to false inside onstop (after stream cleanup)
    this.callbacks.onRecordingStop?.();
  }

  // ---- Private ----

  private releaseStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private async transcribe(blob: Blob, mimeType: string): Promise<void> {
    // Determine Content-Type header — strip codec params for the header
    const contentType = mimeType.split(";")[0] || "audio/webm";

    const resp = await fetch(`${this.serverUrl}/api/voice/sst`, {
      method: "POST",
      headers: {
        // Tell the proxy which audio format we're sending — it forwards this to Deepgram
        "Content-Type": "application/octet-stream",
        "X-Audio-Content-Type": contentType,
      },
      body: blob,
    });

    if (!resp.ok) {
      this._processing = false;
      throw new Error(`STT proxy ${resp.status}: ${await resp.text()}`);
    }

    const data = (await resp.json()) as { transcript?: string };

    this._processing = false;

    const transcript = data?.transcript?.trim() ?? "";

    if (transcript) {
      this.callbacks.onTranscript(transcript);
    }
    // If transcript is empty the user said nothing — just silently ignore.
  }
}
