import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { translateAudioChunk } from "./translator.js";
import { synthesizeSpeech } from "./tts.js";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const server = createServer(handleHttpRequest);
const wss = new WebSocketServer({ server });

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

server.listen(port, host, () => {
  console.log(`yt-voice-translate-poc server listening on ws://${host}:${port}`);
});

server.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

async function handleHttpRequest(request, response) {
  try {
    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method === "POST" && request.url === "/elevenlabs/voices") {
      const body = await readJson(request);
      const voices = await listElevenLabsVoices(body.apiKey);
      sendJson(response, 200, { voices });
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function listElevenLabsVoices(apiKey) {
  if (!apiKey) {
    throw new Error("ElevenLabs API key is required.");
  }

  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: {
      "xi-api-key": apiKey
    }
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs voices returned HTTP ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  return (payload.voices || []).map((voice) => ({
    voiceId: voice.voice_id,
    name: voice.name,
    category: voice.category || "",
    description: voice.description || "",
    previewUrl: voice.preview_url || "",
    labels: voice.labels || {}
  }));
}

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS"
  });
  response.end(statusCode === 204 ? undefined : JSON.stringify(payload));
}
