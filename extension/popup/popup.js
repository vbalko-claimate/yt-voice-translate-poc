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
  start: document.querySelector("#start"),
  stop: document.querySelector("#stop"),
  status: document.querySelector("#status")
};

function setStatus(text) {
  fields.status.textContent = text;
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
