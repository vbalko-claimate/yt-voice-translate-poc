# YouTube Voice Translate PoC

Chrome extension + local server proof of concept for translated audio overlay on YouTube.

The goal is to validate the hard browser plumbing first:

- capture audio from the active YouTube tab with `chrome.tabCapture`
- stream short audio chunks to a local process over WebSocket
- keep the original tab audio audible through an `AudioContext`
- duck the original audio
- play translated voice output over the video

By default the server uses a mock translator. For real local translation, run the Gemma runner in `local-runner/` and point the Node bridge at it with `GEMMA_TRANSLATOR_URL`.

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

Run the local server in mock mode:

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

Mock mode speaks Czech test messages whenever audio chunks arrive. That confirms the extension can capture YouTube audio, stream it locally, and play an overlay voice.

## Real Local Translation

Recommended Q4_0 path:

```bash
brew install llama.cpp
HF_TOKEN=... uv run hf download google/gemma-4-E2B-it-qat-q4_0-gguf gemma-4-E2B_q4_0-it.gguf gemma-4-E2B-it-mmproj.gguf
llama-server \
  --model "$HOME/.cache/huggingface/hub/models--google--gemma-4-E2B-it-qat-q4_0-gguf/snapshots/1894d1fc0a19d86697abd40483f5983c867df03f/gemma-4-E2B_q4_0-it.gguf" \
  --mmproj "$HOME/.cache/huggingface/hub/models--google--gemma-4-E2B-it-qat-q4_0-gguf/snapshots/1894d1fc0a19d86697abd40483f5983c867df03f/gemma-4-E2B-it-mmproj.gguf" \
  --host 127.0.0.1 \
  --port 8791 \
  --ctx-size 4096 \
  --jinja \
  --reasoning off
```

In another terminal, run the Node bridge:

```bash
LLAMA_CPP_URL=http://127.0.0.1:8791 npm run server
```

Then load the extension, open a YouTube video, and press Start. The browser captures YouTube tab audio as 16 kHz mono float32 PCM, sends 3-second chunks to local Gemma Q4_0, and speaks the translated text with browser TTS.

Alternative Hugging Face safetensors path:

Install and run the Gemma runner:

```bash
cd local-runner
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
MODEL_ID=google/gemma-4-E4B-it uvicorn gemma_hf_server:app --host 127.0.0.1 --port 8790
```

In another terminal, run the Node bridge:

```bash
GEMMA_TRANSLATOR_URL=http://127.0.0.1:8790/translate npm run server
```

Gemma model access may require accepting the Hugging Face model license before the first download.

## Replacing The Mock With Gemma

Implement the adapter in `server/src/translator.js`.

The intended contract is:

```js
async function translateAudioChunk({ audio, mimeType, targetLanguage }) {
  return { text: "translated text to speak" };
}
```

For a real on-device setup, run Gemma in a local companion process and call it from this adapter. Keep the extension unchanged.

To point the PoC server at any local model runner:

```bash
GEMMA_TRANSLATOR_URL=http://127.0.0.1:8790/translate npm run server
```

The runner endpoint should accept:

```json
{
  "audioBase64": "...",
  "mimeType": "audio/pcm;rate=16000;channels=1;format=f32le",
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
