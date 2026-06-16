import { WebSocketServer } from "ws";
import { translateAudioChunk } from "./translator.js";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const wss = new WebSocketServer({ host, port });

wss.on("connection", (ws) => {
  const state = {
    targetLanguage: "cs",
    mimeType: "audio/webm"
  };

  ws.on("message", async (data, isBinary) => {
    try {
      if (!isBinary) {
        const message = JSON.parse(data.toString());

        if (message.type === "config") {
          state.targetLanguage = message.targetLanguage || state.targetLanguage;
          state.mimeType = message.mimeType || state.mimeType;
          ws.send(JSON.stringify({ type: "ready", state }));
        }

        return;
      }

      const result = await translateAudioChunk({
        audio: Buffer.from(data),
        mimeType: state.mimeType,
        targetLanguage: state.targetLanguage
      });

      ws.send(JSON.stringify({
        type: "translation",
        text: result.text,
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

wss.on("listening", () => {
  console.log(`yt-voice-translate-poc server listening on ws://${host}:${port}`);
});

wss.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
