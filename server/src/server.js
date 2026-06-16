import { WebSocketServer } from "ws";
import { translateAudioChunk } from "./translator.js";
import { synthesizeSpeech } from "./tts.js";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const wss = new WebSocketServer({ host, port });

wss.on("connection", (ws) => {
  const state = {
    targetLanguage: "cs",
    mimeType: "audio/webm",
    tts: {}
  };

  ws.on("message", async (data, isBinary) => {
    try {
      if (!isBinary) {
        const message = JSON.parse(data.toString());

        if (message.type === "config") {
          state.targetLanguage = message.targetLanguage || state.targetLanguage;
          state.mimeType = message.mimeType || state.mimeType;
          state.tts = sanitizeTtsConfig(message.tts || {});
          ws.send(JSON.stringify({
            type: "ready",
            state: {
              targetLanguage: state.targetLanguage,
              mimeType: state.mimeType,
              ttsProvider: state.tts.provider || process.env.TTS_PROVIDER || "macos"
            }
          }));
        }

        return;
      }

      const result = await translateAudioChunk({
        audio: Buffer.from(data),
        mimeType: state.mimeType,
        targetLanguage: state.targetLanguage
      });
      const speech = await synthesizeSpeech({
        text: result.text,
        language: state.targetLanguage,
        tts: state.tts
      });

      ws.send(JSON.stringify({
        type: "translation",
        text: result.text,
        speech,
        meta: result.meta
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        type: "error",
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  });
});

function sanitizeTtsConfig(tts) {
  return {
    provider: tts.provider || "",
    elevenLabsApiKey: tts.elevenLabsApiKey || "",
    elevenLabsVoiceId: tts.elevenLabsVoiceId || "",
    elevenLabsModelId: tts.elevenLabsModelId || "",
    elevenLabsOutputFormat: tts.elevenLabsOutputFormat || "",
    elevenLabsStability: tts.elevenLabsStability || "",
    elevenLabsSimilarityBoost: tts.elevenLabsSimilarityBoost || "",
    elevenLabsStyle: tts.elevenLabsStyle || "",
    elevenLabsUseSpeakerBoost: Boolean(tts.elevenLabsUseSpeakerBoost)
  };
}

wss.on("listening", () => {
  console.log(`yt-voice-translate-poc server listening on ws://${host}:${port}`);
});

wss.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
