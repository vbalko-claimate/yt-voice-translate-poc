const OFFSCREEN_URL = "offscreen/offscreen.html";

async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)]
  });

  if (existing.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["USER_MEDIA"],
    justification: "Capture and process YouTube tab audio for translated voice overlay."
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  return tab;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "start") {
    (async () => {
      const tab = await getActiveTab();

      if (!tab.url?.includes("youtube.com/watch")) {
        throw new Error("Open a YouTube watch page before starting.");
      }

      await ensureOffscreenDocument();

      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tab.id
      });

      await chrome.runtime.sendMessage({
        type: "offscreen-start",
        streamId,
        serverUrl: message.serverUrl,
        targetLanguage: message.targetLanguage,
        originalVolume: message.originalVolume,
        voiceVolume: message.voiceVolume,
        tts: message.tts
      });

      sendResponse({ ok: true });
    })().catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });

    return true;
  }

  if (message.type === "stop") {
    chrome.runtime.sendMessage({ type: "offscreen-stop" }).finally(() => {
      sendResponse({ ok: true });
    });

    return true;
  }

  return false;
});
