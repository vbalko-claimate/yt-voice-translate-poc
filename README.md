# YouTube Voice Translate PoC

Chrome extension + local server proof of concept for translated audio overlay on YouTube.

The goal is to validate the hard browser plumbing first:

- capture audio from the active YouTube tab with `chrome.tabCapture`
- stream short audio chunks to a local process over WebSocket
- keep the original tab audio audible through an `AudioContext`
- duck the original audio
- play translated voice output over the video

The current server intentionally uses a mock translator. It receives real audio chunks and sends back text messages. The extension speaks those messages with the browser's `speechSynthesis` API, so the first PoC can run without a multi-GB model or TTS engine.

## Target Architecture

```text
YouTube tab audio
-> Chrome tabCapture
-> WebSocket chunks
-> local server
-> Gemma 4B/12B audio-to-translated-text adapter
-> local or browser TTS
-> translated voice overlay
```

## Quick Start

Install server dependencies:

```bash
npm install
```

Run the local server:

```bash
npm run server
```

Load the extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `extension` directory.
5. Open a YouTube video.
6. Click the extension icon and press Start.

The first version will speak mock Czech voice-over messages whenever audio chunks arrive. That confirms the extension can capture YouTube audio, stream it locally, and play an overlay voice.

## Replacing The Mock With Gemma

Implement the adapter in `server/src/translator.js`.

The intended contract is:

```js
async function translateAudioChunk({ audio, mimeType, targetLanguage }) {
  return { text: "translated text to speak" };
}
```

For a real on-device setup, run Gemma in a local companion process and call it from this adapter. Keep the extension unchanged.

To point the PoC server at a local model runner:

```bash
GEMMA_TRANSLATOR_URL=http://127.0.0.1:8790/translate npm run server
```

The runner endpoint should accept:

```json
{
  "audioBase64": "...",
  "mimeType": "audio/webm;codecs=opus",
  "targetLanguage": "cs"
}
```

and return:

```json
{
  "text": "prelozeny text"
}
```

See `docs/LOCAL_INFERENCE.md` for the intended local inference plan.
