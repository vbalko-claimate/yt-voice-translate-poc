import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function synthesizeSpeech({ text, language }) {
  if (!text.trim() || process.env.TTS_PROVIDER === "none") {
    return null;
  }

  if (process.env.TTS_PROVIDER === "external") {
    return synthesizeWithExternalProvider({
      text,
      language,
      url: process.env.TTS_URL
    });
  }

  if (process.env.TTS_PROVIDER && process.env.TTS_PROVIDER !== "macos") {
    throw new Error(`Unsupported TTS_PROVIDER: ${process.env.TTS_PROVIDER}`);
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
