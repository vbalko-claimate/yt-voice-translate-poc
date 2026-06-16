const fields = {
  serverUrl: document.querySelector("#serverUrl"),
  targetLanguage: document.querySelector("#targetLanguage"),
  originalVolume: document.querySelector("#originalVolume"),
  voiceVolume: document.querySelector("#voiceVolume"),
  start: document.querySelector("#start"),
  stop: document.querySelector("#stop"),
  status: document.querySelector("#status")
};

function setStatus(text) {
  fields.status.textContent = text;
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);

  if (!response?.ok) {
    throw new Error(response?.error || "Unknown extension error.");
  }

  return response;
}

fields.start.addEventListener("click", async () => {
  try {
    setStatus("Starting...");
    await send({
      type: "start",
      serverUrl: fields.serverUrl.value,
      targetLanguage: fields.targetLanguage.value,
      originalVolume: Number(fields.originalVolume.value),
      voiceVolume: Number(fields.voiceVolume.value)
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

