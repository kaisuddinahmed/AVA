/**
 * voice-proxy.api.ts — server-side proxy for Deepgram TTS and STT.
 *
 * Keeps the DEEPGRAM_API_KEY on the server only.
 * Widget calls these endpoints instead of Deepgram directly.
 *
 * POST /api/voice/tts  — text-to-speech (returns audio/mpeg binary)
 * POST /api/voice/sst  — speech-to-text  (returns { transcript })
 */
import type { Request, Response } from "express";
/**
 * POST /api/voice/tts
 * Body (JSON): { text: string, model?: string }
 * Response: audio/mpeg binary (pipe from Deepgram)
 */
export declare function ttsProxy(req: Request, res: Response): Promise<void>;
/**
 * POST /api/voice/sst
 * Body: raw audio binary (Content-Type preserved from client)
 * Response: { transcript: string }
 */
export declare function sstProxy(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=voice-proxy.api.d.ts.map