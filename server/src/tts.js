import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function synthesizeSpeech({ text, language, tts = {} }) {
  const provider = tts.provider || process.env.TTS_PROVIDER || "macos";

  if (!text.trim() || provider === "none") {
    return null;
  }

  if (provider === "external") {
    return synthesizeWithExternalProvider({
      text,
      language,
      url: process.env.TTS_URL
    });
  }

  if (provider === "elevenlabs") {
    return synthesizeWithElevenLabs({
      text,
      language,
      tts
    });
  }

  if (provider !== "macos") {
    throw new Error(`Unsupported TTS provider: ${provider}`);
  }

  return synthesizeWithMacOS({
    text,
    voice: voiceForLanguage(language),
    rate: process.env.TTS_RATE || "185"
  });
}

async function synthesizeWithExternalProvider({ text, language, url }) {
  if (!url) {
    throw new Error("TTS_URL is required when TTS_PROVIDER=external.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      text,
      language
    })
  });

  if (!response.ok) {
    throw new Error(`External TTS returned HTTP ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();

  if (!payload.audioBase64 || !payload.mimeType) {
    throw new Error("External TTS response must include audioBase64 and mimeType.");
  }

  return {
    mimeType: payload.mimeType,
    audioBase64: payload.audioBase64,
    meta: {
      provider: "external",
      ...(payload.meta || {})
    }
  };
}

async function synthesizeWithElevenLabs({ text, language, tts }) {
  const apiKey = tts.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
  const voiceId = tts.elevenLabsVoiceId || process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is required when TTS_PROVIDER=elevenlabs.");
  }

  if (!voiceId) {
    throw new Error("ELEVENLABS_VOICE_ID is required when TTS_PROVIDER=elevenlabs.");
  }

  const outputFormat = tts.elevenLabsOutputFormat || process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";
  const modelId = tts.elevenLabsModelId || process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5";
  const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`);
  url.searchParams.set("output_format", outputFormat);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": apiKey
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: elevenLabsVoiceSettings(tts)
    })
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs TTS returned HTTP ${response.status}: ${await response.text()}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());

  return {
    mimeType: mimeTypeForElevenLabsOutput(outputFormat),
    audioBase64: audio.toString("base64"),
    meta: {
      provider: "elevenlabs",
      modelId,
      voiceId,
      outputFormat,
      language,
      bytes: audio.length
    }
  };
}

async function synthesizeWithMacOS({ text, voice, rate }) {
  const dir = await mkdtemp(join(tmpdir(), "yt-voice-translate-"));
  const outputPath = join(dir, "voice.m4a");

  try {
    await execFileAsync("say", [
      "-v",
      voice,
      "-r",
      String(rate),
      "-o",
      outputPath,
      "--data-format",
      "aac",
      text
    ], {
      timeout: Number(process.env.TTS_TIMEOUT_MS || 15000),
      maxBuffer: 1024 * 1024
    });

    const audio = await readFile(outputPath);

    return {
      mimeType: "audio/mp4",
      audioBase64: audio.toString("base64"),
      meta: {
        provider: "macos-say",
        voice,
        bytes: audio.length
      }
    };
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

function voiceForLanguage(language) {
  if (process.env.TTS_VOICE) {
    return process.env.TTS_VOICE;
  }

  const voices = {
    cs: "Zuzana",
    sk: "Laura",
    de: "Anna",
    en: "Samantha"
  };

  return voices[language] || "Zuzana";
}

function elevenLabsVoiceSettings(tts = {}) {
  const settings = {};

  assignNumberSetting(settings, "stability", tts.elevenLabsStability || process.env.ELEVENLABS_STABILITY);
  assignNumberSetting(settings, "similarity_boost", tts.elevenLabsSimilarityBoost || process.env.ELEVENLABS_SIMILARITY_BOOST);
  assignNumberSetting(settings, "style", tts.elevenLabsStyle || process.env.ELEVENLABS_STYLE);

  if (tts.elevenLabsUseSpeakerBoost || process.env.ELEVENLABS_USE_SPEAKER_BOOST) {
    settings.use_speaker_boost = tts.elevenLabsUseSpeakerBoost || process.env.ELEVENLABS_USE_SPEAKER_BOOST === "true";
  }

  return Object.keys(settings).length > 0 ? settings : undefined;
}

function assignNumberSetting(settings, key, value) {
  if (value === undefined || value === "") {
    return;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ElevenLabs voice setting ${key}: ${value}`);
  }

  settings[key] = parsed;
}

function mimeTypeForElevenLabsOutput(outputFormat) {
  if (outputFormat.startsWith("mp3")) {
    return "audio/mpeg";
  }

  if (outputFormat.startsWith("pcm")) {
    return "audio/wav";
  }

  if (outputFormat.startsWith("ulaw")) {
    return "audio/basic";
  }

  return "audio/mpeg";
}
