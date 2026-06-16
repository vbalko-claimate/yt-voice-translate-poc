const fields = {
  serverUrl: document.querySelector("#serverUrl"),
  targetLanguage: document.querySelector("#targetLanguage"),
  originalVolume: document.querySelector("#originalVolume"),
  voiceVolume: document.querySelector("#voiceVolume"),
  ttsProvider: document.querySelector("#ttsProvider"),
  elevenLabsFields: document.querySelector("#elevenLabsFields"),
  elevenLabsApiKey: document.querySelector("#elevenLabsApiKey"),
  elevenLabsVoiceId: document.querySelector("#elevenLabsVoiceId"),
  elevenLabsModelId: document.querySelector("#elevenLabsModelId"),
  loadElevenLabsVoices: document.querySelector("#loadElevenLabsVoices"),
  start: document.querySelector("#start"),
  stop: document.querySelector("#stop"),
  status: document.querySelector("#status")
};

function setStatus(text) {
  fields.status.textContent = text;
}

function bridgeHttpUrl(path) {
  const url = new URL(fields.serverUrl.value || "ws://127.0.0.1:8787");
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function voiceLabel(voice) {
  const parts = [voice.name];

  if (voice.category) {
    parts.push(voice.category);
  }

  if (voice.labels?.accent) {
    parts.push(voice.labels.accent);
  }

  return parts.filter(Boolean).join(" - ");
}

async function loadElevenLabsVoices() {
  const apiKey = fields.elevenLabsApiKey.value.trim();

  if (!apiKey) {
    throw new Error("ElevenLabs API key is required.");
  }

  setStatus("Loading voices...");
  fields.loadElevenLabsVoices.disabled = true;

  try {
    const response = await fetch(bridgeHttpUrl("/elevenlabs/voices"), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ apiKey })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || `Voice lookup failed: HTTP ${response.status}`);
    }

    fields.elevenLabsVoiceId.textContent = "";

    for (const voice of payload.voices || []) {
      const option = document.createElement("option");
      option.value = voice.voiceId;
      option.textContent = voiceLabel(voice);
      fields.elevenLabsVoiceId.append(option);
    }

    if (!fields.elevenLabsVoiceId.options.length) {
      throw new Error("No ElevenLabs voices found for this API key.");
    }

    setStatus(`Loaded ${fields.elevenLabsVoiceId.options.length} voices`);
  } finally {
    fields.loadElevenLabsVoices.disabled = false;
  }
}

function getTtsConfig() {
  const provider = fields.ttsProvider.value;

  if (provider !== "elevenlabs") {
    return { provider };
  }

  const elevenLabsApiKey = fields.elevenLabsApiKey.value.trim();
  const elevenLabsVoiceId = fields.elevenLabsVoiceId.value.trim();

  if (!elevenLabsApiKey) {
    throw new Error("ElevenLabs API key is required.");
  }

  if (!elevenLabsVoiceId) {
    throw new Error("ElevenLabs voice ID is required.");
  }

  return {
    provider,
    elevenLabsApiKey,
    elevenLabsVoiceId,
    elevenLabsModelId: fields.elevenLabsModelId.value,
    elevenLabsOutputFormat: "mp3_44100_128"
  };
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);

  if (!response?.ok) {
    throw new Error(response?.error || "Unknown extension error.");
  }

  return response;
}

fields.ttsProvider.addEventListener("change", () => {
  fields.elevenLabsFields.classList.toggle("visible", fields.ttsProvider.value === "elevenlabs");
});

fields.loadElevenLabsVoices.addEventListener("click", async () => {
  try {
    await loadElevenLabsVoices();
  } catch (error) {
    setStatus(error.message);
  }
});

fields.start.addEventListener("click", async () => {
  try {
    setStatus("Starting...");
    await send({
      type: "start",
      serverUrl: fields.serverUrl.value,
      targetLanguage: fields.targetLanguage.value,
      originalVolume: Number(fields.originalVolume.value),
      voiceVolume: Number(fields.voiceVolume.value),
      tts: getTtsConfig()
    });
    setStatus("Running");
  } catch (error) {
    setStatus(error.message);
  }
});

fields.stop.addEventListener("click", async () => {
  try {
    await send({ type: "stop" });
    setStatus("Stopped");
  } catch (error) {
    setStatus(error.message);
  }
});
