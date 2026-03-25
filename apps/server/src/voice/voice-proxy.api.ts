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
import { config } from "../config.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "voice" });

const DEEPGRAM_TTS_URL = "https://api.deepgram.com/v1/speak";
const DEEPGRAM_STT_URL =
  "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en";

/**
 * POST /api/voice/tts
 * Body (JSON): { text: string, model?: string }
 * Response: audio/mpeg binary (pipe from Deepgram)
 */
export async function ttsProxy(req: Request, res: Response): Promise<void> {
  if (!config.voice.deepgramApiKey) {
    res.status(503).json({ error: "TTS not configured" });
    return;
  }

  const { text, model } = req.body as { text?: string; model?: string };
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const voiceModel = model ?? "aura-asteria-en";

  try {
    const upstream = await fetch(
      `${DEEPGRAM_TTS_URL}?model=${encodeURIComponent(voiceModel)}&encoding=mp3`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${config.voice.deepgramApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      },
    );

    if (!upstream.ok) {
      const errText = await upstream.text();
      log.error(`[VoiceProxy] Deepgram TTS error ${upstream.status}: ${errText}`);
      res.status(502).json({ error: "Deepgram TTS failed", status: upstream.status });
      return;
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");

    // Stream the binary response body directly to the client
    const reader = upstream.body!.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    };
    await pump();
  } catch (err) {
    log.error("[VoiceProxy] TTS proxy error:", err);
    if (!res.headersSent) {
      res.status(502).json({ error: "TTS proxy failed" });
    }
  }
}

/**
 * POST /api/voice/sst
 * Body: raw audio binary (Content-Type preserved from client)
 * Response: { transcript: string }
 */
export async function sstProxy(req: Request, res: Response): Promise<void> {
  if (!config.voice.deepgramApiKey) {
    res.status(503).json({ error: "STT not configured" });
    return;
  }

  // req.body is a Buffer (express.raw() applied at route level)
  const audioBuffer = req.body as Buffer;
  if (!audioBuffer || audioBuffer.length === 0) {
    res.status(400).json({ error: "audio body is required" });
    return;
  }

  const contentType =
    (req.headers["x-audio-content-type"] as string) ||
    req.headers["content-type"] ||
    "audio/webm";

  try {
    const upstream = await fetch(DEEPGRAM_STT_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${config.voice.deepgramApiKey}`,
        "Content-Type": contentType,
      },
      body: audioBuffer,
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      log.error(`[VoiceProxy] Deepgram STT error ${upstream.status}: ${errText}`);
      res.status(502).json({ error: "Deepgram STT failed", status: upstream.status });
      return;
    }

    const data = (await upstream.json()) as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{ transcript?: string }>;
        }>;
      };
    };

    const transcript =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";

    res.json({ transcript });
  } catch (err) {
    log.error("[VoiceProxy] STT proxy error:", err);
    res.status(502).json({ error: "STT proxy failed" });
  }
}
