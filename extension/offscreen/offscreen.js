let audioContext;
let mediaStream;
let pcmProcessor;
let socket;
let originalGain;
let speaking = false;
const speechQueue = [];
const TARGET_SAMPLE_RATE = 16000;
const CHUNK_SECONDS = 3;
const PCM_MIME_TYPE = "audio/pcm;rate=16000;channels=1;format=f32le";
let pcmBuffer = [];
let pcmBufferLength = 0;

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
  pcmProcessor = audioContext.createScriptProcessor(4096, 1, 1);

  pcmProcessor.onaudioprocess = (event) => {
    if (socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    const mono = event.inputBuffer.getChannelData(0);
    const downsampled = downsampleFloat32(mono, audioContext.sampleRate, TARGET_SAMPLE_RATE);
    queuePcm(downsampled);
  };

  source.connect(originalGain).connect(audioContext.destination);
  source.connect(pcmProcessor);
  pcmProcessor.connect(audioContext.destination);
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

function queuePcm(samples) {
  pcmBuffer.push(samples);
  pcmBufferLength += samples.length;

  const chunkSize = TARGET_SAMPLE_RATE * CHUNK_SECONDS;

  while (pcmBufferLength >= chunkSize) {
    const chunk = new Float32Array(chunkSize);
    let offset = 0;

    while (offset < chunkSize) {
      const head = pcmBuffer[0];
      const needed = chunkSize - offset;

      if (head.length <= needed) {
        chunk.set(head, offset);
        offset += head.length;
        pcmBuffer.shift();
        pcmBufferLength -= head.length;
      } else {
        chunk.set(head.subarray(0, needed), offset);
        pcmBuffer[0] = head.subarray(needed);
        pcmBufferLength -= needed;
        offset += needed;
      }
    }

    socket.send(chunk.buffer);
  }
}

function downsampleFloat32(input, inputSampleRate, outputSampleRate) {
  if (inputSampleRate === outputSampleRate) {
    return new Float32Array(input);
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;

    for (let j = start; j < end; j += 1) {
      sum += input[j];
    }

    output[i] = sum / Math.max(1, end - start);
  }

  return output;
}

async function start(message) {
  stop();

  const originalVolume = Number(message.originalVolume ?? 0.2);
  const voiceVolume = Number(message.voiceVolume ?? 1);

  await captureTabAudio(message.streamId, originalVolume);

  socket = new WebSocket(message.serverUrl || "ws://127.0.0.1:8787");
  socket.binaryType = "arraybuffer";

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
      type: "config",
      targetLanguage: message.targetLanguage || "cs",
      mimeType: PCM_MIME_TYPE
    }));
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
  if (pcmProcessor) {
    pcmProcessor.disconnect();
    pcmProcessor.onaudioprocess = null;
  }

  pcmProcessor = undefined;
  pcmBuffer = [];
  pcmBufferLength = 0;

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
