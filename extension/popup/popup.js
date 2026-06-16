const fields = {
  serverUrl: document.querySelector("#serverUrl"),
  targetLanguage: document.querySelector("#targetLanguage"),
  originalVolume: document.querySelector("#originalVolume"),
  voiceVolume: document.querySelector("#voiceVolume"),
  ttsProvider: document.querySelector("#ttsProvider"),
  elevenLabsFields: document.querySelector("#elevenLabsFields"),
  elevenLabsApiKey: document.querySelector("#elevenLabsApiKey"),
  rememberElevenLabsApiKey: document.querySelector("#rememberElevenLabsApiKey"),
  elevenLabsVoiceId: document.querySelector("#elevenLabsVoiceId"),
  elevenLabsModelId: document.querySelector("#elevenLabsModelId"),
  loadElevenLabsVoices: document.querySelector("#loadElevenLabsVoices"),
  start: document.querySelector("#start"),
  stop: document.querySelector("#stop"),
  status: document.querySelector("#status")
};

const STORAGE_KEY = "settings";
const DEFAULT_SETTINGS = {
  serverUrl: "ws://127.0.0.1:8787",
  targetLanguage: "cs",
  originalVolume: 0.2,
  voiceVolume: 1,
  ttsProvider: "",
  elevenLabsVoiceId: "",
  elevenLabsModelId: "eleven_flash_v2_5",
  rememberElevenLabsApiKey: false,
  elevenLabsApiKeyEncrypted: null,
  elevenLabsVoices: []
};

const SECRET_DB_NAME = "yt-voice-translate-secrets";
const SECRET_STORE = "keys";
const ELEVENLABS_KEY_ID = "elevenlabs-api-key";

function setStatus(text) {
  fields.status.textContent = text;
}

function bytesToBase64(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function openSecretDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SECRET_DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(SECRET_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCryptoKey() {
  const db = await openSecretDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SECRET_STORE, "readonly");
    const request = transaction.objectStore(SECRET_STORE).get(ELEVENLABS_KEY_ID);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function writeCryptoKey(key) {
  const db = await openSecretDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SECRET_STORE, "readwrite");
    const request = transaction.objectStore(SECRET_STORE).put(key, ELEVENLABS_KEY_ID);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getCryptoKey() {
  const existing = await readCryptoKey();

  if (existing) {
    return existing;
  }

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  await writeCryptoKey(key);
  return key;
}

async function encryptSecret(value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getCryptoKey();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value)
  );

  return {
    algorithm: "AES-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
}

async function decryptSecret(encrypted) {
  const key = await getCryptoKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(encrypted.iv) },
    key,
    base64ToBytes(encrypted.ciphertext)
  );

  return new TextDecoder().decode(plaintext);
}

async function getStoredSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(result[STORAGE_KEY] || {})
  };
}

async function saveSettings() {
  const rememberElevenLabsApiKey = fields.rememberElevenLabsApiKey.checked;
  const elevenLabsApiKey = fields.elevenLabsApiKey.value.trim();
  const settings = {
    serverUrl: fields.serverUrl.value,
    targetLanguage: fields.targetLanguage.value,
    originalVolume: Number(fields.originalVolume.value),
    voiceVolume: Number(fields.voiceVolume.value),
    ttsProvider: fields.ttsProvider.value,
    elevenLabsVoiceId: fields.elevenLabsVoiceId.value,
    elevenLabsModelId: fields.elevenLabsModelId.value,
    rememberElevenLabsApiKey,
    elevenLabsApiKeyEncrypted: rememberElevenLabsApiKey && elevenLabsApiKey
      ? await encryptSecret(elevenLabsApiKey)
      : null,
    elevenLabsVoices: Array.from(fields.elevenLabsVoiceId.options)
      .filter((option) => option.value)
      .map((option) => ({
        voiceId: option.value,
        label: option.textContent
      }))
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

async function restoreSettings() {
  const settings = await getStoredSettings();

  fields.serverUrl.value = settings.serverUrl;
  fields.targetLanguage.value = settings.targetLanguage;
  fields.originalVolume.value = settings.originalVolume;
  fields.voiceVolume.value = settings.voiceVolume;
  fields.ttsProvider.value = settings.ttsProvider;
  fields.elevenLabsModelId.value = settings.elevenLabsModelId;
  fields.rememberElevenLabsApiKey.checked = Boolean(settings.rememberElevenLabsApiKey);
  setElevenLabsVoiceOptions(settings.elevenLabsVoices, settings.elevenLabsVoiceId);

  if (settings.rememberElevenLabsApiKey && settings.elevenLabsApiKeyEncrypted) {
    fields.elevenLabsApiKey.value = await decryptSecret(settings.elevenLabsApiKeyEncrypted);
  }

  toggleProviderFields();
}

function setElevenLabsVoiceOptions(voices, selectedVoiceId) {
  fields.elevenLabsVoiceId.textContent = "";

  if (!voices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Load voices...";
    fields.elevenLabsVoiceId.append(option);
    return;
  }

  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = voice.voiceId;
    option.textContent = voice.label || voice.name || voice.voiceId;
    fields.elevenLabsVoiceId.append(option);
  }

  fields.elevenLabsVoiceId.value = selectedVoiceId || voices[0].voiceId;
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

    const voices = (payload.voices || []).map((voice) => ({
      voiceId: voice.voiceId,
      label: voiceLabel(voice)
    }));

    if (!voices.length) {
      throw new Error("No ElevenLabs voices found for this API key.");
    }

    setElevenLabsVoiceOptions(voices, fields.elevenLabsVoiceId.value);
    await saveSettings();
    setStatus(`Loaded ${voices.length} voices`);
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

function toggleProviderFields() {
  fields.elevenLabsFields.classList.toggle("visible", fields.ttsProvider.value === "elevenlabs");
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);

  if (!response?.ok) {
    throw new Error(response?.error || "Unknown extension error.");
  }

  return response;
}

for (const field of [
  fields.serverUrl,
  fields.targetLanguage,
  fields.originalVolume,
  fields.voiceVolume,
  fields.ttsProvider,
  fields.rememberElevenLabsApiKey,
  fields.elevenLabsVoiceId,
  fields.elevenLabsModelId
]) {
  field.addEventListener("change", () => {
    toggleProviderFields();
    saveSettings();
  });
}

fields.elevenLabsApiKey.addEventListener("change", () => {
  if (fields.rememberElevenLabsApiKey.checked) {
    saveSettings();
  }
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
    await saveSettings();
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

restoreSettings().catch((error) => {
  setStatus(error.message);
});

fields.stop.addEventListener("click", async () => {
  try {
    await send({ type: "stop" });
    setStatus("Stopped");
  } catch (error) {
    setStatus(error.message);
  }
});
