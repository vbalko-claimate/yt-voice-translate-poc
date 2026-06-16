let audioContext;
let mediaStream;
let mediaRecorder;
let socket;
let originalGain;
let speaking = false;
const speechQueue = [];

function getSupportedMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm"
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function captureTabAudio(streamId, originalVolume) {
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(mediaStream);
  originalGain = audioContext.createGain();
  originalGain.gain.value = originalVolume;

  source.connect(originalGain).connect(audioContext.destination);
}

function speakNext(voiceVolume) {
  if (speaking || speechQueue.length === 0) {
    return;
  }

  const text = speechQueue.shift();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "cs-CZ";
  utterance.volume = voiceVolume;
  utterance.rate = 1.05;
  utterance.onend = () => {
    speaking = false;
    speakNext(voiceVolume);
  };
  utterance.onerror = () => {
    speaking = false;
    speakNext(voiceVolume);
  };

  speaking = true;
  speechSynthesis.speak(utterance);
}

function startRecorder(mimeType) {
  mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);

  mediaRecorder.ondataavailable = async (event) => {
    if (event.data.size === 0 || socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(await event.data.arrayBuffer());
  };

  mediaRecorder.start(3000);
}

async function start(message) {
  stop();

  const mimeType = getSupportedMimeType();
  const originalVolume = Number(message.originalVolume ?? 0.2);
  const voiceVolume = Number(message.voiceVolume ?? 1);

  await captureTabAudio(message.streamId, originalVolume);

  socket = new WebSocket(message.serverUrl || "ws://127.0.0.1:8787");
  socket.binaryType = "arraybuffer";

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
      type: "config",
      targetLanguage: message.targetLanguage || "cs",
      mimeType: mimeType || "audio/webm"
    }));
    startRecorder(mimeType);
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);

    if (payload.type === "translation" && payload.text) {
      speechQueue.push(payload.text);
      speakNext(voiceVolume);
    }
  });
}

function stop() {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
  }

  mediaRecorder = undefined;

  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
    socket.close();
  }

  socket = undefined;
  speechSynthesis.cancel();
  speechQueue.length = 0;
  speaking = false;

  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
  }

  mediaStream = undefined;

  if (audioContext) {
    audioContext.close();
  }

  audioContext = undefined;
  originalGain = undefined;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "offscreen-start") {
    start(message);
  }

  if (message.type === "offscreen-stop") {
    stop();
  }
});

